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
  Image as ImageIcon,
  Eye,
  Terminal,
  CornerDownLeft,
  AlertCircle,
  RefreshCw,
  Settings
} from 'lucide-react';
import { AgentTrajectory, AgentStep } from './AgentTrajectory';
import { InteractiveQuestionCard, QuestionCardData } from './InteractiveQuestionCard';
import { LiveTerminalCard } from './LiveTerminalCard';
import { ExecutionMode } from '../types/project';
import { PreviewData } from './WorkspaceDrawer';

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
  onOpenPreview?: (data: PreviewData) => void;
  onOpenTerminal?: () => void;
  onOpenSettings?: () => void;
  activeSessionId?: string;
  terminalOutputs?: Record<string, string>;
}

const SLASH_COMMANDS = [
  { cmd: '/plan', title: '深度任务规划 (Plan)', desc: '分析需求并生成分步执行计划，不进行破坏性修改' },
  { cmd: '/preview', title: '多模态产物实时预览', desc: '在右侧工作台开启网页/架构图/SVG实时预览' },
  { cmd: '/diff', title: '查看 Git 变更 Diff', desc: '唤起右侧 Git 代码变更对比抽屉' },
  { cmd: '/terminal', title: '交互式控制台大屏', desc: '在右侧工作台展开大屏级实时终端' },
  { cmd: '/review', title: 'Code Review 走查', desc: '调用 Code Review 专家技能审查当前修改与安全基线' },
  { cmd: '/test', title: '单测生成与运行', desc: '寻找测试套件，为核心函数生成并执行测试用例' },
  { cmd: '/grill-me', title: 'Grill-me 互动问答', desc: '进入采访决策模式：Agent 逐一向您抛出架构选型卡片' }
];

function extractPreviewableArtifact(content: string): PreviewData | null {
  if (!content) return null;

  // 1. Mermaid
  const mermaidMatch = content.match(/```mermaid\s*([\s\S]*?)```/i);
  if (mermaidMatch && mermaidMatch[1].trim()) {
    return {
      type: 'mermaid',
      title: 'Mermaid 架构流程拓扑图',
      content: mermaidMatch[1].trim()
    };
  }

  // 2. SVG
  const svgBlockMatch = content.match(/```(?:svg|xml)\s*(<svg[\s\S]*?<\/svg>)\s*```/i);
  if (svgBlockMatch && svgBlockMatch[1].trim()) {
    return {
      type: 'svg',
      title: 'SVG 矢量设计图',
      content: svgBlockMatch[1].trim()
    };
  }
  const rawSvgMatch = content.match(/(<svg\b[^>]*>[\s\S]*?<\/svg>)/i);
  if (rawSvgMatch && rawSvgMatch[1].trim()) {
    return {
      type: 'svg',
      title: 'SVG 矢量设计图',
      content: rawSvgMatch[1].trim()
    };
  }

  // 3. HTML
  const htmlMatch = content.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch && htmlMatch[1].trim()) {
    return {
      type: 'html',
      title: 'HTML 页面预览',
      content: htmlMatch[1].trim()
    };
  }

  return null;
}

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
  onOpenGitDiff,
  onOpenPreview,
  onOpenTerminal,
  onOpenSettings,
  activeSessionId,
  terminalOutputs
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

  // 动态侦测当前最新消息中是否有处于 running 状态的终端命令
  const lastMsg = messages[messages.length - 1];
  const activeRunningTerminalStep = (() => {
    if (!isRunning && !isWaitingForUser) return null;
    if (lastMsg?.role === 'assistant' && lastMsg.steps) {
      const step = lastMsg.steps.find(s => s.tool === 'run_terminal_command' && s.status === 'running');
      if (step) return step;
    }
    return null;
  })();

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
    if (!trimmed && attachments.length === 0) return;

    // 【重要】若当前处于终端命令运行中，输入的内容直接作为标准输入 (stdin) 发送给底层进程！
    if (activeRunningTerminalStep && activeSessionId && trimmed) {
      if (window.electronAPI) {
        window.electronAPI.sendTerminalInput(activeSessionId, trimmed);
      }
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    if (isRunning && !isWaitingForUser) return;

    if (trimmed === '/diff') {
      onOpenGitDiff?.();
      setInput('');
      setShowSlashMenu(false);
      return;
    }
    if (trimmed === '/preview') {
      onOpenPreview?.({ type: 'html', title: '多模态产物预览', content: '<h3>请选择消息中的 HTML / Mermaid / SVG 进行预览</h3>' });
      setInput('');
      setShowSlashMenu(false);
      return;
    }
    if (trimmed === '/terminal') {
      onOpenTerminal?.();
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
                ASTeam Agent (v1.2.0)
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                内核深度封装 <code className="font-semibold text-[var(--foreground)]">deepseek-harness</code>。全新支持 <strong>⚡ 实时交互控制台 (Live Terminal)</strong> 与 <strong>🖥️ 原生多模态产物实时预览 (HTML/Mermaid/SVG)</strong>，并融合 Word/PPT 双引擎排版生成。
              </p>
            </div>

            {/* Quick Prompt Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
              {[
                { title: '🎨 现代网页与架构拓扑图生成', prompt: '请为我们编写一个高颜值的数据监控大屏 HTML 页面（内置 Tailwind CSS），并在其后使用 Mermaid 绘制完整的系统高可用流式架构拓扑图。' },
                { title: '⚡ 实时运行系统巡检与交互命令', prompt: '请在终端执行网络连通性与本地开发环境巡检命令，并在控制台实时输出执行过程。' },
                { title: '📄 一键生成 Word (.docx) 方案白皮书', prompt: '请使用【公文方案与深度报告专家】技能，为我们团队撰写一份严谨规范的技术方案，并直接生成为 Word 文档保存在我的桌面上（文件名：企业级Agent架构白皮书.docx）。' },
                { title: '📊 一键生成 PPT (.pptx) 演说幻灯片', prompt: '请使用【商业提案与演说 PPT 架构师】技能，为我们生成一份 16:9 比例的商业路演幻灯片，包含核心金句与讲者逐字稿，并直接保存至桌面（文件名：AI智能底座路演汇报.pptx）。' }
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
                  <AgentTrajectory
                    steps={msg.steps}
                    sessionId={activeSessionId}
                    terminalOutputs={terminalOutputs}
                    onStopSession={onStopAgent}
                  />
                )}

                {/* Interactive Question Card if Agent prompted a question */}
                {msg.question && (
                  <InteractiveQuestionCard
                    data={msg.question}
                    onSubmitAnswer={(qId, ans) => onReplyQuestion(qId, ans)}
                  />
                )}

                {/* Multimodal Artifact Preview Banner if assistant generated HTML / Mermaid / SVG */}
                {msg.role === 'assistant' && (() => {
                  const artifact = extractPreviewableArtifact(msg.content);
                  if (!artifact || !onOpenPreview) return null;
                  return (
                    <div className="flex items-center justify-between rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-2 my-1 shadow-2xs">
                      <div className="flex items-center space-x-2">
                        <Eye className="h-4 w-4 text-[var(--primary)] shrink-0" />
                        <span className="text-xs font-semibold text-[var(--foreground)]">
                          已生成【{artifact.title}】
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenPreview(artifact)}
                        className="flex items-center space-x-1 rounded-lg bg-[var(--primary)] text-white px-2.5 py-1 text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>实时预览</span>
                      </button>
                    </div>
                  );
                })()}

                {/* Main Message Content with Intelligent Error Card handling */}
                {(() => {
                  const errorMarker = '⚠️ **执行遇到错误**:';
                  if (!msg.content.includes(errorMarker)) {
                    return (
                      <div className="whitespace-pre-wrap break-words leading-relaxed text-[13px] select-text">
                        {msg.content}
                      </div>
                    );
                  }

                  const parts = msg.content.split(errorMarker);
                  const normalText = parts[0]?.trim();
                  const errorText = parts.slice(1).join(errorMarker).trim();

                  return (
                    <div className="space-y-3">
                      {normalText && (
                        <div className="whitespace-pre-wrap break-words leading-relaxed text-[13px] select-text">
                          {normalText}
                        </div>
                      )}

                      {/* ASTeam Branded Error Diagnostic Card */}
                      <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--card)] p-4 shadow-sm animate-in fade-in select-text">
                        <div className="flex items-start space-x-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--error)]/10 text-[var(--error)] mt-0.5">
                            <AlertCircle className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-semibold text-xs text-[var(--error)]">
                                任务执行异常 / 服务网关反馈
                              </span>
                              <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                                {currentModel}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--foreground)] leading-relaxed mb-3 rounded-lg bg-[var(--muted)]/50 p-2.5 border border-[var(--border)] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {errorText}
                            </div>

                            <div className="flex items-center space-x-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  // Find the previous user prompt to retry
                                  const userMsgs = messages.filter(m => m.role === 'user');
                                  const lastUserMsg = userMsgs[userMsgs.length - 1];
                                  if (lastUserMsg) {
                                    onSendMessage(lastUserMsg.content, executionMode);
                                  }
                                }}
                                className="flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-xs"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                <span>重新尝试 (Retry)</span>
                              </button>

                              {onOpenSettings && (
                                <button
                                  type="button"
                                  onClick={onOpenSettings}
                                  className="flex items-center space-x-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                                >
                                  <Settings className="h-3.5 w-3.5" />
                                  <span>切换模型 / 线路</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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

        {/* 正在运行的独立交互控制台卡片 (直接置底浮现，与 ASteam UI 体系严格保持一致) */}
        {activeRunningTerminalStep && (
          <div className="my-4 rounded-2xl border border-[var(--primary)]/40 bg-[var(--card)] p-3.5 shadow-lg animate-in zoom-in-95 duration-150 select-text">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)] select-none">
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--primary)]"></span>
                </span>
                <span className="font-semibold text-xs text-[var(--foreground)] tracking-wide">
                  ⚡ 实时控制台管道已就绪 (Live Console)
                </span>
              </div>
              <span className="text-[10px] bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30 rounded-full px-2.5 py-0.5 font-medium animate-pulse">
                等待交互输入 (支持 stdin 交互)
              </span>
            </div>

            <LiveTerminalCard
              sessionId={activeSessionId || 'current'}
              stepId={activeRunningTerminalStep.id}
              command={activeRunningTerminalStep.args?.command}
              status="running"
              liveOutput={terminalOutputs?.[activeRunningTerminalStep.id] || (activeSessionId ? terminalOutputs?.[activeSessionId] : '') || ''}
              onStop={onStopAgent}
              isExpandable={false}
            />
          </div>
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
              <span className="text-[var(--primary)] font-semibold animate-pulse text-[11px]">
                Agent 正在等待您的回复或确认...
              </span>
            ) : (
              <span className="hidden sm:inline-block text-[10px]">
                输入 <code>/</code> 唤出指令 · 支持拖拽添加附件 · Enter 发送
              </span>
            )}
          </div>

          {/* Textarea and Action Buttons */}
          <div className={`flex items-end space-x-2 rounded-xl border p-2 shadow-xs transition-all ${
            activeRunningTerminalStep
              ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30 bg-[var(--card)]'
              : 'border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]'
          }`}>
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
                activeRunningTerminalStep
                  ? `⚡ 终端命令正在等待标准输入 (stdin)... 在此输入 y / n / 参数后按 Enter 即刻发送`
                  : isWaitingForUser
                  ? `Agent 正在等待回复，请在此输入答复，或在上方卡片中直接点击选择...`
                  : workspacePath
                  ? `向 ASTeam Agent 指派任务（支持输入 /plan, /review, /diff，支持拖入附件）...`
                  : `指派本机宿主任务（例：“在桌面上生成系统设计文档”或“查询网络状态”，支持输入 /plan）...`
              }
              className="max-h-44 min-h-[28px] w-full resize-none bg-transparent px-2 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none select-text"
            />

            {activeRunningTerminalStep ? (
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onStopAgent}
                  title="中断当前命令执行 (Ctrl+C)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/20 transition-colors shadow-xs select-none cursor-pointer"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  title="向终端发送输入 (Enter)"
                  className="flex h-8 items-center space-x-1 px-3 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-40 select-none"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  <span>发送至终端</span>
                </button>
              </div>
            ) : isRunning && !isWaitingForUser ? (
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
