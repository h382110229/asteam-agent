import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Sparkles,
  Bot,
  User,
  FolderGit2,
  Cpu,
  Shield,
  FileSearch,
  CheckCircle2,
  Clock,
  Zap,
  Command
} from 'lucide-react';
import { AgentTrajectory, AgentStep } from './AgentTrajectory';
import { ExecutionMode } from '../types/project';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  steps?: AgentStep[];
  timestamp: number;
  durationMs?: number;
  estimatedTokens?: number;
}

interface ChatAreaProps {
  messages: ChatMessageItem[];
  isRunning: boolean;
  onSendMessage: (text: string, mode: ExecutionMode) => void;
  onStopAgent: () => void;
  workspacePath: string | null;
  currentModel: string;
  providerName: string;
  onOpenGitDiff?: () => void;
}

const SLASH_COMMANDS = [
  { cmd: '/plan', title: '深度任务规划 (Plan)', desc: '分析需求并生成分步执行计划，不进行破坏性修改' },
  { cmd: '/review', title: 'Code Review 走查', desc: '调用 Code Review 专家技能审查当前修改与安全基线' },
  { cmd: '/test', title: '单测生成与运行', desc: '寻找测试套件，为核心函数生成并执行测试用例' },
  { cmd: '/diff', title: '查看 Git 变更 Diff', desc: '唤起右侧 Git 代码变更对比抽屉' }
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isRunning,
  onSendMessage,
  onStopAgent,
  workspacePath,
  currentModel,
  providerName,
  onOpenGitDiff
}) => {
  const [input, setInput] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto_edit');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isRunning]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu && (e.key === 'Escape' || e.key === 'Tab')) {
      setShowSlashMenu(false);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isRunning) return;

    if (trimmed === '/diff') {
      onOpenGitDiff?.();
      setInput('');
      setShowSlashMenu(false);
      return;
    }

    let mode = executionMode;
    let textToSend = trimmed;

    if (trimmed.startsWith('/plan')) {
      mode = 'plan_only';
      textToSend = trimmed.replace('/plan', '').trim() || '请为当前工作区或需求制定详细的任务架构与实施规划。';
    } else if (trimmed.startsWith('/review')) {
      textToSend = trimmed.replace('/review', '').trim() || '请按照 Code Review 专家标准走查当前工作区的代码安全性与规范。';
    } else if (trimmed.startsWith('/test')) {
      textToSend = trimmed.replace('/test', '').trim() || '请为工作区核心模块生成单元测试并尝试在本地运行验证。';
    }

    onSendMessage(textToSend, mode);
    setInput('');
    setShowSlashMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;

    if (val === '/' || (val.startsWith('/') && !val.includes(' '))) {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleSelectSlashCommand = (cmd: string) => {
    if (cmd === '/diff') {
      onOpenGitDiff?.();
      setInput('');
      setShowSlashMenu(false);
      return;
    }
    setInput(`${cmd} `);
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null;

  return (
    <main className="flex h-full flex-1 flex-col bg-[var(--background)] overflow-hidden relative">
      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6 my-auto pt-16 select-none">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-lg">
              <span className="font-bold text-2xl">A</span>
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] ml-0.5" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                ASTeam Agent (v1.1)
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                内核封装 <code className="font-semibold text-[var(--foreground)]">deepseek-harness</code>，支持多项目管理、MCP 扩展、Git Diff 审查与专业技能调度。
              </p>
            </div>

            {/* Quick Prompt Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
              {[
                { title: '制定分步实施规划', prompt: '/plan 请分析当前项目的代码架构并给出模块重构路线图。' },
                { title: '执行代码安全与规范走查', prompt: '/review 请使用 Code Review 技能审查关键代码安全漏洞。' },
                { title: '单测用例编写与验证', prompt: '/test 为当前模块编写覆盖主要边界的单元测试用例。' },
                { title: '查看当前未提交代码 Diff', prompt: '/diff' }
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

                {/* Performance & Token Meta for Assistant */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center space-x-2 pt-1 border-t border-[var(--border)]/40 text-[10px] text-[var(--muted-foreground)] font-mono">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{msg.durationMs ? `${(msg.durationMs / 1000).toFixed(1)}s` : '已完成'}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Zap className="h-2.5 w-2.5 text-[var(--primary)]" />
                      <span>Tokens: ~{Math.round(msg.content.length * 0.75)}</span>
                    </span>
                  </div>
                )}
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

      {/* Slash Commands Autocomplete Popup */}
      {showSlashMenu && (
        <div className="absolute bottom-24 left-4 right-4 max-w-lg mx-auto z-40 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-2xl animate-in slide-in-from-bottom-2">
          <div className="px-2 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">
            快捷 Slash 指令
          </div>
          <div className="space-y-0.5">
            {SLASH_COMMANDS.map(cmd => (
              <div
                key={cmd.cmd}
                onClick={() => handleSelectSlashCommand(cmd.cmd)}
                className="flex items-center justify-between rounded-lg p-2 hover:bg-[var(--primary)]/10 cursor-pointer text-xs transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-[var(--primary)]">{cmd.cmd}</span>
                  <span className="font-medium text-[var(--foreground)]">{cmd.title}</span>
                </div>
                <span className="text-[10px] text-[var(--muted-foreground)]">{cmd.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Area Bar */}
      <div className="border-t border-[var(--border)] bg-[var(--card)]/90 p-4 backdrop-blur-xs">
        <div className="mx-auto max-w-4xl space-y-2">
          {/* Status Meta Bar */}
          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--muted-foreground)]">
            <div className="flex items-center space-x-2">
              {/* Execution Mode Selector */}
              <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--background)] p-0.5">
                <button
                  type="button"
                  onClick={() => setExecutionMode('auto_edit')}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    executionMode === 'auto_edit'
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title="自动修改文件并执行测试命令"
                >
                  自主执行 (Auto)
                </button>
                <button
                  type="button"
                  onClick={() => setExecutionMode('plan_only')}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    executionMode === 'plan_only'
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title="只读规划模式：仅输出步骤设计方案，不修改本地文件"
                >
                  只读规划 (Plan)
                </button>
              </div>

              <span className="text-[var(--border)]">•</span>

              <span className="flex items-center space-x-1">
                <Cpu className="h-3 w-3 text-[var(--primary)]" />
                <span>{providerName} · <strong className="text-[var(--foreground)]">{currentModel}</strong></span>
              </span>

              {workspacePath && (
                <>
                  <span className="text-[var(--border)]">•</span>
                  <button
                    type="button"
                    onClick={onOpenGitDiff}
                    className="flex items-center space-x-1 text-[var(--primary)] font-medium hover:underline"
                  >
                    <FolderGit2 className="h-3 w-3" />
                    <span className="truncate max-w-[160px]" title={workspacePath}>
                      {workspaceName} (Git Diff)
                    </span>
                  </button>
                </>
              )}
            </div>

            <span className="hidden sm:inline-block text-[10px]">
              输入 <code>/</code> 唤出指令 · Enter 发送
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
                  ? `向 ASTeam Agent 指派任务（支持输入 /plan, /review, /diff）...`
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
