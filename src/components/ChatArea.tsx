import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Sparkles,
  Bot,
  User,
  FolderGit2,
  Cpu,
  ArrowDown
} from 'lucide-react';
import { AgentTrajectory, AgentStep } from './AgentTrajectory';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  steps?: AgentStep[];
  timestamp: number;
}

interface ChatAreaProps {
  messages: ChatMessageItem[];
  isRunning: boolean;
  onSendMessage: (text: string) => void;
  onStopAgent: () => void;
  workspacePath: string | null;
  currentModel: string;
  providerName: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isRunning,
  onSendMessage,
  onStopAgent,
  workspacePath,
  currentModel,
  providerName
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isRunning]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null;

  return (
    <main className="flex h-full flex-1 flex-col bg-[var(--background)] overflow-hidden relative">
      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6 my-auto pt-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-lg">
              <span className="font-bold text-2xl">A</span>
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] ml-0.5" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                ASTeam Agent 桌面助手
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                内核深度封装 <code className="font-semibold text-[var(--foreground)]">deepseek-harness</code> 规划与执行引擎。
                {workspacePath ? (
                  <span className="text-[var(--primary)] block mt-1 font-medium">
                    当前已成功挂载工作区：{workspaceName}，已解锁代码检视、文件修改与本地终端执行能力。
                  </span>
                ) : (
                  <span className="block mt-1">
                    当前未挂载文件夹，运行在通用对话模式。随时在左侧挂载工作区开启自主 Agent。
                  </span>
                )}
              </p>
            </div>

            {/* Starter Prompt Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
              {[
                { title: '分析项目架构与关键模块', prompt: '请帮我检视当前工作区的文件结构并总结核心模块架构。' },
                { title: '排查代码语法与潜在缺陷', prompt: '请检查工作区代码，查找潜在的错误并给出修改建议。' },
                { title: '运行本地测试或编译命令', prompt: '请在终端执行当前的测试用例或构建脚本，并分析输出。' },
                { title: '通用编程与技术咨询', prompt: '请为我设计一套高并发、低延迟的微服务系统设计方案。' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInput(item.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--muted)]/50 transition-all text-left shadow-2xs group"
                >
                  <span className="font-semibold block mb-1 group-hover:text-[var(--primary)] transition-colors">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)] line-clamp-2">
                    {item.prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 text-xs leading-relaxed ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-2xs mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`flex max-w-[85%] flex-col space-y-2 rounded-2xl p-4 shadow-2xs ${
                  msg.role === 'user'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] rounded-tr-xs'
                    : 'border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] rounded-tl-xs'
                }`}
              >
                {/* Thought Stream if available */}
                {msg.thought && (
                  <details className="rounded-lg bg-[var(--muted)]/60 p-2 text-[11px] text-[var(--muted-foreground)] border border-[var(--border)]/50">
                    <summary className="cursor-pointer font-medium hover:text-[var(--foreground)] flex items-center space-x-1">
                      <Sparkles className="h-3 w-3 text-[var(--primary)]" />
                      <span>查看 Agent 深度思考与调度日志</span>
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap font-mono text-[11px] max-h-48 overflow-y-auto">
                      {msg.thought}
                    </div>
                  </details>
                )}

                {/* deepseek-harness Planning & Execution Trajectory Tree */}
                {msg.steps && msg.steps.length > 0 && (
                  <AgentTrajectory steps={msg.steps} />
                )}

                {/* Main Message Content */}
                <div className="whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                  {msg.content}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] mt-0.5">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area Bar */}
      <div className="border-t border-[var(--border)] bg-[var(--card)]/90 p-4 backdrop-blur-xs">
        <div className="mx-auto max-w-4xl space-y-2">
          {/* Status Meta Bar */}
          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--muted-foreground)]">
            <div className="flex items-center space-x-2">
              <span className="flex items-center space-x-1">
                <Cpu className="h-3 w-3 text-[var(--primary)]" />
                <span>{providerName} · <strong className="text-[var(--foreground)]">{currentModel}</strong></span>
              </span>

              <span className="text-[var(--border)]">•</span>

              {workspacePath ? (
                <span className="flex items-center space-x-1 text-[var(--primary)] font-medium">
                  <FolderGit2 className="h-3 w-3" />
                  <span className="truncate max-w-[200px]" title={workspacePath}>
                    工作区: {workspaceName} (harness 激活)
                  </span>
                </span>
              ) : (
                <span className="flex items-center space-x-1">
                  <Sparkles className="h-3 w-3" />
                  <span>通用对话模式 (未挂载工作区)</span>
                </span>
              )}
            </div>

            <span className="hidden sm:inline-block text-[10px]">
              按 Enter 发送，Shift + Enter 换行
            </span>
          </div>

          {/* Textarea and Action Button */}
          <div className="flex items-end space-x-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-xs focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={
                workspacePath
                  ? `向 ASTeam Agent 指派工作区任务（例：“检视当前目录代码并运行构建”）...`
                  : `输入任何问题，与 ASTeam Agent 智能对话...`
              }
              className="max-h-44 min-h-[28px] w-full resize-none bg-transparent px-2 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none"
            />

            {isRunning ? (
              <button
                type="button"
                onClick={onStopAgent}
                title="停止当前任务"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--error)] text-[var(--error-foreground)] hover:opacity-90 transition-opacity shadow-xs"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                title="发送任务指令"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
