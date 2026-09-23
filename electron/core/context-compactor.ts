import { ChatMessage } from '../gateway/gateway-types';

export interface CompactorOptions {
  maxContextTokens?: number;
  preserveRecentTurns?: number;
  maxToolResultChars?: number;
}

/**
 * ASTeam 2.0.0 上下文智能滑动窗口压缩器 (ContextCompactor)
 * - 借鉴 ZCode 上下文管理规范
 * - 针对大型长任务（多轮比对、批量审图、终端长输出）自动实施安全折叠
 * - 严格遵循 OpenAI 协议约束：折叠历史 tool 消息时必须保留其对应 tool_call_id，杜绝网关 400 校验报错
 */
export class ContextCompactor {
  private maxContextTokens: number;
  private preserveRecentTurns: number;
  private maxToolResultChars: number;

  constructor(options?: CompactorOptions) {
    this.maxContextTokens = options?.maxContextTokens || 32000;
    this.preserveRecentTurns = options?.preserveRecentTurns || 4;
    this.maxToolResultChars = options?.maxToolResultChars || 1500;
  }

  /**
   * 启发式估算消息列表的 Token 数量
   */
  public estimateTokens(messages: ChatMessage[]): number {
    let count = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        const str = msg.content;
        // 中文字符与英文字符加权
        const chineseCount = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherCount = str.length - chineseCount;
        count += Math.ceil(chineseCount * 0.8 + otherCount * 0.3);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            const str = part.text;
            const chineseCount = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
            const otherCount = str.length - chineseCount;
            count += Math.ceil(chineseCount * 0.8 + otherCount * 0.3);
          } else if (part.type === 'image_url') {
            count += 1024; // 常见高精多模态图片的基线 Token 预算
          }
        }
      }

      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          count += 50 + Math.ceil((tc.function?.arguments?.length || 0) * 0.3);
        }
      }
    }
    return count;
  }

  /**
   * 实施滑动窗口压缩与大型输出折叠
   */
  public compact(messages: ChatMessage[]): { messages: ChatMessage[]; compacted: boolean; tokenEstimate: number } {
    const totalEst = this.estimateTokens(messages);
    if (totalEst <= this.maxContextTokens && messages.length <= this.preserveRecentTurns * 2 + 2) {
      return { messages, compacted: false, tokenEstimate: totalEst };
    }

    let compactedMessages: ChatMessage[] = [...messages];

    // 1. 保留关键基石消息：System Prompt (index 0) 与初始用户诉求 (index 1)
    const systemMessage = compactedMessages.find(m => m.role === 'system');
    const firstUserIndex = compactedMessages.findIndex(m => m.role === 'user');
    const firstUserMessage = firstUserIndex !== -1 ? compactedMessages[firstUserIndex] : null;

    // 2. 识别需要原貌保留的最新轮次
    // 若当前已超限 (> maxContextTokens)，严格仅保护最新 2 条尾部消息，对其余历史轮次的超长工具输出强制折叠
    const tailCount = totalEst > this.maxContextTokens ? 2 : (this.preserveRecentTurns * 2);
    const tailStartIndex = Math.max(1, compactedMessages.length - tailCount);
    let hasModified = false;

    // 3. 对中间历史轮次的大型 tool 消息或长文本实施轻量摘要与折叠
    compactedMessages = compactedMessages.map((msg, idx) => {
      // 保护基石消息与最新尾部消息
      if (idx === 0 || idx === firstUserIndex || idx >= tailStartIndex) {
        return msg;
      }

      // 折叠超长的历史 tool 产物 (例如大型文件读取或终端长输出)
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        if (msg.content.length > this.maxToolResultChars) {
          hasModified = true;
          const head = msg.content.slice(0, 400);
          const tail = msg.content.slice(-200);
          const omittedCount = msg.content.length - 600;
          return {
            ...msg,
            content: `${head}\n\n... [ASTeam 2.0 自动压缩: 中间省略 ${omittedCount} 字符历史执行日志，已被后续决策正常消费] ...\n\n${tail}`
          };
        }
      }

      return msg;
    });

    // 4. 若即使折叠超长结果后仍严重超限，平滑裁剪最旧的历史中间轮次
    let currentEst = this.estimateTokens(compactedMessages);
    if (currentEst > this.maxContextTokens && compactedMessages.length > (this.preserveRecentTurns * 2 + 3)) {
      hasModified = true;
      const protectedHead: ChatMessage[] = [];
      if (systemMessage) protectedHead.push(systemMessage);
      if (firstUserMessage && firstUserMessage !== systemMessage) protectedHead.push(firstUserMessage);

      // 提取最新的近期轮次
      const protectedTail = compactedMessages.slice(tailStartIndex);

      // 中间插入系统压缩墓碑标记
      const tombstoneMessage: ChatMessage = {
        role: 'system',
        content: `> ℹ️ **[上下文滑动窗口折叠通知]** ASTeam 2.0 已对更早期的历史执行轮次进行安全滑动归档，确保当前注意力聚焦于最新任务与交付目标。`
      };

      compactedMessages = [...protectedHead, tombstoneMessage, ...protectedTail];
      currentEst = this.estimateTokens(compactedMessages);
    }

    return {
      messages: compactedMessages,
      compacted: hasModified,
      tokenEstimate: currentEst
    };
  }
}
