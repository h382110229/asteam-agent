import { ChatMessage, ChatToolCall, GatewayRequestPayload } from '../gateway/gateway-types';
import { UniversalGatewayClient } from '../gateway/gateway-client';
import { CommandInbox } from './command-inbox';
import { ContextCompactor } from './context-compactor';
import { ToolScheduler, ToolExecutionContext } from '../tools/scheduler';
import { artifactVerifier } from '../artifact-verifier';

export type TurnState =
  | 'IDLE'
  | 'THINKING'
  | 'CALLING_TOOLS'
  | 'EXECUTING_TOOLS'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export interface TurnMachineCallbacks {
  onStateChange?: (state: TurnState, metadata?: any) => void;
  onToken?: (token: string, type: 'content' | 'thought') => void;
  onToolStart?: (call: ChatToolCall) => void;
  onToolEnd?: (call: ChatToolCall, output: string, success: boolean) => void;
  onSystemNotice?: (notice: string) => void;
}

export interface TurnMachineOptions {
  maxIterations?: number;
  workspacePath?: string;
  isHostMode?: boolean;
  model: string;
  temperature?: number;
  enabledMcpTools?: string[];
  sessionId?: string;
  onQuestion?: (data: any) => Promise<string>;
}

/**
 * ASTeam 2.0.0 确定性轮次生命周期状态机 (TurnMachine)
 * - 深度融合 ZCode 的核心执行状态模型
 * - 彻底废除 1.x 脆弱单循环与模糊正则匹配
 * - 原生保障: 状态确定性跃迁、协作式插话边界消费、交付物物理探针门禁与智能防假早退自驱动
 */
export class TurnMachine {
  private state: TurnState = 'IDLE';
  private compactor: ContextCompactor;

  constructor(
    private gatewayClient: UniversalGatewayClient,
    private toolScheduler: ToolScheduler,
    private inbox: CommandInbox
  ) {
    this.compactor = new ContextCompactor();
  }

  public getState(): TurnState {
    return this.state;
  }

  private setState(next: TurnState, callbacks?: TurnMachineCallbacks, metadata?: any): void {
    this.state = next;
    callbacks?.onStateChange?.(next, metadata);
  }

  /**
   * 启动一次完整的确定性 Agent 会话循环
   */
  public async runSession(
    initialMessages: ChatMessage[],
    options: TurnMachineOptions,
    callbacks?: TurnMachineCallbacks
  ): Promise<{ summary: string; messages: ChatMessage[]; state: TurnState }> {
    const maxIterations = options.maxIterations || 15;
    let messages: ChatMessage[] = [...initialMessages];
    let iteration = 0;
    let finalSummary = '';
    const trackedArtifacts = new Set<string>();
    const sessionStartTime = Date.now();
    let gateRetries = 0;

    const toolContext: ToolExecutionContext = {
      workspacePath: options.workspacePath || process.cwd(),
      isHostMode: options.isHostMode,
      sessionId: options.sessionId,
      trackedArtifacts,
      registerProcess: (proc) => this.inbox.registerProcess(proc),
      onTerminalData: (chunk) => {
        callbacks?.onToken?.(chunk, 'content');
      },
      onThoughtNotice: (msg) => {
        callbacks?.onToken?.(msg, 'thought');
      },
      onQuestion: options.onQuestion
    };

    const initialUserText = messages.find(m => m.role === 'user')?.content;
    const userTextStr = typeof initialUserText === 'string' ? initialUserText : '';

    const sessionTokens = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };

    while (iteration < maxIterations) {
      iteration++;

      // 1. 检查中断状态
      if (this.inbox.isAborted()) {
        this.setState('ABORTED', callbacks);
        return { summary: '任务已由用户取消。', messages, state: 'ABORTED', tokenStats: sessionTokens };
      }

      // 2. 上下文滑动窗口压缩
      const compactRes = this.compactor.compact(messages);
      messages = compactRes.messages;

      // 3. 进入 THINKING 状态并请求模型
      this.setState('THINKING', callbacks, { iteration, tokenEstimate: compactRes.tokenEstimate });

      const tools = this.toolScheduler.getToolDefinitions(options.enabledMcpTools);
      const payload: GatewayRequestPayload = {
        model: options.model,
        messages,
        stream: true,
        temperature: options.temperature,
        tools: tools.length > 0 ? tools : undefined
      };

      let stepResult;
      try {
        stepResult = await this.gatewayClient.executeChat(
          payload,
          this.inbox.getAbortSignal(),
          {
            onToken: (token, type) => callbacks?.onToken?.(token, type),
            onSystemNotice: (notice) => callbacks?.onSystemNotice?.(notice)
          }
        );
      } catch (err: any) {
        if (this.inbox.isAborted()) {
          this.setState('ABORTED', callbacks);
          return { summary: '任务已终止。', messages, state: 'ABORTED', tokenStats: sessionTokens };
        }
        this.setState('FAILED', callbacks, { error: err.message });
        throw err;
      }

      // 累加本轮 Token 消耗
      if (stepResult.usage) {
        sessionTokens.promptTokens += stepResult.usage.prompt_tokens || 0;
        sessionTokens.completionTokens += stepResult.usage.completion_tokens || 0;
        sessionTokens.totalTokens += stepResult.usage.total_tokens || 0;
      } else {
        const promptEst = compactRes.tokenEstimate || 1000;
        const compEst = Math.ceil(((stepResult.content?.length || 0) + (stepResult.thought?.length || 0)) * 0.75);
        sessionTokens.promptTokens += promptEst;
        sessionTokens.completionTokens += compEst;
        sessionTokens.totalTokens += (promptEst + compEst);
      }

      const hasToolCalls = stepResult.toolCalls && stepResult.toolCalls.length > 0;

      // 4. 分支 A: 模型发起了工具调用 (Tool Execution)
      if (hasToolCalls) {
        this.setState('CALLING_TOOLS', callbacks, { toolCalls: stepResult.toolCalls });

        // 记录助手消息 (包含 tool_calls)
        messages.push({
          role: 'assistant',
          content: stepResult.content || '',
          tool_calls: stepResult.toolCalls
        });

        this.setState('EXECUTING_TOOLS', callbacks);

        for (const call of stepResult.toolCalls) {
          if (this.inbox.isAborted()) break;

          callbacks?.onToolStart?.(call);
          const execRes = await this.toolScheduler.executeToolCall(call, toolContext);
          callbacks?.onToolEnd?.(call, execRes.output, execRes.success);

          let toolOutput = execRes.output;
          // 严格防止超长工具输出（如 dir /s、巨型日志、大文件内容）导致多轮会话 Token 膨胀并卡死模型
          const MAX_TOOL_OUTPUT_CHARS = 4000;
          if (typeof toolOutput === 'string' && toolOutput.length > MAX_TOOL_OUTPUT_CHARS) {
            const head = toolOutput.slice(0, 2500);
            const tail = toolOutput.slice(-1000);
            const omitted = toolOutput.length - 3500;
            toolOutput = `${head}\n\n... [ASTeam 2.0 自动截断: 省略 ${omitted} 字符过长输出以优化上下文，完整输出已在前端终端正常呈现] ...\n\n${tail}`;
          }

          // 严格推入 tool 响应消息 (符合 OpenAI 协议规范)
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: toolOutput
          });
        }

        // 进入 EVALUATING 评估阶段并消费 Steering 插话
        this.setState('EVALUATING', callbacks);
        const steering = this.inbox.consumeSteering();
        if (steering) {
          callbacks?.onSystemNotice?.(`\n> 💡 **[实时协作插话已注入]** ${steering}\n`);
          messages.push({ role: 'user', content: steering });
        }

        // 继续下一轮循环
        continue;
      }

      // 5. 分支 B: 模型输出了最终文本答复 (No Tool Calls)
      finalSummary = stepResult.content.trim() || stepResult.thought.trim();
      messages.push({ role: 'assistant', content: stepResult.content });

      this.setState('EVALUATING', callbacks);

      // (1) 消费可能刚到达的 Steering 修正
      const steering = this.inbox.consumeSteering();
      if (steering) {
        callbacks?.onSystemNotice?.(`\n> 💡 **[实时协作插话已注入]** ${steering}\n`);
        messages.push({ role: 'user', content: steering });
        continue;
      }

      // (2) 触发 ASTeam 交付制品物理探针与硬契约门禁 (Delivery Verification Gate)
      const gateReport = artifactVerifier.inspectDeliveryGate(
        finalSummary,
        sessionStartTime,
        trackedArtifacts,
        options.workspacePath,
        userTextStr
      );

      if (!gateReport.passed) {
        gateRetries++;
        if (gateRetries <= 2) {
          callbacks?.onToken?.(`\n\n🛡️ **[物理探针硬门禁拦截]** 侦测到交付制品未物理落盘，已拦截口头回复并驱动自愈重试...\n`, 'thought');
          callbacks?.onSystemNotice?.(`🛡️ 物理门禁拦截：未检测到物理落盘产物，正在重新驱动底层工具执行 (第 ${gateRetries} 次自愈重试)...`);
          messages.push({
            role: 'user',
            content: gateReport.blockingMessage || '【物理探针门禁拦截】交付物物理落盘校验失败，请立即调用工具完成实际文件生成！'
          });
          continue;
        } else {
          finalSummary += `\n\n⚠️ **【交付制品物理探针提示】** 底层未能检测到有效落盘交付物。已如实反馈异常，杜绝纯文本口头交付。`;
        }
      } else if (gateReport.badges && gateReport.badges.length > 0) {
        const badgeBlock = `\n\n---\n### 🛡️ 交付制品物理探针验收报告\n${gateReport.badges.join('\n\n')}`;
        finalSummary += badgeBlock;
        callbacks?.onToken?.(badgeBlock, 'content');
      }

      // (3) 内核自驱动判定: 识别明显的未完成准备短句（彻底根治口头答应假执行）
      const trimmed = finalSummary.trim();
      const hasExecutedAnyTool = trackedArtifacts.size > 0 || messages.some(m => m.role === 'tool');
      const isActionRequested = /(?:查看|列出|有哪些|检索|扫描|分析|检查|查找|生成|创建|修改|统计|读取)/i.test(userTextStr);
      const isTransitionStatement = (
        trimmed.length < 300 && (
          /^(?:我先|我来|我现在|首先|准备|正在|接下来|好的|没问题)/.test(trimmed) ||
          /(?:开始执行|执行计划|先查看|先列出|现在开始)/.test(trimmed)
        )
      );

      if (!hasExecutedAnyTool && isActionRequested && isTransitionStatement && iteration <= 2) {
        callbacks?.onToken?.(`\n\n⚙️ **[内核自驱动唤醒]** 检测到当前仅输出了准备意图，尚未实际调用工具获取数据。正在强制驱动工具执行...\n`, 'thought');
        callbacks?.onSystemNotice?.(`⚙️ 内核自驱动唤醒：检测到准备意图，正在强制驱动工具执行生成交付物...`);
        messages.push({
          role: 'user',
          content: '【内核自驱动执行要求】你刚才仅给出了说明意图，并未实际调用工具！请立即通过 tools 工具调用获取真实数据或生成文件，严禁只输出说明文本！'
        });
        continue;
      }

      // 正常交付完成
      const verifiedList = gateReport.checkedArtifacts?.filter(a => a.verified) || [];
      this.setState('COMPLETED', callbacks, { finalSummary, tokenStats: sessionTokens, artifacts: verifiedList });
      return {
        summary: finalSummary,
        messages,
        state: 'COMPLETED',
        tokenStats: sessionTokens,
        artifacts: verifiedList
      };
    }

    // 达到最大轮次
    this.setState('COMPLETED', callbacks, { finalSummary, tokenStats: sessionTokens });
    return {
      summary: finalSummary || '任务已达最大迭代轮次限制并安全退出。',
      messages,
      state: 'COMPLETED',
      tokenStats: sessionTokens,
      artifacts: []
    };
  }
}
