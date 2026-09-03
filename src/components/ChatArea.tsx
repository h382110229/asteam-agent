import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Sparkles,
  Bot,
  User,
  FolderGit2,
  Cpu,
  Clock,
  Zap,
  Copy,
  Check,
  Paperclip,
  X,
  FileText,
  FileCode,
  Image as ImageIcon
} from 'lucide-react';
import { AgentTrajectory, AgentStep } from './AgentTrajectory';
import { InteractiveQuestionCard, QuestionCardData } from './InteractiveQuestionCard';
import { ExecutionMode } from '../types/project';

export interface FileAttachment {
  name: string;
  size: number;
  type: string;
  content?: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  steps?: AgentStep[];
  question?: QuestionCardData;
  timestamp: number;
  durationMs?: number;
  estimatedTokens?: number;
}

interface ChatAreaProps {
  messages: ChatMessageItem[];
  isRunning: boolean;
  isWaitingForUser?: boolean;
  onSendMessage: (text: string, mode: ExecutionMode, attachments?: FileAttachment[]) => void;
  onStopAgent: () => void;
  onReplyQuestion: (questionId: string, answer: string) => void;
  workspacePath: string | null;
  currentModel: string;
  providerName: string;
  onOpenGitDiff?: () => void;
}

const SLASH_COMMANDS = [
  { cmd: '/plan', title: '深度任务规划 (Plan)', desc: '分析需求并生成分步执行计划，不进行破坏性修改' },
  { cmd: '/review', title: 'Code Review 走查', desc: '调用 Code Review 专家技能审查当前修改与安全基线' },
  { cmd: '/test', title: '单测生成与运行', desc: '寻找测试套件，为核心函数生成并执行测试用例' },
  { cmd: '/grill-me', title: 'Grill-me 互动问答', desc: '进入采访决策模式：Agent 逐一向您抛出架构选型卡片' },
  { cmd: '/diff', title: '查看 Git 变更 Diff', desc: '唤起右侧 Git 代码变更对比抽屉' }
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isRunning,
  isWaitingForUser = false,
  onSendMessage,
  onStopAgent,
  onReplyQuestion,
  workspacePath,
  currentModel,
  providerName,
  onOpenGitDiff
}) => {
  const [input, setInput] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto_edit');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isRunning, isWaitingForUser]);

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {}
  };

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
    if ((!trimmed && attachments.length === 0) || (isRunning && !isWaitingForUser)) return;

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
    } else if (trimmed.startsWith('/grill-me')) {
      textToSend = trimmed.replace('/grill-me', '').trim() || '请开启 Grill-me 采访交互模式，针对当前项目逐一向我提问关键决策。';
    }

    onSendMessage(textToSend, mode, attachments);
    setInput('');
    setAttachments([]);
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

  // Attachment handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
    e.target.value = '';
  };

  const processFiles = (fileList: File[]) => {
    fileList.forEach(file => {
      const reader = new FileReader();
      // Check if text based
      const isText = file.type.startsWith('text/') ||
        /\.(ts|tsx|js|jsx|json|md|py|go|rs|c|cpp|h|css|html|xml|yaml|yml|sh|env)$/i.test(file.name);

      if (isText && file.size < 100 * 1024) {
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          setAttachments(prev => [...prev, {
            name: file.name,
            size: file.size,
            type: file.type || 'text/plain',
            content
          }]);
        };
        reader.readAsText(file);
      } else {
        setAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream'
        }]);
      }
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null;

  return (
    <main className="flex h-full flex-1 flex-col bg-[var(--background)] overflow-hidden relative">
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 select-text">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6 my-auto pt-16 select-none">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-lg">
              <span className="font-bold text-2xl">A</span>
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] ml-0.5" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                ASTeam Agent (v1.1.1)
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                内核深度封装 <code className="font-semibold text-[var(--foreground)]">deepseek-harness</code>。现已全面支持宿主免项目系统操作与本地文档生成、卡片交互问答 (Grill-me)、文本划选复制与文件附件拖拽。
              </p>
            </div>

            {/* Quick Prompt Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
              {[
                { title: '本地生成架构设计文档', prompt: '请帮我在本地生成一份详细的系统架构方案设计 Markdown 文档并保存。' },
                { title: '本机环境与网络诊断', prompt: '请帮我查询本机网络配置 (ipconfig) 与 Node/Git 运行环境状态。' },
                { title: '开启 Grill-me 决策问答', prompt: '/grill-me 针对当前方案向我抛出关键选择题进行卡片互动。' },
                { title: '执行代码安全走查与审查', prompt: '/review 请使用 Code Review 技能审查关键代码安全漏洞。' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInput(item.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--muted)]/50 transition-all text-left shadow-2xs group select-none"
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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-2xs mt-0.5 select-none">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`group relative flex max-w-[85%] flex-col space-y-2 rounded-2xl p-4 shadow-2xs ${
                  msg.role === 'user'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] rounded-tr-xs'
                    : 'border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] rounded-tl-xs'
                }`}
              >
                {/* Copy Button Toolbar on Hover */}
                {msg.content && (
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    title="复制回复文本"
                    className={`absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded transition-opacity ${
                      msg.role === 'user'
                        ? 'hover:bg-white/20 text-white'
                        : 'hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {copiedMsgId === msg.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}

                {/* Thought Stream if available */}
                {msg.thought && (
                  <details className="rounded-lg bg-[var(--muted)]/60 p-2 text-[11px] text-[var(--muted-foreground)] border border-[var(--border)]/50">
                    <summary className="cursor-pointer font-medium hover:text-[var(--foreground)] flex items-center space-x-1 select-none">
                      <Sparkles className="h-3 w-3 text-[var(--primary)]" />
                      <span>查看 Agent 深度思考与调度日志</span>
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap font-mono text-[11px] max-h-48 overflow-y-auto select-text">
                      {msg.thought}
                    </div>
                  </details>
                )}

                {/* deepseek-harness Planning & Execution Trajectory Tree */}
                {msg.steps && msg.steps.length > 0 && (
                  <AgentTrajectory steps={msg.steps} />
                )}

                {/* Interactive Question Card if Agent prompted a question */}
                {msg.question && (
                  <InteractiveQuestionCard
                    data={msg.question}
                    onSubmitAnswer={(qId, ans) => onReplyQuestion(qId, ans)}
                  />
                )}

                {/* Main Message Content */}
                <div className="whitespace-pre-wrap break-words leading-relaxed text-[13px] select-text">
                  {msg.content}
                </div>

                {/* Performance & Token Meta for Assistant */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center space-x-2 pt-1 border-t border-[var(--border)]/40 text-[10px] text-[var(--muted-foreground)] font-mono select-none">
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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] mt-0.5 select-none">
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
        <div className="absolute bottom-28 left-4 right-4 max-w-lg mx-auto z-40 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-2xl animate-in slide-in-from-bottom-2 select-none">
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
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-t border-[var(--border)] bg-[var(--card)]/90 p-4 backdrop-blur-xs transition-colors ${
          isDraggingOver ? 'bg-[var(--primary)]/10 border-[var(--primary)] border-dashed' : ''
        }`}
      >
        <div className="mx-auto max-w-4xl space-y-2">
          {/* Attachments Preview Chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] py-0.5 pl-2.5 pr-1.5 text-[11px] text-[var(--foreground)] shadow-2xs"
                >
                  <FileText className="h-3 w-3 text-[var(--primary)]" />
                  <span className="max-w-[140px] truncate font-mono">{file.name}</span>
                  <span className="text-[9px] text-[var(--muted-foreground)]">
                    ({Math.round(file.size / 1024)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--error)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Status Meta Bar */}
          <div className="flex items-center justify-between px-1 text-[11px] text-[var(--muted-foreground)] select-none">
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

              {workspacePath ? (
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
              ) : (
                <>
                  <span className="text-[var(--border)]">•</span>
                  <span className="flex items-center space-x-1 text-[var(--primary)] font-medium">
                    <Sparkles className="h-3 w-3" />
                    <span>宿主免项目模式 (支持本地文档生成与命令执行)</span>
                  </span>
                </>
              )}
            </div>

            {/* Waiting prompt or normal shortcut hint */}
            {isWaitingForUser ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold animate-pulse text-[11px]">
                Agent 正在等待您的回复或确认...
              </span>
            ) : (
              <span className="hidden sm:inline-block text-[10px]">
                输入 <code>/</code> 唤出指令 · 支持拖拽添加附件 · Enter 发送
              </span>
            )}
          </div>

          {/* Textarea and Action Buttons */}
          <div className="flex items-end space-x-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-xs focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="添加文件或代码附件 (亦可直接拖拽文件至此)"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors select-none"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isWaitingForUser
                  ? `Agent 正在等待回复，请在此输入答复，或在上方卡片中直接点击选择...`
                  : workspacePath
                  ? `向 ASTeam Agent 指派任务（支持输入 /plan, /review, /diff，支持拖入附件）...`
                  : `指派本机宿主任务（例：“在桌面上生成系统设计文档”或“查询网络状态”，支持输入 /plan）...`
              }
              className="max-h-44 min-h-[28px] w-full resize-none bg-transparent px-2 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none select-text"
            />

            {isRunning && !isWaitingForUser ? (
              <button
                type="button"
                onClick={onStopAgent}
                title="停止当前任务"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--error)] text-[var(--error-foreground)] hover:opacity-90 transition-opacity shadow-xs select-none"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() && attachments.length === 0}
                title="发送指令"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs select-none"
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
