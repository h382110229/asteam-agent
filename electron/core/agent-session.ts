import { CommandInbox } from './command-inbox';
import { TurnMachine, TurnMachineCallbacks, TurnState } from './turn-machine';
import { UniversalGatewayClient } from '../gateway/gateway-client';
import { ToolScheduler, toolScheduler } from '../tools/scheduler';
import { ChatMessage, ContentPart } from '../gateway/gateway-types';
import { storageHub } from '../storage-hub';
import { memoryManager } from '../memory-manager';
import { rulesManager } from '../rules-manager';
import { skillManager } from '../skill-manager';
import fs from 'node:fs';
import path from 'node:path';

export interface AgentSessionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  stream?: boolean;
  temperature?: number;
  workspacePath?: string | null;
  enabledMcpTools?: string[];
  enabledSkills?: string[];
  executionMode?: 'auto_edit' | 'plan_only' | 'safe_approval' | 'swarm';
  bypassSecurityFence?: boolean;
  sessionId?: string;
  onQuestion?: (data: any) => Promise<string>;
}

export interface AgentSessionCallbacks {
  onToken: (token: string, type: 'content' | 'thought') => void;
  onPlan?: (steps: any[]) => void;
  onStateChange?: (state: TurnState, metadata?: any) => void;
  onTerminalData?: (chunk: string) => void;
  onStatus?: (status: string) => void;
}

/**
 * ASTeam 2.0.0 单会话运行时容器 (AgentSession)
 * 聚合 CommandInbox, TurnMachine, UniversalGatewayClient 与 ToolScheduler，
 * 为上层提供极简、安全、线程安全的 Agent 会话生命周期控制。
 */
export class AgentSession {
  private inbox: CommandInbox;
  private gatewayClient: UniversalGatewayClient;
  private scheduler: ToolScheduler;
  private turnMachine: TurnMachine;
  private config: AgentSessionConfig;
  private historyMessages: ChatMessage[] = [];

  constructor(config: AgentSessionConfig) {
    this.config = config;
    this.inbox = new CommandInbox();
    this.gatewayClient = new UniversalGatewayClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      defaultModel: config.model
    });
    this.scheduler = toolScheduler;
    this.turnMachine = new TurnMachine(this.gatewayClient, this.scheduler, this.inbox);
  }

  public updateConfig(patch: Partial<AgentSessionConfig>): void {
    this.config = { ...this.config, ...patch };
    this.gatewayClient.updateConfig({
      baseUrl: patch.baseUrl,
      apiKey: patch.apiKey,
      defaultModel: patch.model
    });
  }

  /**
   * 压入协作式插话引导 (Steering Message)
   */
  public enqueueSteering(message: string): void {
    this.inbox.enqueueSteering(message);
  }

  /**
   * 触发显式硬打断 (Hard Abort)
   */
  public abort(reason: string = '已由用户取消。'): void {
    this.inbox.triggerAbort(reason);
  }

  public isAborted(): boolean {
    return this.inbox.isAborted();
  }

  public getInbox(): CommandInbox {
    return this.inbox;
  }

  /**
   * 执行单次用户指令
   */
  public async execute(
    userPrompt: string,
    callbacks: AgentSessionCallbacks,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>
  ): Promise<{ summary: string; state: TurnState }> {
    // 组装当前用户诉求 (严防 undefined)
    const safePrompt = typeof userPrompt === 'string'
      ? userPrompt
      : ((userPrompt as any)?.content ?? (userPrompt as any)?.text ?? String(userPrompt || ''));

    // 1. 构建系统 Prompt (支持技能自动感知与规约注入)
    const systemPrompt = this.buildSystemPrompt(safePrompt);

    // 2. 构造消息队列
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    // 恢复历史对话（取最近 4 条防超限）
    if (history && history.length > 0) {
      const recentHistory = history.slice(-4);
      for (const h of recentHistory) {
        const textContent = (h as any).content ?? (h as any).text ?? '';
        messages.push({
          role: h.role,
          content: typeof textContent === 'string' ? textContent : String(textContent || '')
        });
      }
    }

    const userMessageContent = this.assembleUserContent(safePrompt);
    messages.push({
      role: 'user',
      content: userMessageContent
    });

    const turnCallbacks: TurnMachineCallbacks = {
      onStateChange: (state, metadata) => {
        callbacks.onStateChange?.(state, metadata);
        callbacks.onStatus?.(this.formatStatus(state));
      },
      onToken: (token, type) => callbacks.onToken(token, type),
      onSystemNotice: (notice) => callbacks.onToken(notice, 'thought')
    };

    const result = await this.turnMachine.runSession(
      messages,
      {
        model: this.config.model,
        temperature: this.config.temperature,
        workspacePath: this.config.workspacePath || undefined,
        enabledMcpTools: this.config.enabledMcpTools,
        sessionId: this.config.sessionId,
        onQuestion: this.config.onQuestion
      },
      turnCallbacks
    );

    this.historyMessages = result.messages;
    return {
      summary: result.summary,
      state: result.state,
      tokenStats: result.tokenStats
    };
  }

  private formatStatus(state: TurnState): string {
    switch (state) {
      case 'THINKING': return '🧠 深度思考与意图推演中...';
      case 'CALLING_TOOLS': return '⚙️ 规划工具调用序列...';
      case 'EXECUTING_TOOLS': return '⚡ 调度执行系统工具...';
      case 'EVALUATING': return '🛡️ 状态评估与物理探针验证...';
      case 'COMPLETED': return '✅ 任务已就绪交付';
      case 'FAILED': return '❌ 执行遇到异常';
      case 'ABORTED': return '🛑 任务已取消';
      default: return '就绪';
    }
  }

  private assembleUserContent(userPrompt: string | undefined | null): string | ContentPart[] {
    if (!userPrompt || typeof userPrompt !== 'string') {
      return typeof userPrompt === 'string' ? userPrompt : '';
    }

    // 检查是否包含本地图片或 Base64
    const hasDataImage = userPrompt.includes('data:image/');
    const hasFileImage = userPrompt.includes('file:///') && /\.(?:png|jpe?g|webp|gif)/i.test(userPrompt);

    if (!hasDataImage && !hasFileImage) {
      return userPrompt;
    }

    const parts: ContentPart[] = [];
    let textOnly = userPrompt;

    // 抽取 data:image/ Base64
    const base64Regex = /!\[([^\]]*)\]\((data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+)\)/g;
    let b64Match: RegExpExecArray | null;
    while ((b64Match = base64Regex.exec(userPrompt)) !== null && parts.length < 5) {
      parts.push({
        type: 'image_url',
        image_url: { url: b64Match[2], detail: 'high' }
      });
    }

    // 抽取本地 file:/// 并转 Base64
    if (parts.length < 5 && hasFileImage) {
      const fileRegex = /!\[([^\]]*)\]\(file:\/\/\/([^\)]+)\)/g;
      let fileMatch: RegExpExecArray | null;
      while ((fileMatch = fileRegex.exec(userPrompt)) !== null && parts.length < 5) {
        let localDiskPath = decodeURIComponent(fileMatch[2]);
        if (/^\/[a-zA-Z]:/.test(localDiskPath)) {
          localDiskPath = localDiskPath.slice(1);
        }
        if (fs.existsSync(localDiskPath)) {
          try {
            const buf = fs.readFileSync(localDiskPath);
            const ext = path.extname(localDiskPath).toLowerCase();
            let mime = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
            else if (ext === '.webp') mime = 'image/webp';
            else if (ext === '.gif') mime = 'image/gif';

            parts.push({
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${buf.toString('base64')}`, detail: 'high' }
            });
          } catch {}
        }
      }
    }

    if (parts.length === 0) return userPrompt;

    textOnly = textOnly.replace(/!\[([^\]]*)\]\((?:data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+|file:\/\/\/[^\)]+)\)/g, '(多模态图像已挂载)');
    return [
      { type: 'text', text: textOnly },
      ...parts
    ];
  }

  private buildSystemPrompt(userPromptText?: string): string {
    const memory = memoryManager.getMemoryContent?.() || '';
    const rules = this.config.workspacePath ? rulesManager.getProjectRules?.(this.config.workspacePath) : '';

    // 1. 动态感知已启用或在当前提示词中被直接点名的技能 (Skill Auto-Activation)
    const activeSkillIds = new Set<string>(this.config.enabledSkills || []);
    if (userPromptText) {
      try {
        const allSkills = skillManager.getAllAvailableSkills(this.config.workspacePath || null);
        const userLower = userPromptText.toLowerCase();
        const userNorm = userLower.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
        for (const skill of allSkills) {
          const cleanId = skill.id.replace(/^custom:(?:global|workspace|extra):/, '').toLowerCase();
          const cleanIdNorm = cleanId.replace(/[^a-z0-9]/g, '');
          const cleanName = (skill.rawFrontmatter?.name || skill.name).replace(/^\[.*?\]\s*/, '').toLowerCase();
          const cleanNameNorm = cleanName.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
          const triggers = (skill.triggers || []).map(t => t.toLowerCase());

          const isMentioned =
            userLower.includes(cleanId) ||
            (cleanIdNorm.length >= 3 && userNorm.includes(cleanIdNorm)) ||
            userLower.includes(cleanName) ||
            (cleanNameNorm.length >= 3 && userNorm.includes(cleanNameNorm)) ||
            triggers.some(t => {
              const tNorm = t.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
              return (t.length >= 2 && userLower.includes(t)) || (tNorm.length >= 2 && userNorm.includes(tNorm));
            });

          if (isMentioned) {
            activeSkillIds.add(skill.id);
          }
        }
      } catch (err) {
        console.warn('[AgentSession] Error during skill auto-activation scan:', err);
      }
    }

    // 2. 聚合激活技能的完整规约、物理脚本路径与推荐工具绑定
    let skillPrompts = '';
    try {
      skillPrompts = skillManager.getAggregatedSkillPrompt(
        Array.from(activeSkillIds),
        this.config.workspacePath || null
      );
    } catch (err) {
      console.warn('[AgentSession] Error aggregating skill prompts:', err);
    }

    return [
      `你是由 ASteam 打造的工业级全能智能工程师 Agent (ASTeam Agent 2.0.2)。`,
      `你的底层基于 ASTeam 自研工业级 Harness 确定性状态机与企业级通用 OpenAI 协议网关驱动，同时胜任 **“Coding 研发交付”** 与 **“日常复杂办公 (Office 多模态拓扑图审图、文档结构化生成、合规审计)”**。`,
      '',
      `### 核心行动准则:`,
      `1. **杜绝假执行与纯文本空谈**：用户要求查看、扫描、修改或生成文件时，必须立即调用系统提供的工具函数真实执行！严禁口头回复“好的，我先查看...”却不调用工具。`,
      `2. **Office 多模态金字塔感知**：当分析 Word/PPT 文档时，先通读原位图纸资产清单 (Level 0) 与复合全景切片 (Level 1)；若需深入审计特定架构图，主动调用 inspect_image_detail 工具查看超高清细节。`,
      `3. **物理探针验收保障**：生成交付物（代码、Word、Excel、PDF）时必须确保物理文件真正写入磁盘，否则将触发底层门禁拦截。`,
      `4. **交互式决策与 Grill-me 规范 (硬性要求)**：在面临方案分歧、关键架构选型、需求确认或发起多轮 Grill-me 审讯时，【必须】调用 \`ask_question\` 工具下发结构化问题卡片，系统将暂停并等待用户在 UI 交互界面完成选择！【严禁】直接在 Markdown 文本中输出一长串纯文本问题让用户手动打字回复！`,
      `5. **技能驱动与脚本执行硬规约 (Skill Execution Contract)**：当激活了复合型技能或用户明确指定使用技能处理文档时，【必须】使用 \`run_terminal_command\` 工具调用技能目录下对应的 Python 脚本绝对路径进行真实处理！严禁空谈理论或仅给出文字解释！执行脚本生成的交付物（.xlsx, .txt, .cfg, .docx 等）必须真实落盘到本地目录。`,
      '',
      this.config.workspacePath ? `当前工作区根目录: \`${this.config.workspacePath}\`` : `当前模式: 宿主系统直连模式`,
      memory ? `\n### 长期记忆:\n${memory}` : '',
      rules ? `\n### 工程规范约束:\n${rules}` : '',
      skillPrompts ? `\n### 当前会话已挂载/激活的专属技能 (Active Skills & Physical Contracts):${skillPrompts}` : ''
    ].filter(Boolean).join('\n');
  }
}
