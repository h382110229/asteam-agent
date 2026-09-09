import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Settings,
  ChevronDown,
  CheckCircle2,
  Loader2,
  Globe,
  Undo2,
  History,
  GitCompare,
  ScrollText,
  Layers,
  FolderOpen,
  Video,
  Volume2,
  Gauge,
  Users
} from 'lucide-react';
import { AgentTrajectory, AgentStep } from './AgentTrajectory';
import { InteractiveQuestionCard, QuestionCardData } from './InteractiveQuestionCard';
import { LiveTerminalCard } from './LiveTerminalCard';
import { ExecutionMode, CheckpointItem, WorkspaceFileItem, ProjectRulesInfo, SwarmState } from '../types/project';
import { PreviewData } from './WorkspaceDrawer';
import { inferModelCapabilities } from '../config/providers';
import { ConfirmModal } from './ConfirmModal';
import { SwarmDashboard } from './SwarmDashboard';

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
  checkpoint?: CheckpointItem;
  swarmState?: SwarmState;
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
  onRollbackCheckpoint?: (checkpointId: string) => Promise<boolean>;
  onOpenTimeline?: () => void;
  activeSessionId?: string;
  terminalOutputs?: Record<string, string>;
  onOpenRules?: () => void;
  onCompactSession?: () => void;
  onOpenScheduler?: () => void;
}

const SLASH_COMMANDS = [
  { cmd: '/swarm', title: '多智能体协同蜂群 (Swarm)', desc: '启动 Architect + Coder + Tester + Reviewer 4 角色分工协同研发' },
  { cmd: '/schedule', title: '后台自主巡检调度器 (Scheduler)', desc: '打开代码库自动化体检、依赖安全扫描与长程任务调度看板' },
  { cmd: '/compact', title: '智能浓缩长会话 (Compact)', desc: '提炼历史会话核心事实与代码产物，释放 Token 窗口与降低延迟' },
  { cmd: '/remember', title: '长期记忆沉淀 (Remember)', desc: '将当前架构约定或偏好终生持久化至项目/全局 Memory Bank' },
  { cmd: '/plan', title: '深度任务规划 (Plan)', desc: '分析需求并生成分步执行计划，不进行破坏性修改' },
  { cmd: '/preview', title: '多模态产物实时预览', desc: '在右侧工作台开启网页/架构图/SVG实时预览' },
  { cmd: '/diff', title: '查看 Git 变更 Diff', desc: '唤起右侧 Git 代码变更对比抽屉' },
  { cmd: '/terminal', title: '交互式控制台大屏', desc: '在右侧工作台展开大屏级实时终端' },
  { cmd: '/review', title: 'Code Review 走查', desc: '调用 Code Review 专家技能审查当前修改与安全基线' },
  { cmd: '/test', title: '单测生成与运行', desc: '寻找测试套件，为核心函数生成并执行测试用例' },
  { cmd: '/grill-me', title: 'Grill-me 互动问答', desc: '进入采访决策模式：Agent 逐一向您抛出架构选型卡片' }
];

export function extractPreviewableArtifact(content: string, steps?: AgentStep[]): PreviewData | null {
  // 1. 优先从规划执行步骤 (AgentStep[]) 中直接提取 write_file 生成的真实交付产物
  if (steps && steps.length > 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (step.tool === 'write_file' && step.args) {
        const filePath = step.args.filePath || step.args.path || step.args.file || '';
        const fileName = filePath.split(/[\\/]/).pop() || '';
        const contentStr = typeof step.args.content === 'string' ? step.args.content : '';

        if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
          if (contentStr.trim()) {
            return {
              type: 'html',
              title: fileName || 'HTML 页面预览',
              content: contentStr,
              filePath
            };
          }
        } else if (filePath.endsWith('.svg')) {
          if (contentStr.trim()) {
            return {
              type: 'svg',
              title: fileName || 'SVG 矢量设计图',
              content: contentStr,
              filePath
            };
          }
        } else if (filePath.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
          return {
            type: 'image',
            title: fileName || 'AI 生成图片',
            content: filePath,
            filePath
          };
        }
      } else if (step.tool === 'generate_image') {
        const imgUrlMatch = step.result ? step.result.match(/(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|webp|gif)[^\s)]*)/i) : null;
        const imgUrl = imgUrlMatch ? imgUrlMatch[1] : '';
        const isSuccess = step.result && (step.result.includes('保存本地路径') || step.result.includes('生成成功') || imgUrl);
        if (isSuccess || imgUrl) {
          const rawPath = (step.result && step.result.match(/(?:保存本地路径:\s*"([^"]+)")/)?.[1]) || step.args?.filePath || step.args?.path || '';
          const fileName = rawPath ? rawPath.split(/[\\/]/).pop() || '' : 'AI 图像生成';
          return {
            type: 'image',
            title: fileName || 'AI 图像生成',
            content: imgUrl || rawPath,
            filePath: rawPath
          };
        }
      } else if (step.tool === 'generate_video') {
        const vidUrlMatch = step.result ? step.result.match(/(https?:\/\/[^\s)]+\.(?:mp4|webm|mov)[^\s)]*)/i) : null;
        const vidUrl = vidUrlMatch ? vidUrlMatch[1] : '';
        const isDropped = step.result && (step.result.includes('视频生成成功并已落盘') || step.result.includes('本地保存路径:'));
        const isQueued = step.result && (step.result.includes('异步队列') || step.result.includes('后台队列') || step.result.includes('排队中'));
        
        // 仅当视频真正落地落盘或拥有可直链播放的地址，且非排队中时才作为交付物
        if ((vidUrl || isDropped) && !isQueued) {
          const rawPath = (step.result && step.result.match(/(?:本地保存路径:\s*"([^"]+)")/)?.[1]) || step.args?.filePath || step.args?.path || '';
          const fileName = rawPath ? rawPath.split(/[\\/]/).pop() || '' : 'AI 视频生成';
          return {
            type: 'video',
            title: fileName || 'AI 视频生成',
            content: vidUrl || rawPath,
            filePath: rawPath
          };
        }
      } else if (step.tool === 'text_to_speech') {
        const isSuccess = step.result && (step.result.includes('保存本地路径') || step.result.includes('TTS 语音合成成功'));
        if (isSuccess) {
          const rawPath = (step.result && step.result.match(/(?:保存本地路径:\s*"([^"]+)")/)?.[1]) || step.args?.filePath || step.args?.path || '';
          const fileName = rawPath ? rawPath.split(/[\\/]/).pop() || '' : 'AI 语音合成';
          return {
            type: 'audio',
            title: fileName || 'AI 语音合成',
            content: rawPath,
            filePath: rawPath
          };
        }
      }
    }
  }

  if (!content) return null;

  // 2. 检查正文中的 ```tool:write_file 代码块 (识别生成的目标 HTML 或 SVG 文件)
  const writeToolMatch = content.match(/```tool:write_file\s*([\s\S]*?)```/i);
  if (writeToolMatch) {
    const rawArgs = writeToolMatch[1].trim();
    const fileMatch = rawArgs.match(/"(?:filePath|path|file)"\s*:\s*"([^"]+)"/i);
    const filePath = fileMatch ? fileMatch[1] : '';
    const fileName = filePath.split(/[\\/]/).pop() || '';

    if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
      let htmlContent = '';
      try {
        const parsed = JSON.parse(rawArgs);
        htmlContent = parsed.content || '';
      } catch {
        const cMatch = rawArgs.match(/"content"\s*:\s*"([\s\S]*)"\s*}\s*$/);
        if (cMatch) {
          htmlContent = cMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
      if (htmlContent) {
        return {
          type: 'html',
          title: fileName || 'HTML 页面预览',
          content: htmlContent,
          filePath
        };
      }
    }

    if (filePath.endsWith('.svg')) {
      let svgContent = '';
      try {
        const parsed = JSON.parse(rawArgs);
        svgContent = parsed.content || '';
      } catch {
        const cMatch = rawArgs.match(/"content"\s*:\s*"([\s\S]*)"\s*}\s*$/);
        if (cMatch) {
          svgContent = cMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
      }
      if (svgContent) {
        return {
          type: 'svg',
          title: fileName || 'SVG 矢量设计图',
          content: svgContent,
          filePath
        };
      }
    }
  }

  // 3. 显式 HTML 代码块 ```html ... ```
  const htmlMatch = content.match(/```html\s*([\s\S]*?)```/i);
  if (htmlMatch && htmlMatch[1].trim()) {
    return {
      type: 'html',
      title: 'HTML 页面预览',
      content: htmlMatch[1].trim()
    };
  }

  // 4. 原始完整 HTML 文档 (<!DOCTYPE html ... </html>)
  const doctypeMatch = content.match(/(<!DOCTYPE\s+html[\s\S]*?<\/html>)/i);
  if (doctypeMatch && doctypeMatch[1].trim()) {
    return {
      type: 'html',
      title: 'HTML 页面预览',
      content: doctypeMatch[1].trim()
    };
  }

  // 5. Mermaid 架构流程图 ```mermaid ... ```
  const mermaidMatch = content.match(/```mermaid\s*([\s\S]*?)```/i);
  if (mermaidMatch && mermaidMatch[1].trim()) {
    return {
      type: 'mermaid',
      title: 'Mermaid 架构流程拓扑图',
      content: mermaidMatch[1].trim()
    };
  }

  // 6. 显式 SVG 代码块 ```svg 或 ```xml <svg ... </svg>
  const svgBlockMatch = content.match(/```(?:svg|xml)\s*(<svg[\s\S]*?<\/svg>)\s*```/i);
  if (svgBlockMatch && svgBlockMatch[1].trim()) {
    return {
      type: 'svg',
      title: 'SVG 矢量设计图',
      content: svgBlockMatch[1].trim()
    };
  }

  // 7. 独立完整 SVG 矢量图（必须带标准命名空间且长度 > 100，避免匹配 HTML 中的内联小图标）
  const rawSvgMatch = content.match(/(<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>[\s\S]*?<\/svg>)/i);
  if (rawSvgMatch && rawSvgMatch[1].trim() && rawSvgMatch[1].length > 100) {
    return {
      type: 'svg',
      title: 'SVG 矢量设计图',
      content: rawSvgMatch[1].trim()
    };
  }

  // 8. Markdown 图片引用语法: ![alt](url_or_path)
  const mdImgMatch = content.match(/!\[(.*?)\]\(((?:https?:\/\/[^\s)]+|data:image\/[^\s)]+|[^\s)]+\.(?:png|jpg|jpeg|webp|gif)))\)/i);
  if (mdImgMatch) {
    const title = mdImgMatch[1] || 'AI 生成图片';
    const src = mdImgMatch[2];
    return {
      type: 'image',
      title,
      content: src,
      filePath: src.startsWith('http') ? undefined : src
    };
  }

  // 9. Markdown 视频语法: [视频: alt](url.mp4) 或 ![alt](url.mp4)
  const mdVidMatch = content.match(/(?:!\[(.*?)\]|\[(?:视频|video|播放视频)?[：:]?\s*(.*?)\])\(((?:https?:\/\/[^\s)]+|[^\s)]+)\.(?:mp4|webm|mov))\)/i);
  if (mdVidMatch) {
    const title = mdVidMatch[1] || mdVidMatch[2] || 'AI 生成视频';
    const src = mdVidMatch[3];
    return {
      type: 'video',
      title,
      content: src,
      filePath: src.startsWith('http') ? undefined : src
    };
  }

  // 10. Markdown 音频语法: [音频: alt](url.mp3) 或 ![alt](url.mp3)
  const mdAudMatch = content.match(/(?:!\[(.*?)\]|\[(?:音频|audio|播放音频|语音)?[：:]?\s*(.*?)\])\(((?:https?:\/\/[^\s)]+|[^\s)]+)\.(?:mp3|wav|m4a|aac|flac|ogg))\)/i);
  if (mdAudMatch) {
    const title = mdAudMatch[1] || mdAudMatch[2] || 'AI 语音合成';
    const src = mdAudMatch[3];
    return {
      type: 'audio',
      title,
      content: src,
      filePath: src.startsWith('http') ? undefined : src
    };
  }

  return null;
}

function renderContentWithMedia(content: string, onOpenPreview?: (data: PreviewData) => void) {
  if (!content) return null;

  // 过滤清洗掉模型输出流中泄漏的原始工具调用标签 (例如 <tool_call>...</tool_call> 或 <tool:xxx>...</tool>)
  let cleanContent = content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<tool:[a-z_]+>[\s\S]*?<\/(?:tool:[a-z_]+|tool)>/gi, '')
    .replace(/<tool\s+(?:name|call)=["']?[a-z_]+["']?>[\s\S]*?<\/tool>/gi, '')
    .replace(/```(?:json:)?tool:[a-z_]+\s*[\s\S]*?```/gi, '')
    .trim();

  if (!cleanContent) return null;

  const mediaRegex = /(?:!\[(.*?)\]\(((?:https?:\/\/[^\s)]+|data:image\/[^\s)]+|[^\s)]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mov|mp3|wav|m4a|aac|flac|ogg)))\)|\[(?:视频|video|音频|audio|播放音频|语音)?[：:]?\s*(.*?)\]\(((?:https?:\/\/[^\s)]+|[^\s)]+)\.(?:mp4|webm|mov|mp3|wav|m4a|aac|flac|ogg))\))/gi;

  if (!mediaRegex.test(cleanContent)) {
    return (
      <div className="whitespace-pre-wrap break-words leading-relaxed text-[13px] select-text">
        {cleanContent}
      </div>
    );
  }

  mediaRegex.lastIndex = 0;
  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = mediaRegex.exec(cleanContent)) !== null) {
    if (match.index > lastIdx) {
      elements.push(
        <div key={`text-${lastIdx}`} className="whitespace-pre-wrap break-words leading-relaxed text-[13px] select-text">
          {cleanContent.slice(lastIdx, match.index)}
        </div>
      );
    }

    const alt = match[1] || match[3] || 'AI 产物';
    const src = match[2] || match[4] || '';
    const key = `media-${match.index}`;
    const lowerSrc = src.toLowerCase();

    const isVideo = lowerSrc.endsWith('.mp4') || lowerSrc.endsWith('.webm') || lowerSrc.endsWith('.mov');
    const isAudio = lowerSrc.endsWith('.mp3') || lowerSrc.endsWith('.wav') || lowerSrc.endsWith('.m4a') || lowerSrc.endsWith('.aac') || lowerSrc.endsWith('.flac') || lowerSrc.endsWith('.ogg');

    if (isVideo) {
      elements.push(
        <div key={key} className="my-3 max-w-lg rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-md group">
          <div className="relative overflow-hidden bg-black flex items-center justify-center p-2">
            <video
              src={src}
              controls
              className="max-h-96 w-full object-contain rounded-lg"
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--muted)]/40 border-t border-[var(--border)] text-xs">
            <span className="font-medium text-[var(--foreground)] truncate max-w-[280px]" title={alt}>
              🎬 {alt}
            </span>
            <div className="flex items-center space-x-2">
              {onOpenPreview && (
                <button
                  type="button"
                  onClick={() => onOpenPreview({ type: 'video', title: alt, content: src })}
                  className="text-[var(--primary)] hover:underline cursor-pointer flex items-center space-x-1 font-medium"
                >
                  <span>全屏播放</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    } else if (isAudio) {
      elements.push(
        <div key={key} className="my-3 max-w-lg rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-md p-3">
          <div className="flex items-center space-x-2.5 mb-2">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Volume2 className="h-4 w-4" />
            </div>
            <span className="font-medium text-xs text-[var(--foreground)] truncate max-w-[320px]" title={alt}>
              🎙️ {alt}
            </span>
          </div>
          <audio src={src} controls className="w-full h-8" />
        </div>
      );
    } else {
      // Image
      elements.push(
        <div key={key} className="my-3 max-w-lg rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-md group">
          <div className="relative overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center p-2">
            <img
              src={src}
              alt={alt}
              className="max-h-96 w-auto object-contain rounded-lg transition-transform group-hover:scale-[1.01] duration-200"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--muted)]/40 border-t border-[var(--border)] text-xs">
            <span className="font-medium text-[var(--foreground)] truncate max-w-[280px]" title={alt}>
              🎨 {alt}
            </span>
            <div className="flex items-center space-x-2">
              {onOpenPreview && (
                <button
                  type="button"
                  onClick={() => onOpenPreview({ type: 'image', title: alt, content: src })}
                  className="text-[var(--primary)] hover:underline cursor-pointer flex items-center space-x-1 font-medium"
                >
                  <span>全屏预览</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    lastIdx = mediaRegex.lastIndex;
  }

  if (lastIdx < content.length) {
    elements.push(
      <div key={`text-${lastIdx}`} className="whitespace-pre-wrap break-words leading-relaxed text-[13px] select-text">
        {content.slice(lastIdx)}
      </div>
    );
  }

  return <div className="space-y-1">{elements}</div>;
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
  onRollbackCheckpoint,
  onOpenTimeline,
  activeSessionId,
  terminalOutputs,
  onOpenRules,
  onCompactSession,
  onOpenScheduler
}) => {
  const [input, setInput] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto_edit');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    checkpoint: CheckpointItem | null;
  }>({ isOpen: false, checkpoint: null });

  // Token & Context Window Monitor calculation (v1.5.0)
  const totalEstimatedTokens = useMemo(() => {
    return messages.reduce((acc, m) => {
      const contentTokens = Math.round((m.content?.length || 0) * 0.75);
      const thoughtTokens = Math.round((m.thought?.length || 0) * 0.5);
      return acc + contentTokens + thoughtTokens;
    }, 0);
  }, [messages]);

  const contextLimit = 128000;
  const usagePercent = Math.min(100, Math.round((totalEstimatedTokens / contextLimit) * 100));

  const formatTokenCount = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return `${tokens}`;
  };

  const tokenBadgeClass =
    usagePercent > 75
      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
      : usagePercent > 50
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';

  const progressBarColorClass =
    usagePercent > 75 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500';

  // @ Unified Context Mention 状态 (@file / @git-diff / @skill)
  const [availableSkills, setAvailableSkills] = useState<any[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFileItem[]>([]);
  const [projectRules, setProjectRules] = useState<ProjectRulesInfo | null>(null);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionTab, setMentionTab] = useState<'all' | 'files' | 'git' | 'skills'>('all');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadContextData = async () => {
      if (!window.electronAPI) return;
      try {
        const [skills, rules] = await Promise.all([
          window.electronAPI.getAllSkills(workspacePath || null),
          window.electronAPI.getProjectRules ? window.electronAPI.getProjectRules(workspacePath || null) : Promise.resolve(null)
        ]);
        if (isMounted) {
          if (Array.isArray(skills)) setAvailableSkills(skills);
          setProjectRules(rules || null);
        }
        if (workspacePath && window.electronAPI.indexWorkspaceFiles) {
          const files = await window.electronAPI.indexWorkspaceFiles(workspacePath);
          if (isMounted && Array.isArray(files)) {
            setWorkspaceFiles(files);
          }
        } else {
          if (isMounted) setWorkspaceFiles([]);
        }
      } catch (e) {
        console.warn('Failed to load context mention data:', e);
      }
    };
    loadContextData();
    return () => {
      isMounted = false;
    };
  }, [workspacePath]);

  interface ContextMentionItem {
    type: 'file' | 'git' | 'skill';
    id: string;
    name: string;
    detail?: string;
    badge?: string;
    insertText: string;
  }

  const contextMentionItems = useMemo<ContextMentionItem[]>(() => {
    const items: ContextMentionItem[] = [];

    // 1. Git item
    if (workspacePath) {
      items.push({
        type: 'git',
        id: 'git-diff',
        name: '@git-diff (未提交代码变更)',
        detail: '注入当前工作区分支、修改文件清单及未提交 git diff 差异',
        badge: 'Git 变更',
        insertText: '@git-diff '
      });
    }

    // 2. File items (capped for responsive filtering)
    for (const f of workspaceFiles.slice(0, 600)) {
      items.push({
        type: 'file',
        id: f.relPath,
        name: f.name,
        detail: f.relPath,
        badge: f.ext.toUpperCase() || 'FILE',
        insertText: `@file:${f.relPath} `
      });
    }

    // 3. Skill items
    for (const s of availableSkills) {
      const isCustom = s.id.startsWith('custom:');
      const isWorkspace = s.id.startsWith('custom:workspace:');
      const cleanId = s.id.replace(/^custom:(global|workspace):/, '');
      items.push({
        type: 'skill',
        id: s.id,
        name: `@${cleanId} (${s.name})`,
        detail: s.description,
        badge: isWorkspace ? '项目技能' : isCustom ? '自定义' : '内置技能',
        insertText: `@${cleanId} `
      });
    }

    return items;
  }, [workspacePath, workspaceFiles, availableSkills]);

  const filteredMentionItems = useMemo(() => {
    let list = contextMentionItems;
    if (mentionTab === 'files') {
      list = list.filter(i => i.type === 'file');
    } else if (mentionTab === 'git') {
      list = list.filter(i => i.type === 'git');
    } else if (mentionTab === 'skills') {
      list = list.filter(i => i.type === 'skill');
    }

    if (!mentionQuery) return list.slice(0, 40);

    const q = mentionQuery.toLowerCase();
    return list.filter(item => {
      return (
        item.name.toLowerCase().includes(q) ||
        (item.detail && item.detail.toLowerCase().includes(q)) ||
        item.insertText.toLowerCase().includes(q)
      );
    }).slice(0, 40);
  }, [contextMentionItems, mentionTab, mentionQuery]);

  const handleSelectMention = (item: ContextMentionItem) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const cursor = textarea.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursor);
    const textAfterCursor = input.slice(cursor);

    const replacedBefore = textBeforeCursor.replace(/(?:^|\s)@([a-zA-Z0-9_\-:./\\]*)$/, (match) => {
      const prefix = match.startsWith(' ') ? ' ' : '';
      return `${prefix}${item.insertText}`;
    });

    const newInput = replacedBefore + textAfterCursor;
    setInput(newInput);
    setShowMentionMenu(false);

    setTimeout(() => {
      textarea.focus();
      const newCursor = replacedBefore.length;
      textarea.setSelectionRange(newCursor, newCursor);
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }, 0);
  };

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

  // 查找最近一条包含规划执行步骤的消息（支持运行中实时追踪与执行完毕后的结果常驻查看）
  const latestMsgWithSteps = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.steps && m.steps.length > 0) {
        return m;
      }
    }
    return null;
  })();

  const currentSteps = latestMsgWithSteps?.steps || [];
  const totalStepsCount = currentSteps.length;
  const completedStepsCount = currentSteps.filter(s => s.status === 'completed').length;
  const isAllStepsCompleted = totalStepsCount > 0 && completedStepsCount === totalStepsCount;

  // 实时捕获当前正在执行或等待的步骤，用于置顶任务进程看板
  const activeRunningStep = (() => {
    if (!isRunning) return null;
    if (currentSteps.length > 0) {
      const running = currentSteps.find(s => s.status === 'running');
      if (running) return running;
      const pending = currentSteps.find(s => s.status === 'pending');
      if (pending) return pending;
    }
    return null;
  })();

  const [isTopStepsDropdownOpen, setIsTopStepsDropdownOpen] = useState(false);
  const [dismissedBannerMsgId, setDismissedBannerMsgId] = useState<string | null>(null);

  // 当任务处于运行中，或已有规划步骤且未被用户手动关闭时，始终常驻置顶展示进程看板（彻底根除被信息流刷掉找不到进程的痛点）
  const shouldShowTopBanner = isRunning || (totalStepsCount > 0 && dismissedBannerMsgId !== latestMsgWithSteps?.id);

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
    // 优先处理 @ 上下文引用菜单的键盘上下导航、Tab/回车选取与 Esc 退出
    if (showMentionMenu && filteredMentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(i => (i + 1) % filteredMentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(i => (i - 1 + filteredMentionItems.length) % filteredMentionItems.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredMentionItems[selectedMentionIndex];
        if (selected) {
          handleSelectMention(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
    }

    if (showSlashMenu && (e.key === 'Escape' || e.key === 'Tab')) {
      setShowSlashMenu(false);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
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
      setShowMentionMenu(false);
      return;
    }
    if (trimmed === '/preview') {
      onOpenPreview?.({ type: 'html', title: '多模态产物预览', content: '<h3>请选择消息中的 HTML / Mermaid / SVG 进行预览</h3>' });
      setInput('');
      setShowSlashMenu(false);
      setShowMentionMenu(false);
      return;
    }
    if (trimmed === '/terminal') {
      onOpenTerminal?.();
      setInput('');
      setShowSlashMenu(false);
      setShowMentionMenu(false);
      return;
    }
    if (trimmed === '/schedule') {
      onOpenScheduler?.();
      setInput('');
      setShowSlashMenu(false);
      setShowMentionMenu(false);
      return;
    }

    let mode = executionMode;
    let textToSend = trimmed;

    if (trimmed.startsWith('/swarm')) {
      mode = 'swarm';
      textToSend = trimmed.replace('/swarm', '').trim() || '启动多智能体协同蜂群，由 Architect、Coder、Tester 与 Reviewer 分工协同完成当前目标。';
    } else if (trimmed.startsWith('/plan')) {
      mode = 'plan_only';
      textToSend = trimmed.replace('/plan', '').trim() || '请为当前工作区或需求制定详细的任务架构与实施规划。';
    } else if (trimmed.startsWith('/review')) {
      textToSend = trimmed.replace('/review', '').trim() || '请按照 Code Review 专家标准走查当前工作区的代码安全性与规范。';
    } else if (trimmed.startsWith('/test')) {
      textToSend = trimmed.replace('/test', '').trim() || '请为工作区核心模块生成单元测试并尝试在本地运行验证。';
    } else if (trimmed.startsWith('/grill-me')) {
      textToSend = trimmed.replace('/grill-me', '').trim() || '请开启 Grill-me 采访交互模式，针对当前项目逐一向我提问关键决策。';
    }

    // 核心跃升：自动展开 @git-diff / @git 上下文
    if ((textToSend.includes('@git-diff') || textToSend.includes('@git')) && workspacePath && window.electronAPI?.getGitDiffSummary) {
      try {
        const diffSummary = await window.electronAPI.getGitDiffSummary(workspacePath);
        if (diffSummary && (diffSummary.diffText || diffSummary.statusText)) {
          textToSend += `\n\n【用户显式引用当前工作区 Git 变更 (@git-diff)】\n${diffSummary.statusText}\n\`\`\`diff\n${diffSummary.diffText}\n\`\`\``;
        }
      } catch (e) {
        console.warn('Failed to fetch git diff summary:', e);
      }
    }

    // 核心跃升：自动展开 @file:<relPath> 上下文
    const fileMatches = Array.from(textToSend.matchAll(/@file:([^\s]+)/g));
    if (fileMatches.length > 0 && workspacePath && window.electronAPI?.readWorkspaceFile) {
      for (const match of fileMatches) {
        const relPath = match[1];
        try {
          const fileData = await window.electronAPI.readWorkspaceFile(workspacePath, relPath);
          if (fileData.success && fileData.content !== undefined) {
            const ext = relPath.split('.').pop() || '';
            textToSend += `\n\n【用户显式引用文件: ${relPath}】\n\`\`\`${ext}\n${fileData.content}\n\`\`\``;
          }
        } catch (e) {
          console.warn(`Failed to read referenced file ${relPath}:`, e);
        }
      }
    }

    onSendMessage(textToSend, mode, attachments);
    setInput('');
    setAttachments([]);
    setShowSlashMenu(false);
    setShowMentionMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;

    // 侦测光标位置前的 @ 上下文提及触发词
    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\-:./\\]*)$/);

    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      setMentionQuery(query);
      if (query.startsWith('file:') || query.startsWith('file')) {
        setMentionTab('files');
      } else if (query.startsWith('git')) {
        setMentionTab('git');
      } else if (query.startsWith('skill')) {
        setMentionTab('skills');
      }
      setShowMentionMenu(true);
      setSelectedMentionIndex(0);
      setShowSlashMenu(false);
    } else {
      setShowMentionMenu(false);
      if (val === '/' || (val.startsWith('/') && !val.includes(' '))) {
        setShowSlashMenu(true);
      } else {
        setShowSlashMenu(false);
      }
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
      const isImage = file.type.startsWith('image/');
      const isText = file.type.startsWith('text/') ||
        /\.(ts|tsx|js|jsx|json|md|py|go|rs|c|cpp|h|css|html|xml|yaml|yml|sh|env|sql|csv)$/i.test(file.name);

      const reader = new FileReader();

      if (isImage) {
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          setAttachments(prev => [...prev, {
            name: file.name || `image_${Date.now()}.png`,
            size: file.size,
            type: file.type || 'image/png',
            content
          }]);
        };
        reader.readAsDataURL(file);
      } else if (isText && file.size < 512 * 1024) {
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
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          setAttachments(prev => [...prev, {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            content
          }]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = Array.from(clipboardData.items || []);
    const fileItems = items.filter(item => item.kind === 'file');

    if (fileItems.length > 0) {
      const files: File[] = [];
      for (const item of fileItems) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length > 0) {
        e.preventDefault();
        processFiles(files);
      }
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

      {/* 实时置顶任务进程动态看板：支持运行中监控与完成态常驻，并可就地一键展开步骤全貌 */}
      {shouldShowTopBanner && (
        <div className="z-30 shrink-0 border-b border-[var(--primary)]/30 bg-[var(--card)]/95 shadow-sm backdrop-blur-md select-none transition-all">
          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
            <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
              {isRunning ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--primary)]"></span>
                </span>
              ) : isAllStepsCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--primary)] shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
              )}

              <div className="flex items-center space-x-2 min-w-0 truncate">
                <span className="font-semibold text-xs text-[var(--foreground)] truncate">
                  {isRunning
                    ? (activeRunningStep ? `正在执行: ${activeRunningStep.title}` : 'Agent 需求分析与自主调度中...')
                    : `deepseek-harness 规划与执行已就绪 (${completedStepsCount}/${totalStepsCount} 步骤完成)`
                  }
                </span>

                {isRunning && activeRunningStep?.tool && (
                  <span className="rounded bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20 px-1.5 py-0.5 text-[10px] font-mono shrink-0">
                    {activeRunningStep.tool}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {/* Project Rules Badge - v1.4.0 */}
              {projectRules?.hasRules && (
                <div
                  className="hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-medium"
                  title={`当前项目规约已强制激活: ${projectRules.filePath}`}
                >
                  <ScrollText className="h-3 w-3" />
                  <span>规约已激活 ({projectRules.ruleType === 'asteamrules' ? '.asteamrules' : 'ASTEAM.md'})</span>
                </div>
              )}

              {/* Progress track */}
              {totalStepsCount > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-300"
                      style={{ width: `${Math.round((completedStepsCount / Math.max(1, totalStepsCount)) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
                    {completedStepsCount}/{totalStepsCount}
                  </span>
                </div>
              )}

              {/* Toggle Steps Checklist Button */}
              {totalStepsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setIsTopStepsDropdownOpen(!isTopStepsDropdownOpen)}
                  className="flex items-center space-x-1 rounded-md bg-[var(--muted)] hover:bg-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)] font-medium transition-colors cursor-pointer"
                  title="展开/收起步骤清单"
                >
                  <span>{isTopStepsDropdownOpen ? '收起步骤' : '检视步骤'}</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isTopStepsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Stop button while running */}
              {isRunning && (
                <button
                  type="button"
                  onClick={onStopAgent}
                  className="flex items-center space-x-1 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 px-2 py-1 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>中止</span>
                </button>
              )}

              {/* Dismiss button when completed */}
              {!isRunning && (
                <button
                  type="button"
                  onClick={() => setDismissedBannerMsgId(latestMsgWithSteps?.id || 'dismissed')}
                  className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                  title="隐藏顶部看板"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Steps Drawer right from top banner */}
          {isTopStepsDropdownOpen && currentSteps.length > 0 && (
            <div className="border-t border-[var(--border)] bg-[var(--card)]/98 p-3 max-h-56 overflow-y-auto space-y-2 text-xs shadow-inner animate-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-medium pb-1 border-b border-[var(--border)]/40 mb-1.5">
                <span>任务执行全流程检查清单</span>
                <span>共 {currentSteps.length} 个规划步骤</span>
              </div>
              {currentSteps.map((step, idx) => (
                <div
                  key={step.id || idx}
                  className="flex items-center justify-between rounded-lg bg-[var(--muted)]/40 p-2 border border-[var(--border)]/50"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    {step.status === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                    ) : step.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)] shrink-0" />
                    ) : step.status === 'failed' ? (
                      <AlertCircle className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-dashed border-[var(--muted-foreground)] shrink-0" />
                    )}
                    <span className="font-medium text-xs text-[var(--foreground)] truncate">
                      {idx + 1}. {step.title}
                    </span>
                    {step.tool && (
                      <span className="rounded bg-[var(--background)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)] border border-[var(--border)] shrink-0">
                        {step.tool}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-mono shrink-0 ml-2 ${
                    step.status === 'completed' ? 'text-[var(--primary)]' :
                    step.status === 'running' ? 'text-amber-500 font-bold' :
                    step.status === 'failed' ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'
                  }`}>
                    {step.status === 'completed' ? '已完成' :
                     step.status === 'running' ? '执行中...' :
                     step.status === 'failed' ? '失败' : '排队中'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

                {/* Swarm Multi-Agent Collaboration Dashboard */}
                {msg.swarmState && (
                  <SwarmDashboard
                    swarmState={msg.swarmState}
                    isRunning={isRunning && msg.id === messages[messages.length - 1]?.id}
                  />
                )}

                {/* deepseek-harness Planning & Execution Trajectory Tree */}
                {msg.steps && msg.steps.length > 0 && !msg.swarmState && (
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

                {/* Main Message Content with Intelligent Error Card handling */}
                {(() => {
                  const errorMarker = '⚠️ **执行遇到错误**:';
                  if (!msg.content.includes(errorMarker)) {
                    return renderContentWithMedia(msg.content, onOpenPreview);
                  }

                  const parts = msg.content.split(errorMarker);
                  const normalText = parts[0]?.trim();
                  const errorText = parts.slice(1).join(errorMarker).trim();

                  return (
                    <div className="space-y-3">
                      {normalText && renderContentWithMedia(normalText, onOpenPreview)}

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

                {/* 任务步骤里程碑快速回顾 (置底呈现，与交付制品并列，阅读完长文结论无需往上翻找) */}
                {msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs select-none">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                      <span className="font-semibold text-xs text-[var(--foreground)]">
                        规划与执行轨迹归档 ({msg.steps.filter(s => s.status === 'completed').length} / {msg.steps.length} 步骤已通过)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTopStepsDropdownOpen(true);
                      }}
                      className="text-xs text-[var(--primary)] hover:underline flex items-center space-x-1 cursor-pointer font-medium"
                    >
                      <span>展开顶部步骤全貌</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Multimodal Artifact Preview Card (置于结论最下方，突出交付物) */}
                {msg.role === 'assistant' && (() => {
                  const artifact = extractPreviewableArtifact(msg.content || msg.thought || '', msg.steps);
                  if (!artifact || !onOpenPreview) return null;
                  return (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/5 p-3 shadow-xs hover:border-[var(--primary)] transition-all">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
                          {artifact.type === 'image' ? <ImageIcon className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                            交付物就绪：{artifact.title}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            类型: {artifact.type.toUpperCase()} · 点击即可在工作台独立分栏中查看高保真效果
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                        {artifact.filePath && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.electronAPI?.showItemInFolder) {
                                window.electronAPI.showItemInFolder(artifact.filePath!);
                              }
                            }}
                            title="在系统文件资源管理器中定位"
                            className="flex items-center space-x-1 rounded-lg border border-[var(--primary)]/40 bg-white/80 dark:bg-[var(--card)] text-[var(--primary)] hover:bg-[var(--primary)]/10 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">资源管理器定位</span>
                          </button>
                        )}
                        {artifact.type === 'html' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.electronAPI?.openInBrowser) {
                                window.electronAPI.openInBrowser({
                                  content: artifact.content,
                                  title: artifact.title,
                                  defaultPath: artifact.filePath
                                });
                              }
                            }}
                            title="在系统默认浏览器中打开全屏真实大屏 (Chrome/Edge)"
                            className="flex items-center space-x-1 rounded-lg border border-[var(--primary)]/40 bg-white/80 dark:bg-[var(--card)] text-[var(--primary)] hover:bg-[var(--primary)]/10 px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">浏览器打开</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenPreview(artifact)}
                          className="flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer shadow-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>打开实时预览</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* 影子快照与时光机一键回滚 (Checkpoint & 1-Click Rollback - v1.4.0) */}
                {msg.role === 'assistant' && msg.checkpoint && (
                  <div className="mt-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-3 shadow-2xs animate-in fade-in select-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
                          <History className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                              影子快照已生成 ({msg.checkpoint.id})
                            </span>
                            <span className="rounded bg-[var(--muted)] px-1.5 py-0.2 text-[9px] font-mono text-[var(--muted-foreground)]">
                              {new Date(msg.checkpoint.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)] truncate">
                            变更记录: {msg.checkpoint.modifiedFiles.length} 个修改, {msg.checkpoint.newFiles.length} 个新建文件
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 ml-2">
                        {msg.checkpoint.rolledBack ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>本轮修改已撤销还原</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={rollingBackId === msg.checkpoint.id}
                            onClick={() => {
                              if (!onRollbackCheckpoint) return;
                              setConfirmModalState({
                                isOpen: true,
                                checkpoint: msg.checkpoint!
                              });
                            }}
                            className="flex items-center space-x-1.5 rounded-lg bg-[var(--card)] hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-2.5 py-1 text-xs font-medium transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                            title="1 秒还原工作区至本轮修改前的状态"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            <span>{rollingBackId === msg.checkpoint.id ? '正在回滚...' : '⏪ 撤销本轮修改'}</span>
                          </button>
                        )}

                        {onOpenTimeline && (
                          <button
                            type="button"
                            onClick={onOpenTimeline}
                            className="flex items-center space-x-1 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1 text-xs font-medium transition-all cursor-pointer shadow-2xs"
                            title="打开右侧工作台查看时光机完整快照库"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>时光机</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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

      {/* Unified Context Mention Autocomplete Popup (@ Context Hub: @file / @git-diff / @skill - v1.4.0) */}
      {showMentionMenu && (
        <div className="absolute bottom-28 left-4 right-4 max-w-xl mx-auto z-40 rounded-xl border border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md p-2 shadow-2xl animate-in slide-in-from-bottom-2 select-none">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border)] mb-1.5">
            <div className="flex items-center space-x-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--primary)] text-white">
                <Sparkles className="h-3 w-3" />
              </span>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                全能 @ 上下文引用中枢
              </span>
            </div>
            {/* Category Filter Tabs */}
            <div className="flex items-center space-x-1 bg-[var(--muted)] p-0.5 rounded-lg text-[10px]">
              <button
                type="button"
                onClick={() => setMentionTab('all')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                  mentionTab === 'all' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-2xs font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                全部 ({contextMentionItems.length})
              </button>
              <button
                type="button"
                onClick={() => setMentionTab('files')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                  mentionTab === 'files' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-2xs font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <FileCode className="h-2.5 w-2.5" />
                <span>文件 ({workspaceFiles.length})</span>
              </button>
              {workspacePath && (
                <button
                  type="button"
                  onClick={() => setMentionTab('git')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                    mentionTab === 'git' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-2xs font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <GitCompare className="h-2.5 w-2.5" />
                  <span>Git 变更</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setMentionTab('skills')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                  mentionTab === 'skills' ? 'bg-[var(--card)] text-[var(--foreground)] shadow-2xs font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <Zap className="h-2.5 w-2.5" />
                <span>技能 ({availableSkills.length})</span>
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {filteredMentionItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                未找到匹配 "{mentionQuery}" 的上下文项（支持搜索文件、Git 变更或技能）
              </div>
            ) : (
              filteredMentionItems.map((item, idx) => {
                const isSelected = idx === selectedMentionIndex;
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => handleSelectMention(item)}
                    onMouseEnter={() => setSelectedMentionIndex(idx)}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 cursor-pointer text-xs transition-colors ${
                      isSelected
                        ? 'bg-[var(--primary)]/15 text-[var(--foreground)]'
                        : 'hover:bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate pr-2 min-w-0">
                      {item.type === 'file' ? (
                        <FileCode className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      ) : item.type === 'git' ? (
                        <GitCompare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                      )}
                      <span className="font-mono font-semibold text-[var(--foreground)] text-xs truncate">
                        {item.name}
                      </span>
                      {item.detail && item.detail !== item.name && (
                        <span className="text-[11px] text-[var(--muted-foreground)] truncate hidden sm:inline">
                          · {item.detail}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {item.badge && (
                        <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${
                          item.type === 'git'
                            ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                            : item.type === 'file'
                            ? 'bg-blue-500/15 text-blue-500 border-blue-500/30 font-mono'
                            : 'bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between px-2 pt-1 border-t border-[var(--border)]/40 text-[10px] text-[var(--muted-foreground)]">
            <span>↑↓ 导航 · 回车/Tab 选择上屏 · Esc 退出</span>
            <span>输入 @file: 搜文件 · @git 搜变更 · @ 搜技能</span>
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
                  {file.type?.startsWith('image/') && file.content ? (
                    <img src={file.content} alt={file.name} className="h-4 w-4 rounded object-cover" />
                  ) : (
                    <FileText className="h-3 w-3 text-[var(--primary)]" />
                  )}
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

          {/* Vision Mismatch Defensive Hint */}
          {attachments.some(a => a.type?.startsWith('image/')) && !inferModelCapabilities(currentModel).includes('vision') && (
            <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400 animate-in fade-in-50">
              <div className="flex items-center space-x-1.5 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  当前主模型 <strong className="font-semibold">{currentModel}</strong> 为纯文本架构，无法直接识别图像。系统在调用时将自动路由至具备 Vision 能力的备用线路。
                </span>
              </div>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="ml-2 underline font-medium hover:text-amber-500 shrink-0 cursor-pointer"
                >
                  检查线路配置
                </button>
              )}
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
                <button
                  type="button"
                  onClick={() => setExecutionMode('swarm')}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    executionMode === 'swarm'
                      ? 'bg-teal-600 text-white shadow-2xs dark:bg-teal-500'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title="多智能体协同蜂群模式：Architect + Coder + Tester + Reviewer 4 角色并发分工协同"
                >
                  <Users className="h-3 w-3" />
                  <span>蜂群协同 (Swarm)</span>
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

                  <span className="text-[var(--border)]">•</span>
                  <button
                    type="button"
                    onClick={onOpenRules}
                    className={`flex items-center space-x-1 font-medium transition-colors cursor-pointer ${
                      projectRules?.hasRules
                        ? 'text-emerald-600 dark:text-emerald-400 hover:underline'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--primary)]'
                    }`}
                    title={projectRules?.hasRules ? `项目规约已生效 (${projectRules.filePath})，点击查看/切换` : '该项目未配置行为准则，点击一键生成'}
                  >
                    <ScrollText className="h-3 w-3" />
                    <span>{projectRules?.hasRules ? '📜 规约已生效' : '📜 规约未配置'}</span>
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
                输入 <code>/compact</code> 浓缩上下文 · 输入 <code>/remember</code> 沉淀记忆 · 输入 <code>@</code> 引用技能 · 支持拖拽/粘贴附件 · Enter 发送
              </span>
            )}
          </div>

          {/* Textarea and Action Buttons */}
          <div className={`flex items-end space-x-2 rounded-xl border p-2 shadow-xs transition-all ${
            activeRunningTerminalStep
              ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30 bg-[var(--card)]'
              : 'border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]'
          }`}>
            {/* Hidden File Input & Attachment Button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="添加文件或代码附件 (支持点击选择、直接拖拽或 Ctrl+V 粘贴)"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors select-none cursor-pointer"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                activeRunningTerminalStep
                  ? `⚡ 终端命令正在等待标准输入 (stdin)... 在此输入 y / n / 参数后按 Enter 即刻发送`
                  : isWaitingForUser
                  ? `Agent 正在等待回复，请在此输入答复，或在上方卡片中直接点击选择...`
                  : workspacePath
                  ? `指派任务（支持输入 /remember 沉淀记忆，输入 @ 唤出技能，支持拖入附件）...`
                  : `指派本机任务（支持输入 /remember 沉淀全局记忆，输入 @ 唤出技能，支持拖拽附件）...`
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

        {/* 底部 Token 水位与上下文监控看板 (v1.5.0) */}
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-[var(--border)] bg-[var(--background)]/90 text-[10px] text-[var(--muted-foreground)] select-none shrink-0">
          {/* Left: Model & Provider & Workspace */}
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 font-mono font-medium text-[var(--foreground)]">
              <Cpu className="h-3 w-3 text-[var(--primary)]" />
              <span>{currentModel || 'Auto'}</span>
            </span>
            <span className="text-[var(--border)]">|</span>
            <span className="truncate max-w-[130px]" title={`模型服务商: ${providerName}`}>
              {providerName || 'LLMAPI'}
            </span>
            {workspacePath && (
              <>
                <span className="text-[var(--border)]">|</span>
                <span className="truncate max-w-[150px] text-[var(--muted-foreground)]" title={workspacePath}>
                  📁 {workspacePath.split(/[\\/]/).pop()}
                </span>
              </>
            )}
          </div>

          {/* Right: Token Monitor & /compact trigger */}
          <div className="flex items-center space-x-3">
            <div
              className="flex items-center space-x-1.5 cursor-help"
              title={`会话预估总消耗: ~${totalEstimatedTokens.toLocaleString()} Tokens\n模型上下文窗口上限: ${contextLimit.toLocaleString()} Tokens\n当前水位占比: ${usagePercent}%`}
            >
              <Gauge className="h-3 w-3 text-[var(--muted-foreground)]" />
              <span>上下文:</span>
              <span className="font-mono font-medium text-[var(--foreground)]">
                {formatTokenCount(totalEstimatedTokens)} / {formatTokenCount(contextLimit)}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold ${tokenBadgeClass}`}>
                {usagePercent}%
              </span>
              {/* Slim progress bar */}
              <div className="w-14 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${progressBarColorClass}`}
                  style={{ width: `${Math.min(100, Math.max(2, usagePercent))}%` }}
                />
              </div>
            </div>

            <span className="text-[var(--border)]">|</span>

            {/* Quick /compact Action Button */}
            <button
              type="button"
              onClick={onCompactSession}
              title="智能浓缩会话前序交互，提炼核心事实与关键产物，释放 Token 窗口空间"
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-all cursor-pointer ${
                usagePercent > 70
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 font-semibold animate-pulse'
                  : 'hover:bg-[var(--border)] text-[var(--foreground)] hover:text-[var(--primary)]'
              }`}
            >
              <Sparkles className="h-2.5 w-2.5 text-amber-500" />
              <span>{usagePercent > 70 ? '⚠️ 立即浓缩 (/compact)' : '浓缩 (/compact)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 优雅现代确认弹窗 (替换原生系统 win32 confirm 弹窗) */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState({ isOpen: false, checkpoint: null })}
        onConfirm={async () => {
          if (!confirmModalState.checkpoint || !onRollbackCheckpoint) return;
          const ckptId = confirmModalState.checkpoint.id;
          setRollingBackId(ckptId);
          setConfirmModalState({ isOpen: false, checkpoint: null });
          try {
            await onRollbackCheckpoint(ckptId);
          } finally {
            setRollingBackId(null);
          }
        }}
        title="确认撤销本轮修改"
        description="确定要撤销本轮 Agent 产生的所有代码修改吗？系统将根据影子快照在 1 秒内原子级还原被修改文件并自动清理新建文件。"
        files={{
          modified: confirmModalState.checkpoint?.modifiedFiles,
          added: confirmModalState.checkpoint?.newFiles
        }}
        confirmText="立即撤销回滚"
        cancelText="暂不撤销"
        isDanger={true}
        isLoading={rollingBackId !== null}
        iconType="rollback"
      />
    </main>
  );
};
