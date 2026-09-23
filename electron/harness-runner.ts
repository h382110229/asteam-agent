import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentSession, AgentSessionConfig } from './core/agent-session';
import { UniversalGatewayClient } from './gateway/gateway-client';
import { ChatMessage, GatewayRequestPayload } from './gateway/gateway-types';

export interface FallbackProviderItem {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  capabilities?: string[];
}

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  stream?: boolean;
  workspacePath?: string | null;
  enabledMcpTools?: string[];
  enabledSkills?: string[];
  executionMode?: 'auto_edit' | 'plan_only' | 'safe_approval' | 'swarm';
  fallbackProviders?: FallbackProviderItem[];
  capabilities?: string[];
  customMcpConfig?: string;
  bypassSecurityFence?: boolean;
  temperature?: number;
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

export interface SubQuestion {
  question: string;
  options?: string[];
  multiSelect?: boolean;
}

export interface InteractiveQuestionData {
  questionId: string;
  question: string;
  options?: string[];
  questions?: SubQuestion[];
  multiSelect?: boolean;
}

export interface TerminalDataEvent {
  sessionId: string;
  stepId?: string;
  chunk: string;
  stream: 'stdout' | 'stderr' | 'stdin';
}

export interface AgentEventCallbacks {
  onToken: (token: string, type?: 'content' | 'thought') => void;
  onPlan: (steps: AgentStep[]) => void;
  onStepUpdate: (step: AgentStep) => void;
  onDone: (finalSummary: string, tokenStats?: any) => void;
  onError: (err: string) => void;
  onQuestion?: (data: InteractiveQuestionData) => void;
  onTerminalData?: (data: TerminalDataEvent) => void;
  onCheckpoint?: (checkpoint: any) => void;
  onSwarmState?: (state: any) => void;
}

// 全局活跃会话注册表 (SessionId -> AgentSession)
const activeSessions = new Map<string, AgentSession>();
const pendingUserResponses = new Map<string, (resp: string) => void>();

/**
 * 获取当前宿主系统真实的桌面目录（自动识别 OneDrive 桌面重定向）
 */
export function getSystemDesktopDir(): string {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.env.OneDrive) {
    candidates.push(path.join(process.env.OneDrive, 'Desktop'));
    candidates.push(path.join(process.env.OneDrive, '桌面'));
  }
  candidates.push(path.join(home, 'OneDrive', 'Desktop'));
  candidates.push(path.join(home, 'OneDrive', '桌面'));

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand)) return path.normalize(cand);
    } catch {}
  }

  const defaultDesktop = path.join(home, 'Desktop');
  if (!fs.existsSync(defaultDesktop)) {
    try {
      fs.mkdirSync(defaultDesktop, { recursive: true });
    } catch {}
  }
  return path.normalize(defaultDesktop);
}

/**
 * 响应用户交互式问答
 */
export function submitUserResponse(sessionId: string, response: string): boolean {
  const resolver = pendingUserResponses.get(sessionId);
  if (resolver) {
    resolver(response);
    pendingUserResponses.delete(sessionId);
    return true;
  }
  // 若当前无问答挂起，作为实时 Steering 插话压入队列
  const session = activeSessions.get(sessionId);
  if (session) {
    session.enqueueSteering(response);
    return true;
  }
  return false;
}

/**
 * 向终端写入输入
 */
export function submitTerminalInput(sessionId: string, input: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.enqueueSteering(`终端输入: ${input}`);
    return true;
  }
  return false;
}

/**
 * 协作式插话引导 (Steering Message)
 */
export function steerExecution(sessionId: string, message: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.enqueueSteering(message);
    return true;
  }
  return false;
}

/**
 * 显式强制终止执行 (Hard Abort)
 */
export function abortExecution(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.abort('用户主动终止。');
    activeSessions.delete(sessionId);
    const resolver = pendingUserResponses.get(sessionId);
    if (resolver) {
      resolver('已由用户取消。');
      pendingUserResponses.delete(sessionId);
    }
    return true;
  }
  return false;
}

/**
 * ASTeam 2.0.0 顶层执行入口 (门面桥接模式)
 * 接收来自 Electron main.ts 的 IPC 请求，分发至 ZCode TurnMachine 内核
 */
export async function runHarnessAgent(
  sessionId: string,
  config: AgentConfig,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
  callbacks: AgentEventCallbacks
): Promise<void> {
  const sessionConfig: AgentSessionConfig = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    stream: config.stream ?? true,
    temperature: config.temperature,
    workspacePath: config.workspacePath,
    enabledMcpTools: config.enabledMcpTools,
    enabledSkills: config.enabledSkills,
    executionMode: config.executionMode,
    bypassSecurityFence: config.bypassSecurityFence,
    sessionId,
    onQuestion: async (data: InteractiveQuestionData) => {
      return new Promise<string>((resolve) => {
        pendingUserResponses.set(sessionId, resolve);
        callbacks.onQuestion?.(data);
      });
    }
  };

  const session = new AgentSession(sessionConfig);
  activeSessions.set(sessionId, session);

  // 提取最新用户输入 (严密兼容 content 与 text 属性)
  const lastUserIndex = history.map((h, i) => ({ h, i })).reverse().find(x => x.h.role === 'user')?.i ?? -1;
  const lastUserMsg = lastUserIndex >= 0 ? history[lastUserIndex] : null;
  const userText = lastUserMsg
    ? ((lastUserMsg as any).content ?? (lastUserMsg as any).text ?? '')
    : '';

  // 初始化规划与轨迹展示
  const steps: AgentStep[] = [
    {
      id: 'step_plan',
      title: '🧠 意图推演与任务分解',
      status: 'running'
    }
  ];
  callbacks.onPlan(steps);

  try {
    const sessionHistory = lastUserIndex >= 0 ? history.slice(0, lastUserIndex) : [];

    const result = await session.execute(
      userText,
      {
        onToken: (token, type) => {
          callbacks.onToken(token, type);
        },
        onStateChange: (state, metadata) => {
          if (state === 'THINKING' && metadata?.iteration && metadata.iteration > 1) {
            const stepId = `step_retry_${metadata.iteration}`;
            const existing = steps.find(s => s.id === stepId);
            if (!existing) {
              const newStep: AgentStep = {
                id: stepId,
                title: `🛠️ 驱动技能执行: 生成物理交付物 (第 ${metadata.iteration} 轮)`,
                status: 'running'
              };
              steps.push(newStep);
              callbacks.onStepUpdate(newStep);
            }
          } else if (state === 'CALLING_TOOLS' && metadata?.toolCalls) {
            if (steps[0] && steps[0].status !== 'completed') {
              steps[0].status = 'completed';
              callbacks.onStepUpdate({ ...steps[0] });
            }
            for (const s of steps) {
              if (s.id.startsWith('step_retry_') && s.status === 'running') {
                s.status = 'completed';
                callbacks.onStepUpdate({ ...s });
              }
            }
            for (const tc of metadata.toolCalls) {
              const existing = steps.find(s => s.id === tc.id);
              if (!existing) {
                const newStep: AgentStep = {
                  id: tc.id,
                  title: `调用工具: ${tc.function.name}`,
                  status: 'running',
                  tool: tc.function.name,
                  args: tryParseJson(tc.function.arguments)
                };
                steps.push(newStep);
                callbacks.onStepUpdate(newStep);
              }
            }
          } else if (state === 'EXECUTING_TOOLS') {
            // 工具正在执行
          } else if (state === 'EVALUATING') {
            for (const s of steps) {
              if (s.status === 'running') {
                s.status = 'completed';
                callbacks.onStepUpdate({ ...s });
              }
            }
          }
        },
        onTerminalData: (chunk) => {
          callbacks.onTerminalData?.({
            sessionId,
            chunk,
            stream: 'stdout'
          });
        }
      },
      sessionHistory
    );

    // 标记全部完成
    for (const s of steps) {
      if (s.status === 'running') s.status = 'completed';
    }
    callbacks.onPlan([...steps]);
    callbacks.onDone(result.summary, result.tokenStats);
  } catch (err: any) {
    for (const s of steps) {
      if (s.status === 'running') {
        s.status = 'failed';
        callbacks.onStepUpdate({ ...s });
      }
    }
    if (session.isAborted()) {
      callbacks.onDone('任务已由用户主动终止。');
    } else {
      callbacks.onError(err?.message || 'Agent 执行发生未知异常');
    }
  } finally {
    activeSessions.delete(sessionId);
    const resolver = pendingUserResponses.get(sessionId);
    if (resolver) {
      resolver('会话已结束。');
      pendingUserResponses.delete(sessionId);
    }
  }
}

function tryParseJson(str?: string): any {
  if (!str) return undefined;
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

/**
 * 兼容导出：供 SwarmOrchestrator 使用的流式调用封装
 */
export async function callLLMStream(
  config: AgentConfig,
  messages: any[],
  abortSignal: AbortSignal,
  onDelta: (token: string, type?: 'content' | 'thought') => void,
  onSystemNotice?: (notice: string) => void
): Promise<string> {
  const client = new UniversalGatewayClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModel: config.model
  });

  const payload: GatewayRequestPayload = {
    model: config.model,
    messages: messages as ChatMessage[],
    stream: true,
    temperature: config.temperature
  };

  const res = await client.executeChat(payload, abortSignal, {
    onToken: onDelta,
    onSystemNotice
  });

  return res.content || res.thought;
}

/**
 * 兼容导出：提取工具调用
 */
export function extractToolCall(text: string): { tool: string; args: any } | null {
  const toolRegex = /```tool:([a-zA-Z0-9_\-]+)\s*([\s\S]*?)```/;
  const match = text.match(toolRegex);
  if (match) {
    const toolName = match[1].trim();
    const rawArgs = match[2].trim();
    try {
      return { tool: toolName, args: JSON.parse(rawArgs) };
    } catch {
      return { tool: toolName, args: { raw: rawArgs } };
    }
  }
  return null;
}

/**
 * 兼容导出：解析工具参数
 */
export function parseToolArgs(args: any): any {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { raw: args };
    }
  }
  return args || {};
}
