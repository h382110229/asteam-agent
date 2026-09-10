import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  AgentConfig,
  ChatMessage,
  AgentEventCallbacks,
  AgentStep,
  WorkspaceTools,
  callLLMStream,
  extractToolCall,
  parseToolArgs,
  getSystemDesktopDir
} from './harness-runner';
import { SwarmMessageBus } from './swarm-bus';
import { SwarmAgentRole, SwarmState, SwarmSubTask } from './swarm-types';
import { ElasticWorkerPool, WorkerTaskJob } from './swarm-worker-pool';
import { checkpointManager } from './checkpoint-manager';
import { rulesManager } from './rules-manager';
import { memoryManager } from './memory-manager';
import { mcpManager } from './mcp-manager';

export class SwarmOrchestrator {
  private bus: SwarmMessageBus;
  private workerPool: ElasticWorkerPool;
  private sessionId: string;
  private config: AgentConfig;
  private history: ChatMessage[];
  private callbacks: AgentEventCallbacks;
  private abortSignal: AbortSignal;
  private effectiveWorkspace: string;
  private hasWorkspace: boolean;
  private tools: WorkspaceTools;

  constructor(
    sessionId: string,
    config: AgentConfig,
    history: ChatMessage[],
    callbacks: AgentEventCallbacks,
    abortSignal: AbortSignal,
    effectiveWorkspace: string,
    hasWorkspace: boolean
  ) {
    this.sessionId = sessionId;
    this.config = config;
    this.history = history;
    this.callbacks = callbacks;
    this.abortSignal = abortSignal;
    this.effectiveWorkspace = effectiveWorkspace;
    this.hasWorkspace = hasWorkspace;

    this.bus = new SwarmMessageBus(sessionId);
    this.workerPool = new ElasticWorkerPool(this.bus, 3);

    // Register state updates to notify frontend
    this.bus.onStateUpdate((state: SwarmState) => {
      this.callbacks.onSwarmState?.(state);
    });

    this.tools = new WorkspaceTools(
      effectiveWorkspace,
      !hasWorkspace,
      (targetFile) => {
        if (hasWorkspace) {
          checkpointManager.recordFileModification(sessionId, effectiveWorkspace, targetFile);
          const currentCkpt = checkpointManager.getOrCreateTurnCheckpoint(sessionId, effectiveWorkspace, '蜂群研发修改快照');
          callbacks.onCheckpoint?.(currentCkpt);
        }
      },
      config
    );
  }

  public getBus(): SwarmMessageBus {
    return this.bus;
  }

  public async executePipeline(): Promise<string> {
    const userMessage = [...this.history].reverse().find(m => m.role === 'user')?.content || '协助进行系统架构与代码开发';

    // Broadcast initial state
    this.callbacks.onSwarmState?.(this.bus.getState());
    this.bus.postMessage({
      fromRole: 'system',
      toRole: 'all',
      type: 'system_notice',
      content: `[Swarm 启动] 蜂群多智能体协同引擎已激活，当前会话: ${this.sessionId}`
    });

    // Notify plan steps to main UI
    const macroSteps: AgentStep[] = [
      { id: 'swarm-step-1', title: '🎯 Architect: 架构规划与分工拆解', status: 'pending' },
      { id: 'swarm-step-2', title: '💻 Coder: 核心研发实现与文件修改', status: 'pending' },
      { id: 'swarm-step-3', title: '🧪 Tester: 自动化质量检验与测试验证', status: 'pending' },
      { id: 'swarm-step-4', title: '🛡️ Reviewer: 项目规约与代码安全审计', status: 'pending' },
      { id: 'swarm-step-5', title: '📦 Architect: 交付成果归纳与全景总结', status: 'pending' }
    ];
    this.callbacks.onPlan(macroSteps);

    // Phase 1: Planning with Architect
    macroSteps[0].status = 'running';
    this.callbacks.onStepUpdate({ ...macroSteps[0] });
    const tasks = await this.runArchitectPlanning(userMessage);
    macroSteps[0].status = 'completed';
    this.callbacks.onStepUpdate({ ...macroSteps[0] });

    if (this.abortSignal.aborted) throw new Error('任务已被用户取消');

    // Phase 2: Coder execution
    macroSteps[1].status = 'running';
    this.callbacks.onStepUpdate({ ...macroSteps[1] });
    const coderOutputs = await this.runCoderExecution(tasks.filter(t => t.role === 'coder'), userMessage);
    macroSteps[1].status = 'completed';
    this.callbacks.onStepUpdate({ ...macroSteps[1] });

    if (this.abortSignal.aborted) throw new Error('任务已被用户取消');

    // Phase 3: Tester verification
    macroSteps[2].status = 'running';
    this.callbacks.onStepUpdate({ ...macroSteps[2] });
    const testerOutputs = await this.runTesterVerification(tasks.filter(t => t.role === 'tester'), userMessage, coderOutputs);
    macroSteps[2].status = 'completed';
    this.callbacks.onStepUpdate({ ...macroSteps[2] });

    if (this.abortSignal.aborted) throw new Error('任务已被用户取消');

    // Phase 4: Reviewer audit
    macroSteps[3].status = 'running';
    this.callbacks.onStepUpdate({ ...macroSteps[3] });
    const reviewerReport = await this.runReviewerAudit(tasks.filter(t => t.role === 'reviewer'), coderOutputs, testerOutputs);
    macroSteps[3].status = 'completed';
    this.callbacks.onStepUpdate({ ...macroSteps[3] });

    if (this.abortSignal.aborted) throw new Error('任务已被用户取消');

    // Phase 5: Architect final consolidation
    macroSteps[4].status = 'running';
    this.callbacks.onStepUpdate({ ...macroSteps[4] });
    const finalReport = await this.runArchitectSummary(userMessage, coderOutputs, testerOutputs, reviewerReport);
    macroSteps[4].status = 'completed';
    this.callbacks.onStepUpdate({ ...macroSteps[4] });

    this.bus.setPhase('completed');
    this.bus.setActiveRole(null);
    this.bus.setSummary(finalReport);
    this.bus.postMessage({
      fromRole: 'architect',
      toRole: 'all',
      type: 'approval',
      content: '[Swarm 闭环] 所有角色子任务已完成协同验证，全景成果已汇总交付。'
    });

    return finalReport;
  }

  private async runArchitectPlanning(userPrompt: string): Promise<SwarmSubTask[]> {
    this.bus.setPhase('planning');
    this.bus.setActiveRole('architect');
    this.bus.setAgentStatus('architect', 'thinking', { taskTitle: '正在分析全局架构并拆解子任务' });

    this.callbacks.onToken(`\n\n### 🎯 【Architect 架构主控】任务拆解与协同拓扑制定\n`, 'thought');

    const rulesPrompt = rulesManager.assembleRulesPrompt(this.effectiveWorkspace);
    const memoryPrompt = memoryManager.assembleMemoryContext(this.effectiveWorkspace);

    const planningPrompt = `你现在是多智能体协同集群（Swarm）的【Architect 架构主控与编排师】。
你的职责是深入剖析用户的核心诉求，检视工作区，将复杂目标拆解为有明确分工的子任务（SubTasks）：
- Coder (研发工程师)：负责具体代码编写、修改、重构、新建脚本或配置；
- Tester (测试工程师)：负责测试用例设计、执行终端测试命令（如 npm test, tsc, 编译校验）或编写验证脚本；
- Reviewer (代码审计专家)：负责检查代码是否严格遵循规范（.asteamrules、类型安全、架构整洁性）、寻找潜在缺陷与坏味道。

${rulesPrompt}
${memoryPrompt}

【用户输入诉求】
${userPrompt}

【输出规范】
请先简明阐述你的架构思考（2~3句话），随后必须提供格式化的子任务派发清单：
\`\`\`tasks_plan
[
  {"role": "coder", "title": "核心代码实现与必要文件修改", "input": "详细具体指引..."},
  {"role": "tester", "title": "自动化测试与语法/构建验证", "input": "详细测试验证指引..."},
  {"role": "reviewer", "title": "代码规约合规与安全漏洞审查", "input": "详细审计重点..."}
]
\`\`\`
请确保至少派发 1 个 coder 任务、1 个 tester 任务和 1 个 reviewer 任务。`;

    let planRaw = '';
    await callLLMStream(
      this.config,
      [
        { role: 'system', content: '你是严谨专业的系统架构总师，负责全局任务拆解与多智能体分工协同。' },
        { role: 'user', content: planningPrompt }
      ],
      this.abortSignal,
      (token, type) => {
        planRaw += token;
        this.callbacks.onToken(token, type || 'thought');
      }
    );

    this.bus.setAgentStatus('architect', 'completed', { taskTitle: '架构拆解完毕' });

    // Parse tasks_plan block
    let parsedTasks: Array<{ role: SwarmAgentRole; title: string; input: string }> = [];
    const planBlockMatch = planRaw.match(/```(?:tasks_plan|json)?\s*([\s\S]*?)```/i);
    if (planBlockMatch) {
      try {
        const jsonStr = planBlockMatch[1].trim();
        const start = jsonStr.indexOf('[');
        const end = jsonStr.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          parsedTasks = JSON.parse(jsonStr.slice(start, end + 1));
        }
      } catch (err) {
        console.warn('[SwarmOrchestrator] Failed to parse tasks_plan JSON:', err);
      }
    }

    if (parsedTasks.length === 0) {
      // Robust Fallback tasks
      parsedTasks = [
        {
          role: 'coder',
          title: '核心研发功能实现与代码编写',
          input: `根据用户诉求「${userPrompt.slice(0, 100)}」编写或更新代码文件，确保逻辑闭环。`
        },
        {
          role: 'tester',
          title: '构建完整性校验与自动化测试巡检',
          input: `对 Coder 提交的代码进行测试验证、类型检查或语法扫描。`
        },
        {
          role: 'reviewer',
          title: '项目规约遵循度与代码安全审计',
          input: `检查修改是否遵循工程规约，严禁隐式 any，评估安全与可维护性。`
        }
      ];
    }

    const createdTasks: SwarmSubTask[] = [];
    let idx = 1;
    for (const pt of parsedTasks) {
      const task = this.bus.dispatchTask({
        id: `task-${idx++}`,
        role: pt.role || 'coder',
        title: pt.title || '子任务',
        input: pt.input || ''
      });
      createdTasks.push(task);
    }

    this.bus.postMessage({
      fromRole: 'architect',
      toRole: 'all',
      type: 'discussion',
      content: `[Architect] 任务规划已就绪，共拆解 ${createdTasks.length} 个协同子任务。`
    });

    return createdTasks;
  }

  private async runCoderExecution(tasks: SwarmSubTask[], userPrompt: string): Promise<string> {
    this.bus.setPhase('executing');
    this.bus.setActiveRole('coder');
    this.bus.setAgentStatus('coder', 'thinking', { taskTitle: '准备执行开发实现' });

    this.callbacks.onToken(`\n\n### 💻 【Coder 全栈研发集群】弹性并行执行 (Worker Pool)\n`, 'thought');

    const rulesPrompt = rulesManager.assembleRulesPrompt(this.effectiveWorkspace);
    const mcpPrompts = mcpManager.getEnabledToolPrompts(this.config.enabledMcpTools || ['web_search', 'web_fetch', 'git_operations']);

    // 构建弹性 Worker 任务队列
    const coderJobs: WorkerTaskJob[] = tasks.map((task, idx) => {
      const workerName = `Coder-Worker-${idx + 1}`;
      return {
        task,
        workerName,
        executor: async (worker, updateProgress) => {
          this.callbacks.onToken(`\n\n> ⚡ **${workerName} 开始并发处理: ${task.title}**\n`, 'thought');
          updateProgress(20, 'running');

          const coderSystemPrompt = `你是由 ASteam 打造的多智能体协同集群（Swarm）专属【Coder 全栈核心研发子智能体 (${workerName})】。
你专注于高质量代码实现、文件修改与工程构建。
你必须调用工具来实际读取和写入文件，严禁凭空宣称已修改！

【工作区路径】
- 当前工作区: ${this.effectiveWorkspace}
- 操作系统平台: ${process.platform === 'win32' ? 'Windows' : process.platform}

${rulesPrompt}
${mcpPrompts ? `【可用的 MCP 扩展工具】\n${mcpPrompts}\n` : ''}

【可用工具调用协议】
1. view_file: 查看文件内容或列出目录。格式：\`\`\`tool:view_file\n{"filePath": "路径"}\n\`\`\`
2. write_file: 写入/更新文件内容。格式：\`\`\`tool:write_file\n{"filePath": "路径", "content": "代码内容"}\n\`\`\`
3. list_directory: 列出目录项。格式：\`\`\`tool:list_directory\n{"relPath": "."}\n\`\`\`
4. run_terminal_command: 执行本地终端命令。格式：\`\`\`tool:run_terminal_command\n{"command": "命令行"}\n\`\`\`

【当前专项子任务】
${task.input || task.title}
(用户全局需求: ${userPrompt})`;

          const messages: ChatMessage[] = [
            { role: 'system', content: coderSystemPrompt },
            { role: 'user', content: `请针对子任务「${task.title}」进行开发实现，若需要修改或新建文件，请直接调用工具写入。` }
          ];

          let taskSummary = '';
          let iteration = 0;
          const maxIterations = 5;

          while (iteration < maxIterations) {
            iteration++;
            if (this.abortSignal.aborted) break;

            const progressPct = Math.min(85, 20 + iteration * 15);
            updateProgress(progressPct, 'running');

            let stepResponse = '';
            await callLLMStream(
              this.config,
              messages,
              this.abortSignal,
              (token, type) => {
                stepResponse += token;
                this.callbacks.onToken(token, type || 'thought');
              }
            );

            messages.push({ role: 'assistant', content: stepResponse });
            taskSummary = stepResponse;

            const toolCall = extractToolCall(stepResponse);
            if (!toolCall) {
              break;
            }

            const { toolName, toolArgs } = toolCall;
            this.callbacks.onToken(`\n⚙️ **[${workerName}] 执行工具: ${toolName}**...\n`, 'thought');

            let observation = '';
            try {
              if (toolName === 'view_file') {
                const fp = toolArgs.filePath || toolArgs.path || toolArgs.file || '';
                observation = this.tools.viewFile(fp);
              } else if (toolName === 'write_file') {
                const fp = toolArgs.filePath || toolArgs.path || toolArgs.file || '';
                const content = toolArgs.content ?? '';
                observation = await this.tools.writeFile(fp, content);
              } else if (toolName === 'list_directory') {
                const p = toolArgs.relPath || toolArgs.path || '.';
                observation = this.tools.listDirectory(p);
              } else if (toolName === 'run_terminal_command') {
                const cmd = toolArgs.command || toolArgs.cmd || '';
                observation = await this.tools.runTerminalCommand(cmd, this.sessionId, 60000, this.callbacks, `${workerName}-${task.id}`);
              } else {
                const mcpRes = await mcpManager.executeTool(toolName, toolArgs, { workspacePath: this.effectiveWorkspace });
                observation = mcpRes !== null ? mcpRes : `Unknown tool: ${toolName}`;
              }
            } catch (err: any) {
              observation = `[工具执行错误] ${err.message}`;
            }

            this.callbacks.onToken(`\n\`\`\`output\n${observation.slice(0, 400)}${observation.length > 400 ? '\n...[截断]' : ''}\n\`\`\`\n`, 'thought');

            messages.push({
              role: 'user',
              content: `【工具调用结果】:\n${observation}\n请根据结果继续或给出开发完成结论。`
            });
          }

          updateProgress(100, 'completed');
          return taskSummary;
        }
      };
    });

    const results = await this.workerPool.executeJobs(coderJobs);
    const summary = this.workerPool.mapReduceResults(results);

    this.bus.setAgentStatus('coder', 'completed', { taskTitle: `已完成 ${results.length} 个并发研发任务` });
    return summary.consolidatedMarkdown;
  }

  private async runTesterVerification(
    tasks: SwarmSubTask[],
    userPrompt: string,
    coderOutputs: string
  ): Promise<string> {
    this.bus.setPhase('verifying');
    this.bus.setActiveRole('tester');
    this.bus.setAgentStatus('tester', 'thinking', { taskTitle: '准备执行质量与测试验证' });

    this.callbacks.onToken(`\n\n### 🧪 【Tester 自动化测试集群】弹性并行质检 (Worker Pool)\n`, 'thought');

    const testerJobs: WorkerTaskJob[] = tasks.map((task, idx) => {
      const workerName = `Tester-Worker-${idx + 1}`;
      return {
        task,
        workerName,
        executor: async (worker, updateProgress) => {
          this.callbacks.onToken(`\n\n> 🧪 **${workerName} 开始并发质检: ${task.title}**\n`, 'thought');
          updateProgress(20, 'running');

          const testerSystemPrompt = `你是由 ASteam 打造的多智能体协同集群（Swarm）专属【Tester 自动化测试子智能体 (${workerName})】。
你的职责是对 Coder 提交的代码和修改进行严格的质量检验与自动化测试。
你可以调用工具查看文件（view_file）或运行本地命令（run_terminal_command，例如 npm test, npx tsc --noEmit, 语法检查或运行脚本）。

【工作区路径】
${this.effectiveWorkspace}

【Coder 研发交付成果摘要】
${coderOutputs}

【验证指示】
请执行必要的测试命令或查看修改，评估功能完整性、构建是否报错、是否有明显的回归问题。
如果一切正常，输出详细测试通过指标（测试用例数、构建状态、测试覆盖要点）；
如果发现错误，指出失败原因并提供给 Reviewer 与 Coder 参考。`;

          const messages: ChatMessage[] = [
            { role: 'system', content: testerSystemPrompt },
            { role: 'user', content: `请针对 Coder 的实现开展测试验证，给出清晰的测试结论。` }
          ];

          let testSummary = '';
          let iteration = 0;
          const maxIterations = 3;

          while (iteration < maxIterations) {
            iteration++;
            if (this.abortSignal.aborted) break;

            updateProgress(30 + iteration * 25, 'running');

            let stepResponse = '';
            await callLLMStream(
              this.config,
              messages,
              this.abortSignal,
              (token, type) => {
                stepResponse += token;
                this.callbacks.onToken(token, type || 'thought');
              }
            );

            messages.push({ role: 'assistant', content: stepResponse });
            testSummary = stepResponse;

            const toolCall = extractToolCall(stepResponse);
            if (!toolCall) break;

            const { toolName, toolArgs } = toolCall;
            let observation = '';
            try {
              if (toolName === 'run_terminal_command') {
                const cmd = toolArgs.command || toolArgs.cmd || '';
                observation = await this.tools.runTerminalCommand(cmd, this.sessionId, 60000, this.callbacks, `${workerName}-${task.id}`);
              } else if (toolName === 'view_file') {
                const fp = toolArgs.filePath || toolArgs.path || toolArgs.file || '';
                observation = this.tools.viewFile(fp);
              } else {
                observation = `Tester 暂不开放该工具: ${toolName}`;
              }
            } catch (err: any) {
              observation = `[测试命令执行异常] ${err.message}`;
            }

            this.callbacks.onToken(`\n\`\`\`output\n${observation.slice(0, 400)}${observation.length > 400 ? '\n...[截断]' : ''}\n\`\`\`\n`, 'thought');

            messages.push({
              role: 'user',
              content: `【测试执行输出】:\n${observation}\n请分析该测试结果并给出质量评价。`
            });
          }

          updateProgress(100, 'completed');
          return testSummary;
        }
      };
    });

    const results = await this.workerPool.executeJobs(testerJobs);
    const summary = this.workerPool.mapReduceResults(results);

    this.bus.setAgentStatus('tester', 'completed', { taskTitle: `完成 ${results.length} 项并行自动化测试质检` });
    return summary.consolidatedMarkdown;
  }

  private async runReviewerAudit(
    tasks: SwarmSubTask[],
    coderOutputs: string,
    testerOutputs: string
  ): Promise<string> {
    this.bus.setPhase('reviewing');
    this.bus.setActiveRole('reviewer');
    this.bus.setAgentStatus('reviewer', 'thinking', { taskTitle: '正在审查代码规范与安全合规' });

    this.callbacks.onToken(`\n\n### 🛡️ 【Reviewer 代码规范与安全审计】展开评审\n`, 'thought');

    const rulesPrompt = rulesManager.assembleRulesPrompt(this.effectiveWorkspace);

    for (const task of tasks) {
      this.bus.updateTaskStatus(task.id, 'running');
      this.bus.setAgentStatus('reviewer', 'executing', { currentTaskId: task.id, taskTitle: task.title });
    }

    const reviewerSystemPrompt = `你是由 ASteam 打造的多智能体协同集群（Swarm）专属【Reviewer 代码规范与安全审计官】。
你的核心使命是对 Coder 的开发代码与 Tester 的检验结果进行全局安全与质量评审。

${rulesPrompt}

【Coder 实现产出】
${coderOutputs}

【Tester 验证产出】
${testerOutputs}

【审计维度要求】
1. **规约遵循检查**：是否符合工作区 .asteamrules（如 TypeScript 严禁 any、架构分层、注释与样式等）；
2. **安全性排查**：是否存在命令注入、硬编码密钥、敏感路径泄漏或越权操作；
3. **性能与坏味道**：是否有无意义的重复渲染、内存泄漏隐患或异常未捕获；
4. **评审结论评分**：给出评审等级【✅ PASS 批准】或【⚠️ CHANGES_REQUESTED 需修改】，并列出关键改进建议。`;

    let reviewReport = '';
    await callLLMStream(
      this.config,
      [
        { role: 'system', content: reviewerSystemPrompt },
        { role: 'user', content: '请输出详细的代码安全与规范评审评分卡（Review Scorecard）。' }
      ],
      this.abortSignal,
      (token, type) => {
        reviewReport += token;
        this.callbacks.onToken(token, type || 'thought');
      }
    );

    for (const task of tasks) {
      this.bus.updateTaskStatus(task.id, 'completed', reviewReport.slice(0, 300));
    }

    this.bus.setAgentStatus('reviewer', 'completed', { taskTitle: '代码审计与评分完成' });
    this.bus.postMessage({
      fromRole: 'reviewer',
      toRole: 'architect',
      type: 'issue_report',
      content: `[Reviewer 审计完成] 代码规范与安全评分卡已生成，签发审核意见至 Architect。`
    });

    return reviewReport;
  }

  private async runArchitectSummary(
    userPrompt: string,
    coderOutputs: string,
    testerOutputs: string,
    reviewerReport: string
  ): Promise<string> {
    this.bus.setActiveRole('architect');
    this.bus.setAgentStatus('architect', 'thinking', { taskTitle: '正在汇总全景交付报告' });

    this.callbacks.onToken(`\n\n### 🎯 【Architect 架构总师】成果聚合与交付闭环\n\n`, 'content');

    const summaryPrompt = `你现在是多智能体协同集群（Swarm）的【Architect 架构主控】。
所有角色子代理（Coder、Tester、Reviewer）均已圆满完成分工任务！
请为用户生成一份结构精美、条理清晰的最终交付全景总结报告（Markdown 格式）：

【用户原始诉求】
${userPrompt}

【Coder 实现详情】
${coderOutputs}

【Tester 质量与测试验证】
${testerOutputs}

【Reviewer 安全合规审计】
${reviewerReport}

【报告版式标准】
1. 🎯 **任务概览与协同拓扑**：说明 4 大 Agent 分工执行概况；
2. 💻 **研发实现与变更清单**：列出具体新建/修改的文件、核心设计逻辑；
3. 🧪 **测试与质量验证结论**：列出测试指标、构建状态、边界检验；
4. 🛡️ **规范与安全审计结论**：呈现 Review 评分卡与代码合规度；
5. 🚀 **后续使用与建议**：若有后续步骤（如启动命令、验证方法），给出明确指导。`;

    let finalSummary = '';
    await callLLMStream(
      this.config,
      [
        { role: 'system', content: '你是具有全局视角的首席架构师，负责交付高水准的工程成果报告。' },
        { role: 'user', content: summaryPrompt }
      ],
      this.abortSignal,
      (token, type) => {
        finalSummary += token;
        this.callbacks.onToken(token, 'content');
      }
    );

    this.bus.setAgentStatus('architect', 'completed', { taskTitle: '全流程交付总结就绪' });
    return finalSummary;
  }
}
