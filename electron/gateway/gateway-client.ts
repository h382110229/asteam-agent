import { net } from 'electron';
import {
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  GatewayRequestPayload,
  GatewayStreamCallbacks,
  GatewayResponseResult
} from './gateway-types';

export interface GatewayClientConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  timeoutMs?: number;
}

/**
 * 高可靠原生 HTTP 请求封装 (全面弃用 Chromium net.fetch，杜绝 HTTP/2 连接池损坏与 ERR_HTTP2_PROTOCOL_ERROR)
 */
async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  // 直接使用 Node.js 18+ 原生 globalThis.fetch (基于 undici)，连接稳定，不受 Chromium HTTP/2 Socket 复用污染
  return await globalThis.fetch(input, init);
}

/**
 * 启发式判断当前模型是否为纯推理/深度思考模型
 * (多数推理模型严格要求不得传入自定义 temperature，或仅允许固定值，否则网关直接抛 400)
 */
export function isReasoningModel(modelName: string): boolean {
  if (!modelName) return false;
  const name = modelName.toLowerCase();
  return (
    name.includes('r1') ||
    name.includes('reasoner') ||
    name.includes('o1') ||
    name.includes('o3') ||
    name.includes('thinking') ||
    name.includes('ultra')
  );
}

/**
 * 启发式判断模型是否原生支持 Vision 多模态
 */
export function isVisionSupportedModel(modelName: string): boolean {
  if (!modelName) return false;
  const name = modelName.toLowerCase();
  if (name === 'auto' || name.startsWith('auto')) return true;
  return (
    name.includes('mimo') ||
    name.includes('vl') ||
    name.includes('vision') ||
    name.includes('4o') ||
    name.includes('gemini') ||
    name.includes('omni') ||
    name.includes('claude-3')
  );
}

/**
 * ASTeam 2.0.0 通用纯净 OpenAI-Compatible 网关客户端
 * - 纯净 OpenAI 协议，模型无关，深度适配小米 MiMo 系列及 DeepSeek/Gemini
 * - 内置 Param Sanitizer: 动态参数白名单净化，彻底杜绝 temperature/超参引发的 400 报错
 * - 内置 Stream Normalizer: 统一解耦 delta.reasoning_content 与内联 <think> 标签，双通道流式输出
 */
export class UniversalGatewayClient {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private timeoutMs: number;

  constructor(config: GatewayClientConfig) {
    this.baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
    this.apiKey = config.apiKey || '';
    this.defaultModel = config.defaultModel || 'mimo-v2.5-pro';
    this.timeoutMs = config.timeoutMs || 120000;
  }

  public updateConfig(config: Partial<GatewayClientConfig>): void {
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.defaultModel !== undefined) this.defaultModel = config.defaultModel;
    if (config.timeoutMs !== undefined) this.timeoutMs = config.timeoutMs;
  }

  /**
   * 参数动态净化器 (Param Sanitizer)
   * 消除向推理模型传递 temperature 或未知非法字段导致的 400 Bad Request
   */
  public sanitizePayload(raw: GatewayRequestPayload): GatewayRequestPayload {
    const model = raw.model || this.defaultModel;
    const isReasoning = isReasoningModel(model);

    const sanitizedMessages = (raw.messages || []).map(m => {
      let content = m.content;
      if (content === undefined || content === null) {
        content = (m as any).text ?? '';
      }
      return {
        ...m,
        content
      };
    });

    const payload: GatewayRequestPayload = {
      model,
      messages: sanitizedMessages,
      stream: raw.stream ?? true
    };

    // 仅非推理模型注入自定义温度，推理模型直接剔除以保证兼容
    if (!isReasoning && raw.temperature !== undefined) {
      payload.temperature = Math.max(0, Math.min(2, raw.temperature));
    }

    if (raw.max_tokens !== undefined && raw.max_tokens > 0) {
      if (isReasoning) {
        payload.max_completion_tokens = raw.max_tokens;
      } else {
        payload.max_tokens = raw.max_tokens;
      }
    }

    // 仅当传入工具时才挂载 tools 与 tool_choice
    if (raw.tools && raw.tools.length > 0) {
      payload.tools = raw.tools;
      payload.tool_choice = raw.tool_choice || 'auto';
    }

    // 注入 stream_options 以确保网关返回真实的 Token 统计
    if (raw.stream) {
      payload.stream_options = { include_usage: true };
    }

    return payload;
  }

  /**
   * 发起流式/非流式请求并由 Universal Stream Normalizer 实时解析
   */
  public async executeChat(
    payload: GatewayRequestPayload,
    abortSignal?: AbortSignal,
    callbacks?: GatewayStreamCallbacks
  ): Promise<GatewayResponseResult> {
    const sanitized = this.sanitizePayload(payload);
    const endpoint = `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let response: Response | undefined;
    let lastFetchErr: any;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (abortSignal?.aborted) {
        throw new Error('用户或系统已取消本次请求。');
      }
      try {
        response = await safeFetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(sanitized),
          signal: abortSignal
        });
        break;
      } catch (fetchErr: any) {
        lastFetchErr = fetchErr;
        if (abortSignal?.aborted) {
          throw new Error('用户或系统已取消本次请求。');
        }
        if (attempt < maxRetries) {
          // 遇到首次 DNS 解析抖动或 Cloudflare 边缘连接抖动，短暂回退后自动重试
          await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
      }
    }

    if (!response) {
      throw new Error(`[网关连接失败] 无法连通服务端 ${this.baseUrl}: ${lastFetchErr?.message || lastFetchErr}`);
    }

    // 状态码拦截与友好清洗
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isSse = contentType.includes('text/event-stream') || sanitized.stream;

    if (!isSse) {
      return await this.handleNonStreamingResponse(response, callbacks);
    } else {
      return await this.handleStreamingResponse(response, callbacks);
    }
  }

  /**
   * 解析 SSE 流式响应
   */
  private async handleStreamingResponse(
    response: Response,
    callbacks?: GatewayStreamCallbacks
  ): Promise<GatewayResponseResult> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('网关返回的响应体为空，无法建立流式读取。');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedThought = '';
    let accumulatedUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    // 内联 <think> 标签状态机（针对部分将思考流直接写在 content 中的网关/模型）
    let isInsideInlineThink = false;

    const processDataLine = (dataStr: string) => {
      if (!dataStr || dataStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.error) {
          throw new Error(`[网关上游错误] ${parsed.error.message || JSON.stringify(parsed.error)}`);
        }

        if (parsed.usage) {
          accumulatedUsage = {
            prompt_tokens: parsed.usage.prompt_tokens,
            completion_tokens: parsed.usage.completion_tokens,
            total_tokens: parsed.usage.total_tokens
          };
        }

        const choice = parsed.choices?.[0];
        if (!choice) return;
        const delta = choice.delta;
        if (!delta) return;

        // 1. 解析思考流 (reasoning_content / reasoning / thought)
        const reasoningDelta = delta.reasoning_content || delta.reasoning || delta.thought || delta.thinking || '';
        if (reasoningDelta) {
          accumulatedThought += reasoningDelta;
          callbacks?.onToken?.(reasoningDelta, 'thought');
        }

        // 2. 解析正文流 (附带内联 <think> 标签过滤)
        const contentDelta = delta.content || '';
        if (contentDelta) {
          this.processInlineContentTokens(
            contentDelta,
            (token, type) => {
              if (type === 'thought') {
                accumulatedThought += token;
              } else {
                accumulatedContent += token;
              }
              callbacks?.onToken?.(token, type);
            },
            () => isInsideInlineThink,
            (val) => { isInsideInlineThink = val; }
          );
        }

        // 3. 解析标准工具调用流 (delta.tool_calls)
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCallMap.get(idx) || { id: '', name: '', args: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) {
              if (!existing.name) {
                callbacks?.onSystemNotice?.(`\n> ⚡ **[智能体执行]** 正在装配工具 \`${tc.function.name}\`...\n`);
              }
              existing.name += tc.function.name;
            }
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallMap.set(idx, existing);

            callbacks?.onToolCallChunk?.({
              index: idx,
              id: existing.id,
              type: 'function',
              function: {
                name: existing.name,
                arguments: existing.args
              }
            });
          }
        }
      } catch (e: any) {
        if (e.message?.startsWith('[网关上游错误]')) throw e;
      }
    };

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
          processDataLine(trimmed.slice(5).trim());
        }
      }
    }

    if (buffer.trim().startsWith('data:')) {
      processDataLine(buffer.trim().slice(5).trim());
    }

    // 汇总体整成完整的 ToolCalls
    const finalToolCalls: ChatToolCall[] = [];
    const sortedIndices = Array.from(toolCallMap.keys()).sort((a, b) => a - b);
    for (const idx of sortedIndices) {
      const item = toolCallMap.get(idx)!;
      finalToolCalls.push({
        id: item.id || `call_${idx}_${Date.now()}`,
        type: 'function',
        function: {
          name: item.name,
          arguments: item.args
        }
      });
    }

    return {
      content: accumulatedContent,
      thought: accumulatedThought,
      toolCalls: finalToolCalls,
      usage: accumulatedUsage
    };
  }

  /**
   * 处理内联 <think>...</think> 标签，将其无损剥离进思考流，避免污染正文
   */
  private processInlineContentTokens(
    rawToken: string,
    emit: (token: string, type: 'content' | 'thought') => void,
    getInside: () => boolean,
    setInside: (val: boolean) => void
  ): void {
    let remaining = rawToken;

    while (remaining.length > 0) {
      if (!getInside()) {
        const startIdx = remaining.indexOf('<think>');
        if (startIdx === -1) {
          emit(remaining, 'content');
          break;
        } else {
          if (startIdx > 0) {
            emit(remaining.slice(0, startIdx), 'content');
          }
          setInside(true);
          remaining = remaining.slice(startIdx + 7);
        }
      } else {
        const endIdx = remaining.indexOf('</think>');
        if (endIdx === -1) {
          emit(remaining, 'thought');
          break;
        } else {
          if (endIdx > 0) {
            emit(remaining.slice(0, endIdx), 'thought');
          }
          setInside(false);
          remaining = remaining.slice(endIdx + 8);
        }
      }
    }
  }

  /**
   * 解析非流式响应
   */
  private async handleNonStreamingResponse(
    response: Response,
    callbacks?: GatewayStreamCallbacks
  ): Promise<GatewayResponseResult> {
    const json = await response.json();
    if (json.error) {
      throw new Error(`[网关错误] ${json.error.message || JSON.stringify(json.error)}`);
    }

    const message = json.choices?.[0]?.message || {};
    const content = message.content || '';
    const thought = message.reasoning_content || message.reasoning || message.thought || '';
    const toolCalls: ChatToolCall[] = message.tool_calls || [];

    if (thought) callbacks?.onToken?.(thought, 'thought');
    if (content) callbacks?.onToken?.(content, 'content');

    const rawUsage = json.usage;
    return {
      content,
      thought,
      toolCalls,
      usage: rawUsage ? {
        prompt_tokens: rawUsage.prompt_tokens,
        completion_tokens: rawUsage.completion_tokens,
        total_tokens: rawUsage.total_tokens
      } : undefined,
      rawResponse: json
    };
  }

  /**
   * 统一网络与 HTTP 异常拦截清洗
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const errText = await response.text();
    let cleanMessage = '';

    if (response.status === 524) {
      cleanMessage = `[网关超时 HTTP 524] 等待上游模型 (${this.baseUrl}) 推理超时 (超过 100 秒)，请检查模型并发。`;
    } else if (response.status === 502 || response.status === 503 || response.status === 504) {
      cleanMessage = `[网关服务异常 HTTP ${response.status}] 上游模型集群调度中或临时不可用。`;
    } else if (response.status === 429) {
      cleanMessage = `[频控限流 HTTP 429] 接口调用频率超限或当前账户并发已满。`;
    } else if (response.status === 401 || response.status === 403) {
      cleanMessage = `[鉴权失败 HTTP ${response.status}] API Key 无效或缺乏对应模型访问权限。`;
    } else if (response.status === 400) {
      cleanMessage = `[请求参数错误 HTTP 400] 传入参数被网关拒绝: ${errText.slice(0, 300)}`;
    } else {
      if (errText.includes('<!DOCTYPE') || errText.includes('<html')) {
        const titleMatch = errText.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : `HTTP ${response.status} 错误`;
        cleanMessage = `[API 异常 HTTP ${response.status}] ${title}`;
      } else {
        cleanMessage = `[API 异常 HTTP ${response.status}] ${errText.slice(0, 300)}`;
      }
    }

    const err = new Error(cleanMessage) as any;
    err.status = response.status;
    err.rawText = errText;
    throw err;
  }
}
