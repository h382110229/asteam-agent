import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import os from 'node:os';

import { mcpManager } from './mcp-manager';
import { skillManager } from './skill-manager';
import { createWordDocx, createPowerPointPptx } from './office-generator';

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  workspacePath?: string | null;
  enabledMcpTools?: string[];
  enabledSkills?: string[];
  executionMode?: 'auto_edit' | 'plan_only' | 'safe_approval';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface AgentStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  error?: string;
}

export interface InteractiveQuestionData {
  questionId: string;
  question: string;
  options?: string[];
  multiSelect?: boolean;
}

export interface AgentEventCallbacks {
  onToken: (token: string, type?: 'content' | 'thought') => void;
  onPlan: (steps: AgentStep[]) => void;
  onStepUpdate: (step: AgentStep) => void;
  onError: (error: string) => void;
  onDone: (summary: string) => void;
  onQuestion?: (data: InteractiveQuestionData) => void;
}

interface ActiveExecution {
  abortController: AbortController;
  currentProcess?: ChildProcess;
}

const activeExecutions = new Map<string, ActiveExecution>();
const pendingUserResponses = new Map<string, (response: string) => void>();

export function submitUserResponse(sessionId: string, response: string): boolean {
  const resolver = pendingUserResponses.get(sessionId);
  if (resolver) {
    resolver(response);
    pendingUserResponses.delete(sessionId);
    return true;
  }
  return false;
}

export function abortExecution(sessionId: string): boolean {
  const active = activeExecutions.get(sessionId);
  if (active) {
    try {
      active.abortController.abort();
    } catch {}
    if (active.currentProcess && !active.currentProcess.killed) {
      try {
        if (process.platform === 'win32' && active.currentProcess.pid) {
          spawn('taskkill', ['/pid', active.currentProcess.pid.toString(), '/T', '/F']);
        } else {
          active.currentProcess.kill('SIGKILL');
        }
      } catch {}
    }
    const resolver = pendingUserResponses.get(sessionId);
    if (resolver) {
      resolver('已由用户取消。');
      pendingUserResponses.delete(sessionId);
    }
    activeExecutions.delete(sessionId);
    return true;
  }
  return false;
}

// 1. Workspace Native Tools
class WorkspaceTools {
  constructor(private workspacePath: string, private isHostMode: boolean = false) {}

  private resolveSafe(relOrAbsPath: string): string {
    if (!relOrAbsPath) return this.workspacePath;
    if (path.isAbsolute(relOrAbsPath)) {
      if (this.isHostMode) {
        return path.normalize(relOrAbsPath);
      }
      const abs = path.resolve(relOrAbsPath);
      if (!abs.startsWith(path.resolve(this.workspacePath))) {
        throw new Error(`Security Violation: Path "${relOrAbsPath}" escapes workspace directory.`);
      }
      return abs;
    }
    const abs = path.resolve(this.workspacePath, relOrAbsPath);
    if (!this.isHostMode && !abs.startsWith(path.resolve(this.workspacePath))) {
      throw new Error(`Security Violation: Path "${relOrAbsPath}" escapes workspace directory.`);
    }
    return abs;
  }

  viewFile(relPath: string): string {
    if (!relPath || relPath.trim() === '') {
      throw new Error('viewFile 失败: 未提供文件路径 (filePath 不能为空)');
    }
    const target = this.resolveSafe(relPath);
    if (!fs.existsSync(target)) {
      throw new Error(`File not found: ${relPath}`);
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      return this.listDirectory(relPath);
    }
    if (stat.size > 2 * 1024 * 1024) {
      const fd = fs.openSync(target, 'r');
      const buffer = Buffer.alloc(32 * 1024);
      fs.readSync(fd, buffer, 0, 32 * 1024, 0);
      fs.closeSync(fd);
      return buffer.toString('utf-8') + '\n\n[...Truncated: File exceeds 2MB...]';
    }
    return fs.readFileSync(target, 'utf-8');
  }

  async writeFile(relPath: string, content: string): Promise<string> {
    if (!relPath || relPath.trim() === '' || relPath === '.' || relPath === './') {
      throw new Error('writeFile 失败: 必须指定具体的目标文件路径 (filePath 不能为空)');
    }
    const target = this.resolveSafe(relPath);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      throw new Error(`writeFile 失败: 目标路径 "${target}" 是一个现有目录，不能直接作为文件覆盖写入。请指定具体文件名（例如 ${path.join(target, 'document.md')}）。`);
    }

    // 智能识别：若目标为 Word 文档扩展名 (.docx)，自动转为标准二进制 docx 文档排版输出
    if (target.toLowerCase().endsWith('.docx')) {
      return await createWordDocx({
        filePath: target,
        title: path.basename(target, '.docx'),
        markdownContent: content
      });
    }

    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(target, content, 'utf-8');
    return `Successfully wrote ${Buffer.byteLength(content, 'utf-8')} bytes to "${target}"`;
  }

  async generateWordDocx(options: any): Promise<string> {
    const target = this.resolveSafe(options.filePath || 'document.docx');
    return await createWordDocx({ ...options, filePath: target });
  }

  async generatePowerPointPptx(options: any): Promise<string> {
    const target = this.resolveSafe(options.filePath || 'presentation.pptx');
    return await createPowerPointPptx({ ...options, filePath: target });
  }

  listDirectory(relPath: string = '.'): string {
    const target = this.resolveSafe(relPath);
    if (!fs.existsSync(target)) {
      throw new Error(`Directory not found: ${relPath}`);
    }
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const items = entries.slice(0, 100).map(e => {
      const type = e.isDirectory() ? '[DIR]' : '[FILE]';
      return `${type} ${e.name}`;
    });
    if (entries.length > 100) {
      items.push(`... and ${entries.length - 100} more items`);
    }
    return items.join('\n') || '(empty directory)';
  }

  runTerminalCommand(
    command: string,
    sessionId: string,
    timeoutMs: number = 120000
  ): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      let isSettled = false;

      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command];

      const child = spawn(shell, shellArgs, {
        cwd: this.workspacePath,
        env: { ...process.env, CI: 'true' },
        windowsHide: true
      });

      const active = activeExecutions.get(sessionId);
      if (active) {
        active.currentProcess = child;
      }

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try {
            if (process.platform === 'win32' && child.pid) {
              spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F']);
            } else {
              child.kill('SIGKILL');
            }
          } catch {}
          resolve(`[Error: Command timed out after ${timeoutMs / 1000} seconds]\n` + output);
        }
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        if (output.length > 50000) {
          output = output.slice(-50000);
        }
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        errorOutput += str;
      });

      child.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          resolve(`[Process Error: ${err.message}]\n` + output);
        }
      });

      child.on('close', (code) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          const totalOut = output + (errorOutput ? `\n[STDERR]:\n${errorOutput}` : '');
          resolve(`(exit code ${code})\n${totalOut || '(no output)'}`);
        }
      });
    });
  }
}

// 2. LLM Call Helper with Content-Type Auto Detection & SSE Stream parsing
async function callLLMStream(
  config: AgentConfig,
  messages: ChatMessage[],
  abortSignal: AbortSignal,
  onDelta: (text: string) => void
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model || 'Auto',
      messages,
      stream: true,
      temperature: 0.3
    }),
    signal: abortSignal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Request Failed (${response.status}): ${errText}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  
  // Optimization 3: Handle non-streaming application/json fallback gracefully
  if (contentType.includes('application/json') || !contentType.includes('text/event-stream')) {
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content || '';
    if (content) {
      onDelta(content);
    }
    return content;
  }

  // Handle SSE streaming
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is null and cannot be streamed.');
  }

  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // ignore incomplete JSON chunk in stream
        }
      }
    }
  }

  return fullText;
}

// Robust JSON and Tool Args Extractor (handles Windows paths, unescaped newlines/quotes)
function parseToolArgs(raw: string): any {
  if (!raw || !raw.trim()) return {};
  const trimmed = raw.trim();

  // 1. Try standard JSON.parse first
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Fix unescaped Windows backslashes: e.g. "C:\Users\..." -> "C:\\Users\\..."
  try {
    const fixedBackslashes = trimmed.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\');
    return JSON.parse(fixedBackslashes);
  } catch {}

  // 3. Fix unescaped literal newlines/tabs inside string literals
  try {
    const sanitized = trimmed
      .replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\')
      .replace(/[\u0000-\u001F]+/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '\\r';
        if (match === '\t') return '\\t';
        return '';
      });
    return JSON.parse(sanitized);
  } catch {}

  // 4. Robust regex parameter extraction fallback
  const result: any = {};

  // Extract filePath or path
  const fileMatch = trimmed.match(/"(?:filePath|path|file)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (fileMatch) {
    result.filePath = fileMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  // Extract dirPath
  const dirMatch = trimmed.match(/"(?:dirPath|path|directory)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (dirMatch) {
    result.dirPath = dirMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  // Extract command
  const cmdMatch = trimmed.match(/"(?:command|cmd)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (cmdMatch) {
    result.command = cmdMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  // Extract question
  const qMatch = trimmed.match(/"(?:question)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (qMatch) {
    result.question = qMatch[1].replace(/\\"/g, '"');
  }

  // Extract content
  const contentKeyIdx = trimmed.indexOf('"content"');
  if (contentKeyIdx !== -1) {
    let afterContent = trimmed.slice(contentKeyIdx + 9).replace(/^\s*:\s*/, '');
    if (afterContent.startsWith('"')) {
      afterContent = afterContent.slice(1);
    }
    const endMatch = afterContent.match(/("?\s*}\s*)$/);
    if (endMatch) {
      afterContent = afterContent.slice(0, -endMatch[0].length);
    }
    result.content = afterContent
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  if (Object.keys(result).length > 0) {
    return result;
  }

  return { raw: trimmed };
}

// 3. Harness Engine Runner
export async function runHarnessAgent(
  sessionId: string,
  config: AgentConfig,
  history: ChatMessage[],
  callbacks: AgentEventCallbacks
) {
  const abortController = new AbortController();
  activeExecutions.set(sessionId, { abortController });

  try {
    const hasWorkspace = !!(config.workspacePath && fs.existsSync(config.workspacePath));
    const isHostMode = !hasWorkspace;
    const effectiveWorkspace = hasWorkspace
      ? config.workspacePath!
      : path.join(os.homedir(), 'ASTeam-Workspace');

    if (!fs.existsSync(effectiveWorkspace)) {
      try {
        fs.mkdirSync(effectiveWorkspace, { recursive: true });
      } catch {}
    }

    const tools = new WorkspaceTools(effectiveWorkspace, isHostMode);

    const initialPlanSteps: AgentStep[] = [
      { id: 'step-1', title: isHostMode ? '分析宿主任务与操作意图' : '分析工作区与任务意图', status: 'running' },
      { id: 'step-2', title: isHostMode ? '准备执行环境或检视目标' : '检索并检视关键文件', status: 'pending' },
      { id: 'step-3', title: isHostMode ? '生成文档或执行本机命令' : '制定并执行修改/命令', status: 'pending' },
      { id: 'step-4', title: '验证并生成交付总结', status: 'pending' }
    ];
    callbacks.onPlan(initialPlanSteps);

    const mcpPrompts = mcpManager.getEnabledToolPrompts(config.enabledMcpTools || ['web_fetch', 'git_operations', 'system_inspector']);
    const skillPrompts = skillManager.getAggregatedSkillPrompt(config.enabledSkills || ['code_review', 'unit_test', 'git_commit_helper'], config.workspacePath || null);

    let modeInstruction = '';
    if (config.executionMode === 'plan_only') {
      modeInstruction = '\n\n【重要：当前处于“只读规划模式 (Plan Only)”】\n你只能使用 view_file、list_directory 或只读 MCP 工具检视项目或系统。严禁调用 write_file 或执行修改性质的终端命令。请输出详尽的架构方案与规划。';
    } else if (config.executionMode === 'safe_approval') {
      modeInstruction = '\n\n【安全审批模式 (Safe Approval)】\n执行高危或删除类命令前，必须在思考过程中明确提示用户潜在影响。';
    }

    const systemPrompt = `你是由 ASteam 打造的桌面智能工程师 Agent，内核原生深度封装 deepseek-harness 规划与工具执行范式。
${isHostMode
  ? `【当前运行环境：Windows 宿主系统免项目模式】
- 默认工作目录：${effectiveWorkspace}
- 用户主目录：${os.homedir()}
- 用户桌面目录：${path.join(os.homedir(), 'Desktop')}
你拥有对本机的自主执行能力，可以帮用户生成/编辑文档报告、运行系统命令诊断环境、批量处理文件以及调用 MCP 工具。`
  : `【当前运行环境：本地工作区项目】
- 项目目录：${config.workspacePath}`
}

你拥有以下基础工具能力：
1. view_file: 读取文件（支持相对路径与绝对路径）。调用格式：
\`\`\`tool:view_file
{"filePath": "relative/path/or/absolute/path"}
\`\`\`
2. write_file: 写入或生成文档、代码、报告（支持相对路径与绝对路径，会自动创建父目录）。调用格式：
\`\`\`tool:write_file
{"filePath": "C:/Users/.../Desktop/document.md", "content": "文档正文..."}
\`\`\`
注意：
- filePath 路径推荐使用正斜杠 / 或转义反斜杠 \\\\，例如："C:/Users/用户名/Desktop/方案.md"；
- 若 filePath 扩展名为 .docx，系统会自动排版生成标准 Microsoft Word 二进制文档。

3. generate_docx: 生成排版专业精美的标准 Microsoft Word (.docx) 文档。调用格式：
\`\`\`tool:generate_docx
{"filePath": "C:/Users/用户名/Desktop/方案白皮书.docx", "title": "方案白皮书标题", "subtitle": "副标题/描述", "markdownContent": "# 一、执行摘要\\n正文...\\n## 二、架构设计\\n..."}
\`\`\`

4. generate_pptx: 生成现代化 16:9 比例的商业演说 Microsoft PowerPoint (.pptx) 演示文稿（含封面、核心金句、观点列表与讲者演讲逐字稿）。调用格式：
\`\`\`tool:generate_pptx
{"filePath": "C:/Users/用户名/Desktop/方案汇报.pptx", "title": "方案演说汇报", "subtitle": "副标题", "slides": [{"title": "现状痛点与突破", "keyTakeaway": "单页核心观点金句", "bullets": ["要点1", "要点2", "要点3"], "speakerNotes": "讲者现场演讲逐字稿..."}]}
\`\`\`

5. list_directory: 查看目录列表。调用格式：
\`\`\`tool:list_directory
{"dirPath": "."}
\`\`\`
6. run_terminal_command: 执行控制台终端命令（在工作目录执行）。调用格式：
\`\`\`tool:run_terminal_command
{"command": "ipconfig 或 node -v 或 dir"}
\`\`\`
7. ask_user_question: 涉及方案选择、关键确认或采访模式（Grill-me 互动）时向用户弹出选择与输入卡片。调用格式：
\`\`\`tool:ask_user_question
{"question": "问题描述", "options": ["选项1", "选项2"]}
\`\`\`
8. install_skill: 自主安装或动态扩展新的 Agent 专属技能（支持从公开 URL 链接下载，或根据用户需求自主编写专业行动规约持久化到技能库中）。调用格式：
\`\`\`tool:install_skill
{"id": "skill_id", "name": "技能名称", "description": "适用说明", "prompt": "【激活技能：...】\\n- 详细行动指南与规约..."}
\`\`\`
或从 URL 安装：
\`\`\`tool:install_skill
{"url": "https://raw.githubusercontent.com/.../skill.md"}
\`\`\`
9. list_skills: 查看当前系统已安装的所有技能清单。调用格式：
\`\`\`tool:list_skills
{}
\`\`\`

${mcpPrompts ? `【已启用的 MCP 扩展工具】\n${mcpPrompts}\n` : ''}
${skillPrompts ? `【已激活的专属 Skill 技能】\n${skillPrompts}\n` : ''}
${modeInstruction}

【执行规范】
- 如果用户只是普通的咨询或交谈，直接给出详尽解答即可，无需强行调用工具。
- 如果用户需要生成文档、创建脚本、查询本机环境或执行系统操作，先给出分步规划思考（Plan），然后调用对应工具执行。
- 完成任务后，请给出详细总结并说明生成的文件路径或命令输出。`;

    let messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    let currentStepIndex = 0;
    const maxIterations = 8;
    let iteration = 0;
    let finalSummary = '';

    while (iteration < maxIterations) {
      iteration++;

      if (abortController.signal.aborted) {
        throw new Error('Task was aborted by user.');
      }

      let stepResponse = '';
      callbacks.onToken(`\n\n**[Agent 思考与规划 - 轮次 ${iteration}]**\n`, 'thought');

      await callLLMStream(
        config,
        messages,
        abortController.signal,
        (token) => {
          stepResponse += token;
          callbacks.onToken(token, 'content');
        }
      );

      finalSummary = stepResponse;
      messages.push({ role: 'assistant', content: stepResponse });

      // Match tool calls
      const toolMatch = stepResponse.match(/```tool:([a-z_]+)\s*([\s\S]*?)```/);
      if (!toolMatch) {
        // No more tool calls needed, task completed
        break;
      }

      const toolName = toolMatch[1].trim();
      const toolArgRaw = toolMatch[2].trim();
      const toolArgs = parseToolArgs(toolArgRaw);

      currentStepIndex = Math.min(currentStepIndex + 1, initialPlanSteps.length - 1);
      const activeStep = initialPlanSteps[currentStepIndex];
      activeStep.status = 'running';
      activeStep.tool = toolName;
      activeStep.args = toolArgs;
      callbacks.onStepUpdate({ ...activeStep });

      callbacks.onToken(`\n\n⚙️ **执行工具 [${toolName}]**...\n`, 'thought');

      let observation = '';
      try {
        if (config.executionMode === 'plan_only' && (toolName === 'write_file' || toolName === 'run_terminal_command')) {
          observation = `[安全拦截] 当前处于“只读规划模式 (Plan Only)”，已拦截文件写入与命令执行操作。`;
        } else if (toolName === 'view_file') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          observation = tools.viewFile(targetPath || '');
        } else if (toolName === 'write_file') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          let content = toolArgs.content ?? '';
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
            content = secondary.content ?? content;
          }
          if (!targetPath || targetPath.trim() === '') {
            throw new Error('未识别到有效的文件路径 (filePath 不能为空，请提供目标文件名)');
          }
          observation = await tools.writeFile(targetPath, content);
        } else if (toolName === 'generate_docx') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            targetPath = path.join(os.homedir(), 'Desktop', `${toolArgs.title || '方案白皮书'}.docx`);
          }
          observation = await tools.generateWordDocx({
            ...toolArgs,
            filePath: targetPath,
            markdownContent: toolArgs.markdownContent || toolArgs.content || ''
          });
        } else if (toolName === 'generate_pptx') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            targetPath = path.join(os.homedir(), 'Desktop', `${toolArgs.title || '演说汇报'}.pptx`);
          }
          observation = await tools.generatePowerPointPptx({
            ...toolArgs,
            filePath: targetPath
          });
        } else if (toolName === 'list_directory') {
          observation = tools.listDirectory(toolArgs.dirPath || toolArgs.path || '.');
        } else if (toolName === 'run_terminal_command') {
          observation = await tools.runTerminalCommand(toolArgs.command || '', sessionId, 120000);
        } else if (toolName === 'ask_user_question') {
          const qId = `q-${Date.now()}`;
          const qData: InteractiveQuestionData = {
            questionId: qId,
            question: toolArgs.question || '请针对上述方案进行选择或确认：',
            options: toolArgs.options || [],
            multiSelect: !!toolArgs.multiSelect
          };
          callbacks.onQuestion?.(qData);
          callbacks.onToken(`\n\n💬 **[互动提问]** ${qData.question}\n`, 'thought');

          activeStep.status = 'running';
          activeStep.result = '等待用户在界面卡片中答复...';
          callbacks.onStepUpdate({ ...activeStep });

          // Await user response via submitUserResponse
          observation = await new Promise<string>((resolve) => {
            pendingUserResponses.set(sessionId, resolve);
          });
        } else if (toolName === 'install_skill') {
          if (toolArgs.url) {
            const res = await fetch(toolArgs.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const text = await res.text();
            const urlFileName = toolArgs.url.split('/').pop()?.replace(/\.md$/, '') || 'remote_skill';
            const titleMatch = text.match(/^#\s+(.+)$/m);
            const name = titleMatch ? titleMatch[1].trim() : urlFileName;
            const installed = skillManager.installSkillFromContent(urlFileName, name, `从 URL 安装: ${toolArgs.url}`, text);
            observation = `[Skill 自主安装成功] 已成功从远程下载并安装技能 "${installed.name}" (ID: ${installed.id})，已存入全局技能库 (~/.asteam/skills/) 并即时激活生效！`;
          } else if (toolArgs.name && toolArgs.prompt) {
            const cleanId = (toolArgs.id || toolArgs.name).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const installed = skillManager.installSkillFromContent(
              cleanId,
              toolArgs.name,
              toolArgs.description || '由 Agent 自主生成并安装的技能',
              toolArgs.prompt
            );
            observation = `[Skill 自主安装成功] 已成功创建并安装专属技能 "${installed.name}" (ID: ${installed.id})，已安全持久化至 ~/.asteam/skills/ 并即时激活生效！`;
          } else {
            throw new Error('install_skill 参数错误: 需要提供 url 字段或者 { id, name, description, prompt } 字段');
          }
        } else if (toolName === 'list_skills') {
          const all = skillManager.getAllAvailableSkills(config.workspacePath || null);
          const listStr = all.map(s => `- [${s.isBuiltin ? '内置' : '自定义'}] ${s.name} (${s.id}): ${s.description}`).join('\n');
          observation = `当前系统已挂载技能列表 (${all.length} 项):\n${listStr}`;
        } else {
          // Check MCP tools
          const mcpResult = await mcpManager.executeTool(toolName, toolArgs, { workspacePath: config.workspacePath || null });
          if (mcpResult !== null) {
            observation = mcpResult;
          } else {
            observation = `Unknown tool: ${toolName}`;
          }
        }
        activeStep.status = 'completed';
        activeStep.result = observation.slice(0, 300);
      } catch (err: any) {
        observation = `Tool Execution Error: ${err.message}`;
        activeStep.status = 'failed';
        activeStep.error = err.message;
      }

      callbacks.onStepUpdate({ ...activeStep });
      callbacks.onToken(`\n\`\`\`output\n${observation.slice(0, 500)}${observation.length > 500 ? '\n...[truncated]' : ''}\n\`\`\`\n`, 'thought');

      messages.push({
        role: 'user',
        content: `【工具调用返回结果】:\n${observation}\n请根据以上结果继续执行规划，若已完成任务则给出最终答复。`
      });
    }

    // Mark remaining steps as completed
    for (const step of initialPlanSteps) {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'completed';
        callbacks.onStepUpdate({ ...step });
      }
    }

    callbacks.onDone(finalSummary);
  } catch (error: any) {
    if (abortController.signal.aborted) {
      callbacks.onError('操作已被用户手动停止。');
    } else {
      callbacks.onError(error.message || 'Agent 运行异常');
    }
  } finally {
    activeExecutions.delete(sessionId);
  }
}
