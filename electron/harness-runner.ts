import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  workspacePath?: string | null;
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

export interface AgentEventCallbacks {
  onToken: (token: string, type?: 'content' | 'thought') => void;
  onPlan: (steps: AgentStep[]) => void;
  onStepUpdate: (step: AgentStep) => void;
  onError: (error: string) => void;
  onDone: (summary: string) => void;
}

interface ActiveExecution {
  abortController: AbortController;
  currentProcess?: ChildProcess;
}

const activeExecutions = new Map<string, ActiveExecution>();

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
    activeExecutions.delete(sessionId);
    return true;
  }
  return false;
}

// 1. Workspace Native Tools
class WorkspaceTools {
  constructor(private workspacePath: string) {}

  private resolveSafe(relPath: string): string {
    const abs = path.resolve(this.workspacePath, relPath || '.');
    if (!abs.startsWith(path.resolve(this.workspacePath))) {
      throw new Error(`Security Violation: Path "${relPath}" escapes workspace directory.`);
    }
    return abs;
  }

  viewFile(relPath: string): string {
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

  writeFile(relPath: string, content: string): string {
    const target = this.resolveSafe(relPath);
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(target, content, 'utf-8');
    return `Successfully wrote ${Buffer.byteLength(content, 'utf-8')} bytes to ${relPath}`;
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

    // Degradation Mode: General Conversation when no workspace mounted
    if (!hasWorkspace) {
      callbacks.onPlan([
        {
          id: 'step-chat',
          title: '通用大模型对话模式（未挂载工作区）',
          status: 'running'
        }
      ]);

      const systemMessage: ChatMessage = {
        role: 'system',
        content: '你是 ASteam Agent 智能桌面助手。当前用户未挂载本地工作区，已自动切换为通用智能对话模式。你可以回答各类编程、架构与通用问题。'
      };

      const messages: ChatMessage[] = [systemMessage, ...history];
      let fullContent = '';

      await callLLMStream(
        config,
        messages,
        abortController.signal,
        (token) => {
          fullContent += token;
          callbacks.onToken(token, 'content');
        }
      );

      callbacks.onStepUpdate({
        id: 'step-chat',
        title: '通用对话已完成',
        status: 'completed'
      });
      callbacks.onDone(fullContent);
      return;
    }

    // Harness Workspace Agent Mode
    const tools = new WorkspaceTools(config.workspacePath!);

    const initialPlanSteps: AgentStep[] = [
      { id: 'step-1', title: '分析工作区与任务意图', status: 'running' },
      { id: 'step-2', title: '检索并检视关键文件', status: 'pending' },
      { id: 'step-3', title: '制定并执行修改/命令', status: 'pending' },
      { id: 'step-4', title: '验证并生成交付总结', status: 'pending' }
    ];
    callbacks.onPlan(initialPlanSteps);

    const systemPrompt = `你是由 ASteam 打造的桌面智能工程师 Agent，内核原生深度封装 deepseek-harness 规划与工具执行范式。
当前已挂载本地工作区：${config.workspacePath}。

你拥有以下本地工具：
1. view_file: 读取工作区中的文件。调用格式：
\`\`\`tool:view_file
{"filePath": "relative/path/to/file"}
\`\`\`
2. write_file: 写入或覆盖文件内容。调用格式：
\`\`\`tool:write_file
{"filePath": "relative/path/to/file", "content": "file contents..."}
\`\`\`
3. list_directory: 查看目录列表。调用格式：
\`\`\`tool:list_directory
{"dirPath": "."}
\`\`\`
4. run_terminal_command: 在工作区根目录执行控制台命令。调用格式：
\`\`\`tool:run_terminal_command
{"command": "your terminal command here"}
\`\`\`

【执行规范】
- 面对用户任务，请先给出清晰的规划思考（Plan），拆解具体执行步骤。
- 需要查看或编辑文件时，直接输出上述标准 tool 代码块。系统会自动拦截并执行，返回结果后你继续下一步。
- 完成任务后，请给出详细总结并说明所做变更。`;

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
      let toolArgs: any = {};
      try {
        toolArgs = JSON.parse(toolArgRaw);
      } catch {
        toolArgs = { raw: toolArgRaw };
      }

      currentStepIndex = Math.min(currentStepIndex + 1, initialPlanSteps.length - 1);
      const activeStep = initialPlanSteps[currentStepIndex];
      activeStep.status = 'running';
      activeStep.tool = toolName;
      activeStep.args = toolArgs;
      callbacks.onStepUpdate({ ...activeStep });

      callbacks.onToken(`\n\n⚙️ **执行工具 [${toolName}]**...\n`, 'thought');

      let observation = '';
      try {
        if (toolName === 'view_file') {
          observation = tools.viewFile(toolArgs.filePath || toolArgs.path || '');
        } else if (toolName === 'write_file') {
          observation = tools.writeFile(toolArgs.filePath || toolArgs.path || '', toolArgs.content || '');
        } else if (toolName === 'list_directory') {
          observation = tools.listDirectory(toolArgs.dirPath || toolArgs.path || '.');
        } else if (toolName === 'run_terminal_command') {
          observation = await tools.runTerminalCommand(toolArgs.command || '', sessionId, 120000);
        } else {
          observation = `Unknown tool: ${toolName}`;
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
