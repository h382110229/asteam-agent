import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Square,
  Sparkles,
  Bot,
  User,
  FolderGit2,
  Folder,
  Cpu,
  Clock,
  Zap,
  Copy,
  Check,
  Paperclip,
  X,
  FileText,
  FileCode,
  FileUp,
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
  Users,
  FileSpreadsheet,
  Download,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AgentTrajectory, AgentStep } from './AgentTrajectory';
import { InteractiveQuestionCard, QuestionCardData } from './InteractiveQuestionCard';
import { LiveTerminalCard } from './LiveTerminalCard';
import { ExecutionMode, CheckpointItem, WorkspaceFileItem, ProjectRulesInfo, SwarmState } from '../types/project';
import { PreviewData } from './WorkspaceDrawer';
import { inferModelCapabilities, getModelContextLimit } from '../config/providers';
import { ConfirmModal } from './ConfirmModal';
import { SwarmDashboard } from './SwarmDashboard';

export interface FileAttachment {
  name: string;
  size: number;
  type: string;
  content?: string;
  localPath?: string;
  extractedImages?: Array<{
    id: string;
    name: string;
    localPath: string;
    mimeType: string;
    size: number;
    base64?: string;
    locationHint?: string;
  }>;
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
  tokenStats?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  artifacts?: Array<{
    filePath: string;
    sizeBytes: number;
    mtimeMs: number;
    verified?: boolean;
    title?: string;
    type?: string;
  }>;
}

interface ChatAreaProps {
  messages: ChatMessageItem[];
  isRunning: boolean;
  isWaitingForUser?: boolean;
  onSendMessage: (text: string, mode: ExecutionMode, attachments?: FileAttachment[], activeSkillIds?: string[]) => void;
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
  onOpenSwarm?: () => void;
  enabledSkills?: string[];
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
  { cmd: '/skill', title: '智能生成与固化技能 (Skill Generator)', desc: '调用技能架构师，根据当前对话与使用偏好自动设计、生成并安装专属 Skill' },
  { cmd: '/grill-me', title: 'Grill-me 互动问答', desc: '进入采访决策模式：Agent 逐一向您抛出架构选型卡片' }
];

export interface DetectedArtifactItem {
  id: string;
  title: string;
  filePath: string;
  sizeBytes?: number;
  type: 'excel' | 'text' | 'html' | 'svg' | 'image' | 'video' | 'audio' | 'docx' | 'pptx' | 'pdf' | 'file';
}

export function extractAllArtifactsFromMessage(msg: ChatMessageItem): DetectedArtifactItem[] {
  const items: DetectedArtifactItem[] = [];
  const seen = new Set<string>();

  const getCleanExt = (p: string) => {
    return p.split('.').pop()?.toLowerCase() || '';
  };

  const getArtifactType = (p: string): DetectedArtifactItem['type'] => {
    const ext = getCleanExt(p);
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
    if (['txt', 'json', 'py', 'sh', 'sql', 'cfg', 'log', 'yaml', 'yml', 'md'].includes(ext)) return 'text';
    if (['html', 'htm'].includes(ext)) return 'html';
    if (['svg'].includes(ext)) return 'svg';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
    if (['docx', 'doc'].includes(ext)) return 'docx';
    if (['pptx', 'ppt'].includes(ext)) return 'pptx';
    if (['pdf'].includes(ext)) return 'pdf';
    return 'file';
  };

  // 1. 优先使用后端物理探针核验通过的真实落盘结构化数据
  if (msg.artifacts && msg.artifacts.length > 0) {
    for (const a of msg.artifacts) {
      if (a.filePath && !seen.has(a.filePath.toLowerCase())) {
        seen.add(a.filePath.toLowerCase());
        const fileName = a.filePath.split(/[\\/]/).pop() || '交付物';
        items.push({
          id: `art-${items.length}`,
          title: a.title || fileName,
          filePath: a.filePath,
          sizeBytes: a.sizeBytes,
          type: getArtifactType(a.filePath)
        });
      }
    }
  }

  // 2. 从消息文本与思考流中智能正则扫描落盘文件路径 (彻底解决控制台脚本生成物与历史消息)
  const fullText = (msg.content || '') + '\n' + (msg.thought || '');
  const pathRegex = /(?:[a-zA-Z]:[\\/][^"'\r\n<>|*?`\s\uff0c\u3002]+?\.(?:xlsx|xls|csv|txt|cfg|docx|doc|pdf|pptx|zip|html|json|py|sh|sql))/gi;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(fullText)) !== null) {
    const rawPath = match[0].trim();
    if (!seen.has(rawPath.toLowerCase())) {
      seen.add(rawPath.toLowerCase());
      const fileName = rawPath.split(/[\\/]/).pop() || '';
      items.push({
        id: `art-regex-${items.length}`,
        title: fileName,
        filePath: rawPath,
        type: getArtifactType(rawPath)
      });
    }
  }

  // 3. 兜底旧版单项提取器
  if (items.length === 0) {
    const fallback = extractPreviewableArtifact(msg.content || msg.thought || '', msg.steps);
    if (fallback && fallback.filePath && !seen.has(fallback.filePath.toLowerCase())) {
      items.push({
        id: `art-fallback-0`,
        title: fallback.title || '交付物',
        filePath: fallback.filePath,
        type: getArtifactType(fallback.filePath)
      });
    }
  }

  return items;
}

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

/**
 * Grill-me & 结构化问卷智能提取器 (v1.8.2 / v2.0.1 兜底保活)
 * 当大模型未显式调用 ask_question 工具而是在正文中输出带有编号的选项问卷时，自动提取并渲染交互卡片
 */
function extractQuestionsFromText(raw: string): { intro: string; questions: Array<{ question: string; options: string[] }> } | null {
  if (!raw || typeof raw !== 'string') return null;
  const regex = /(?:^|[\r\n]+|[:：；;]|\s{2,}|\s)(?:(\d+)[\.、\)]|Q(\d+)[:：])\s*(?!\d)/gi;
  const matches: Array<{ index: number; digit: number }> = [];
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const digitStr = match[1] || match[2];
    const digit = parseInt(digitStr, 10);
    const digitOffset = match[0].indexOf(digitStr);
    matches.push({
      index: match.index + digitOffset,
      digit
    });
  }
  if (matches.length <= 1) return null;
  if (matches[0].digit !== 1) return null;
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].digit !== matches[i - 1].digit + 1) return null;
  }
  const intro = raw.slice(0, matches[0].index).trim();
  const slices: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : raw.length;
    slices.push(raw.slice(start, end).trim());
  }
  const questions = slices.map(s => {
    const cleaned = s.replace(/^(?:\d+[\.、\)]|Q\d+[:：])\s*/, '').trim();
    const parts = cleaned.split(/(?:\r?\n\s*[-•–*]\s*|\s+[-•–*]\s+)/);
    if (parts.length > 1) {
      return {
        question: parts[0].trim().replace(/[:：\s]+$/, ''),
        options: parts.slice(1).map(o => o.replace(/^[-•–*\s]+/, '').trim()).filter(Boolean)
      };
    }
    return { question: cleaned, options: [] };
  });
  return { intro, questions };
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
    return <MarkdownRenderer content={cleanContent} onOpenPreview={onOpenPreview} />;
  }

  mediaRegex.lastIndex = 0;
  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = mediaRegex.exec(cleanContent)) !== null) {
    if (match.index > lastIdx) {
      elements.push(
        <MarkdownRenderer
          key={`text-${lastIdx}`}
          content={cleanContent.slice(lastIdx, match.index)}
          onOpenPreview={onOpenPreview}
        />
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
  onOpenScheduler,
  onOpenSwarm,
  enabledSkills
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

  // 技能动态挂载与快速勾选状态 (v1.11.0 / v1.11.1 / v2.0.2 / v2.2.0)
  const [mountedSkillIds, setMountedSkillIds] = useState<string[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillPickerSearch, setSkillPickerSearch] = useState('');
  const [isSkillsBarExpanded, setIsSkillsBarExpanded] = useState(false);
  const [isImportingFolder, setIsImportingFolder] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('2.0.2');

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(v => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }
  }, []);

  // 同步全局启用的技能列表至当前会话挂载状态
  useEffect(() => {
    if (enabledSkills && Array.isArray(enabledSkills) && enabledSkills.length > 0) {
      setMountedSkillIds(prev => Array.from(new Set([...prev, ...enabledSkills])));
    }
  }, [enabledSkills]);

  // Token & Context Window Monitor calculation (v1.5.0 / v1.6.0 dynamic 1M / 128k)
  const totalEstimatedTokens = useMemo(() => {
    return messages.reduce((acc, m) => {
      const contentTokens = Math.round((m.content?.length || 0) * 0.75);
      const thoughtTokens = Math.round((m.thought?.length || 0) * 0.5);
      return acc + contentTokens + thoughtTokens;
    }, 0);
  }, [messages]);

  const contextLimit = useMemo(() => {
    return getModelContextLimit(currentModel, providerName);
  }, [currentModel, providerName]);

  const usagePercent = Math.min(100, Math.round((totalEstimatedTokens / contextLimit) * 100));

  const formatTokenCount = (tokens: number) => {
    if (tokens >= 1000000) {
      const val = tokens / 1000000;
      return Number.isInteger(val) ? `${val}M` : `${val.toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      const val = tokens / 1000;
      return Number.isInteger(val) ? `${val}k` : `${val.toFixed(1)}k`;
    }
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

  // 技能标准化 Canonical ID 提取工具 (消除 custom:global/extra 前缀与大小写/连字符差异)
  const getCanonicalSkillId = (id: string): string => {
    return (id || '')
      .replace(/^custom:(?:global|workspace|extra):/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  };

  // v2.0.2: 监听主进程技能库变更广播 (skills:changed)，实时热更新前端技能列表
  useEffect(() => {
    if (!window.electronAPI?.onSkillsChanged) return;
    const unsubscribe = window.electronAPI.onSkillsChanged(() => {
      if (window.electronAPI?.getAllSkills) {
        window.electronAPI.getAllSkills(workspacePath || null).then(skills => {
          if (Array.isArray(skills)) {
            setAvailableSkills(skills);
          }
        }).catch(() => {});
      }
    });
    return unsubscribe;
  }, [workspacePath]);

  // v1.11.1 / v2.0.2: 直接选择本地文件夹或 ZIP/文件导入技能并即时自动挂载与反馈
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isSyncingSkills, setIsSyncingSkills] = useState(false);
  const [skillNotification, setSkillNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSyncSkills = async () => {
    if (!window.electronAPI?.getAllSkills) return;
    try {
      setIsSyncingSkills(true);
      const skills = await window.electronAPI.getAllSkills(workspacePath || null);
      if (Array.isArray(skills)) {
        setAvailableSkills(skills);
        setSkillNotification({ type: 'success', text: `🔄 技能库已完成热同步，当前可用 ${skills.length} 个技能` });
        setTimeout(() => setSkillNotification(null), 2500);
      }
    } catch (err: any) {
      setSkillNotification({ type: 'error', text: `同步失败: ${err.message}` });
      setTimeout(() => setSkillNotification(null), 2500);
    } finally {
      setIsSyncingSkills(false);
    }
  };

  const handleImportFile = async () => {
    if (!window.electronAPI?.installSkillFromFile) return;
    try {
      setIsImportingFile(true);
      const installed = await window.electronAPI.installSkillFromFile();
      if (installed) {
        if (window.electronAPI.getAllSkills) {
          const updated = await window.electronAPI.getAllSkills(workspacePath || null);
          if (Array.isArray(updated)) {
            setAvailableSkills(updated);
          }
        }
        const newCanon = getCanonicalSkillId(installed.id);
        setMountedSkillIds(prev => {
          const filtered = prev.filter(x => !newCanon || getCanonicalSkillId(x) !== newCanon);
          return [...filtered, installed.id];
        });
        setSkillNotification({ type: 'success', text: `🎉 成功安装并挂载技能: ${installed.name}` });
        setTimeout(() => setSkillNotification(null), 3000);
      }
    } catch (err: any) {
      console.warn('Failed to import skill from file:', err);
      setSkillNotification({ type: 'error', text: `导入失败: ${err.message}` });
      setTimeout(() => setSkillNotification(null), 3000);
    } finally {
      setIsImportingFile(false);
    }
  };

  const handleImportFolder = async () => {
    if (!window.electronAPI?.installSkillFromFolder) return;
    try {
      setIsImportingFolder(true);
      const installed = await window.electronAPI.installSkillFromFolder();
      if (installed) {
        // 重新拉取所有最新技能
        if (window.electronAPI.getAllSkills) {
          const updated = await window.electronAPI.getAllSkills(workspacePath || null);
          if (Array.isArray(updated)) {
            setAvailableSkills(updated);
          }
        }
        // 自动将新技能加入已挂载列表，并替换历史旧变体
        const newCanon = getCanonicalSkillId(installed.id);
        setMountedSkillIds(prev => {
          const filtered = prev.filter(x => !newCanon || getCanonicalSkillId(x) !== newCanon);
          return [...filtered, installed.id];
        });
        setSkillNotification({ type: 'success', text: `🎉 成功导入并挂载技能: ${installed.name}` });
        setTimeout(() => setSkillNotification(null), 3000);
      }
    } catch (err: any) {
      console.warn('Failed to import skill from folder:', err);
      setSkillNotification({ type: 'error', text: `导入失败: ${err.message}` });
      setTimeout(() => setSkillNotification(null), 3000);
    } finally {
      setIsImportingFolder(false);
    }
  };

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

    if (item.type === 'skill') {
      if (!mountedSkillIds.includes(item.id)) {
        setMountedSkillIds(prev => [...prev, item.id]);
      }
    }

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

  const lastMsg = messages[messages.length - 1];

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

  // 以真实执行状态 isRunning 为单一真值来源，确保状态栏、执行轨迹和底部停止按钮完全对齐
  const effectiveIsRunning = isRunning;

  // 动态侦测当前最新消息中是否有处于 running 状态的终端命令
  const activeRunningTerminalStep = (() => {
    if (!effectiveIsRunning && !isWaitingForUser) return null;
    if (lastMsg?.role === 'assistant' && lastMsg.steps) {
      const step = lastMsg.steps.find(s => s.tool === 'run_terminal_command' && s.status === 'running');
      if (step) return step;
    }
    return null;
  })();

  // 实时捕获当前正在执行或等待的步骤，用于置顶任务进程看板
  const activeRunningStep = (() => {
    if (!effectiveIsRunning) return null;
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
  const shouldShowTopBanner = effectiveIsRunning || (totalStepsCount > 0 && dismissedBannerMsgId !== latestMsgWithSteps?.id);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, effectiveIsRunning, isWaitingForUser]);

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

    // 若当前处于问答等待中 (isWaitingForUser)，用户直接在底部打字回车，自动提交为当前问答的答复！
    if (isWaitingForUser && activeSessionId && trimmed) {
      onReplyQuestion?.('active', trimmed);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }

    // 若 Agent 当前正在执行中，用户的输入自动作为实时协作插话 (Steering) 注入并上屏
    if (effectiveIsRunning && !isWaitingForUser) {
      if (trimmed) {
        onSendMessage(trimmed, executionMode, undefined, mountedSkillIds);
        setInput('');
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }
      }
      return;
    }

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
    } else if (trimmed.startsWith('/skill')) {
      textToSend = trimmed.replace('/skill', '').trim() || '请根据我们刚才的对话、交互过程以及我的工作习惯，提炼并生成一个标准化的 Skill 技能，并指导或保存到技能目录。';
      if (!mountedSkillIds.includes('skill_generator')) {
        setMountedSkillIds(prev => [...prev, 'skill_generator']);
      }
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

    onSendMessage(textToSend, mode, attachments, mountedSkillIds);
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
      const nativePath = (file as any).path || '';

      // 智能感知：如果拖入的是 Skill 压缩包 (.skill, .skill.zip 或名称含 skill/pipeline/filter 的 zip)
      const isSkillArchive = /\.skill(?:\.zip)?$/i.test(file.name) ||
        (file.name.toLowerCase().endsWith('.zip') && (
          file.name.toLowerCase().includes('skill') ||
          file.name.toLowerCase().includes('pipeline') ||
          file.name.toLowerCase().includes('filter')
        ));

      if (isSkillArchive && nativePath && window.electronAPI?.installSkillFromFile) {
        window.electronAPI.installSkillFromFile(nativePath).then(async (installed) => {
          if (installed) {
            if (window.electronAPI?.getAllSkills) {
              const updated = await window.electronAPI.getAllSkills(workspacePath || null);
              if (Array.isArray(updated)) setAvailableSkills(updated);
            }
            setMountedSkillIds(prev => Array.from(new Set([...prev, installed.id])));
            setSkillNotification({ type: 'success', text: `🎉 自动识别并成功安装技能包: ${installed.name}` });
            setTimeout(() => setSkillNotification(null), 4000);
          }
        }).catch(err => {
          console.warn('Failed to auto-install dropped skill:', err);
        });
        return;
      }

      const isImage = file.type.startsWith('image/');
      const isOfficeDoc = /\.(docx|pptx|xlsx|xls|pdf)$/i.test(file.name);
      const isText = file.type.startsWith('text/') ||
        /\.(ts|tsx|js|jsx|json|md|py|go|rs|c|cpp|h|css|html|xml|yaml|yml|sh|env|sql|csv)$/i.test(file.name);

      if (isImage) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const content = ev.target?.result as string;
          let localPath = nativePath;
          if (!localPath && window.electronAPI?.saveAttachment) {
            try {
              const base64Data = content.split(',')[1];
              if (base64Data) {
                const binStr = atob(base64Data);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                const res = await window.electronAPI.saveAttachment(file.name || `image_${Date.now()}.png`, bytes, workspacePath || undefined);
                if (res?.success && res.localPath) localPath = res.localPath;
              }
            } catch {}
          }
          setAttachments(prev => [...prev, {
            name: file.name || `image_${Date.now()}.png`,
            size: file.size,
            type: file.type || 'image/png',
            content,
            localPath
          }]);
        };
        reader.readAsDataURL(file);
      } else if (isOfficeDoc && window.electronAPI?.extractOfficeDocument) {
        // v1.11.2 / v2.0.1: Office (Word/PPT/Excel) 与 PDF 智能脱壳并确保物理落盘
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const arrayBuffer = ev.target?.result as ArrayBuffer;
            const res = await window.electronAPI.extractOfficeDocument(file.name, new Uint8Array(arrayBuffer), workspacePath || undefined);
            const resolvedPath = nativePath || res.localPath || '';
            setAttachments(prev => [...prev, {
              name: file.name,
              size: file.size,
              type: `document/${file.name.split('.').pop()?.toLowerCase()}`,
              content: res.text,
              localPath: resolvedPath,
              extractedImages: res.extractedImages
            }]);
          } catch (err: any) {
            console.warn('Failed to extract office document:', err);
            setAttachments(prev => [...prev, {
              name: file.name,
              size: file.size,
              type: 'application/octet-stream',
              content: '',
              localPath: nativePath
            }]);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (isText && file.size < 512 * 1024) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const content = ev.target?.result as string;
          let resolvedPath = nativePath;
          if (!resolvedPath && window.electronAPI?.saveAttachment) {
            try {
              const enc = new TextEncoder();
              const res = await window.electronAPI.saveAttachment(file.name, enc.encode(content), workspacePath || undefined);
              if (res?.success && res.localPath) resolvedPath = res.localPath;
            } catch {}
          }
          setAttachments(prev => [...prev, {
            name: file.name,
            size: file.size,
            type: file.type || 'text/plain',
            content,
            localPath: resolvedPath
          }]);
        };
        reader.readAsText(file);
      } else {
        // 未知二进制或大文件：物理落盘并记录元数据
        const reader = new FileReader();
        reader.onload = async (ev) => {
          let resolvedPath = nativePath;
          try {
            const arrayBuffer = ev.target?.result as ArrayBuffer;
            if (!resolvedPath && arrayBuffer && window.electronAPI?.saveAttachment) {
              const res = await window.electronAPI.saveAttachment(file.name, new Uint8Array(arrayBuffer), workspacePath || undefined);
              if (res?.success && res.localPath) resolvedPath = res.localPath;
            }
          } catch {}
          setAttachments(prev => [...prev, {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            content: '',
            localPath: resolvedPath
          }]);
        };
        reader.readAsArrayBuffer(file);
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
    <main className="flex h-full flex-1 min-w-0 flex-col bg-[var(--background)] overflow-hidden relative">
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
              {effectiveIsRunning ? (
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
                  {effectiveIsRunning
                    ? (activeRunningStep ? `正在执行: ${activeRunningStep.title}` : 'Agent 需求分析与自主调度中...')
                    : `ASTeam 2.0 规划与执行已就绪 (${completedStepsCount}/${totalStepsCount} 步骤完成)`
                  }
                </span>

                {effectiveIsRunning && activeRunningStep?.tool && (
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

              {/* Active Skill Indicator in top banner - v2.0.2 */}
              {mountedSkillIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSkillPicker(true)}
                  className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold hover:bg-amber-500/25 transition-colors cursor-pointer shrink-0"
                  title="点击查看/配置当前已挂载执行的技能"
                >
                  <Zap className="h-3 w-3 fill-amber-500 text-amber-500" />
                  <span>已就绪 {mountedSkillIds.length} 项技能</span>
                </button>
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

              {/* View in Right Workbench Button */}
              {onOpenSwarm && (
                <button
                  type="button"
                  onClick={onOpenSwarm}
                  className="flex items-center space-x-1 rounded-md bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/20 px-2 py-1 text-xs font-medium transition-colors cursor-pointer"
                  title="在右侧并排分栏固定查看蜂群泳道与进度"
                >
                  <Users className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  <span className="hidden sm:inline">右侧协同大屏</span>
                </button>
              )}

              {/* Stop button while running */}
              {effectiveIsRunning && (
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
              {!effectiveIsRunning && (
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
          <div className="flex h-full flex-col items-center justify-center text-center max-w-3xl mx-auto space-y-7 my-auto pt-6 pb-12 select-none animate-in fade-in-50 duration-300">
            {/* Ambient Glow Brand Emblem */}
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-[var(--primary)] via-emerald-500 to-[var(--accent)] opacity-20 blur-xl animate-pulse" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-xl shadow-[var(--primary)]/25">
                <span className="font-extrabold text-2xl tracking-tight">A</span>
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] ml-0.5 shadow-xs" />
              </div>
            </div>

            {/* Hero Header */}
            <div className="space-y-2.5 max-w-xl mx-auto">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  ASTeam Agent
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
                  v{appVersion}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                  ECCOM 品牌级
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                企业级多智能体协同终端 · 专注高质量 ECCOM 品牌规范 Office 文档生成、全自主架构设计与研发工程自动化
              </p>
            </div>

            {/* Feature Capability Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                ECCOM 品牌松柏绿规范
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                免外部环境原生排版
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                交付物物理探针门禁
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] shadow-2xs">
                <Zap className="h-3 w-3 fill-[var(--primary)] text-[var(--primary)]" />
                {mountedSkillIds.length || 10} 项企业技能待命
              </span>
            </div>

            {/* Bento Grid Scenario Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-left pt-1">
              {[
                {
                  badge: 'ECCOM 规范',
                  badgeColor: 'text-[var(--primary)] bg-[var(--primary)]/10 border-[var(--primary)]/20',
                  icon: FileText,
                  iconColor: 'text-[var(--primary)] bg-[var(--primary)]/10',
                  title: '企业级 Word 方案白皮书',
                  subtitle: '内置封面、自动目录与三线表规范，一键输出标准技术方案或研报',
                  prompt: '请使用【eccom-word-skill】为我们团队撰写一份严谨规范的技术方案白皮书，包含项目背景、系统架构设计、三线表参数与交付里程碑，并生成 Word 文档保存在我的桌面上（文件名：企业级Agent架构白皮书.docx）。'
                },
                {
                  badge: '免外部依赖',
                  badgeColor: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-400',
                  icon: Layers,
                  iconColor: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
                  title: '商业演说 PPT 幻灯片',
                  subtitle: '16:9 原生矢量排版引擎，内嵌松柏绿/赤红经典商业路演版式与演讲稿',
                  prompt: '请使用【eccom-ppt-skill】为我们生成一份 16:9 商业提案路演幻灯片，包含引言、核心痛点、解决方案、商业价值与讲者逐字稿，并直接保存至桌面（文件名：AI智能底座路演汇报.pptx）。'
                },
                {
                  badge: '自动计算度量',
                  badgeColor: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400',
                  icon: FileSpreadsheet,
                  iconColor: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
                  title: '智能 Excel 财务与分析表',
                  subtitle: '自动设计冻结表头、数据透视与汇总公式，松柏绿专业商务配色',
                  prompt: '请使用【eccom-excel-skill】为我们生成一份项目成本预算与ROI效益测算表，包含研发人力、基础设施投入与三年预期收益核算公式，并保存至桌面（文件名：项目ROI效益测算.xlsx）。'
                },
                {
                  badge: 'Swarm 协同',
                  badgeColor: 'text-teal-600 bg-teal-500/10 border-teal-500/20 dark:text-teal-400',
                  icon: Terminal,
                  iconColor: 'text-teal-600 bg-teal-500/10 dark:text-teal-400',
                  title: '高可用拓扑与全自主研发',
                  subtitle: 'Mermaid/SVG 实时矢量架构图渲染、系统自动化巡检与多智能体分工协同',
                  prompt: '请为我们编写一个高颜值的数据监控大屏 HTML 页面（内置 Tailwind CSS），并在其后使用 Mermaid 绘制完整的系统高可用流式架构拓扑图。'
                }
              ].map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInput(item.prompt);
                      textareaRef.current?.focus();
                    }}
                    className="relative flex flex-col justify-between p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left group cursor-pointer"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.iconColor} group-hover:scale-105 transition-transform`}>
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-bold text-xs text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors flex items-center justify-between">
                          <span>{item.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        </h3>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-1 line-clamp-2 leading-relaxed">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
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

                {/* 现代化深度思考折叠胶囊 (Deep Thinking Capsule - v2.1.0) */}
                {msg.thought && (() => {
                  const isThinking = effectiveIsRunning && msg.id === lastMsg?.id && !msg.content?.trim();
                  return (
                    <details
                      className="group/thought my-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 overflow-hidden transition-all text-xs"
                      open={isThinking}
                    >
                      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-[var(--muted)]/50 transition-colors list-none">
                        <div className="flex items-center space-x-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--primary)]/15 text-[var(--primary)]">
                            <Sparkles className={`h-3 w-3 ${isThinking ? 'animate-spin' : ''}`} />
                          </div>
                          <span className="font-medium text-[var(--foreground)] text-[12px]">
                            {isThinking ? '正在深度思考与规划调度中...' : '已完成深度思考与分析决策'}
                          </span>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                            ({msg.thought.length} 字符)
                          </span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)] transition-transform duration-200 group-open/thought:rotate-180" />
                      </summary>
                      <div className="px-3.5 py-3 border-t border-[var(--border)]/40 bg-[var(--card)]/50 font-mono text-[11.5px] leading-relaxed text-[var(--muted-foreground)] whitespace-pre-wrap max-h-56 overflow-y-auto select-text scrollbar-thin">
                        {msg.thought}
                      </div>
                    </details>
                  );
                })()}

                {/* Swarm Multi-Agent Collaboration Dashboard */}
                {msg.swarmState && (
                  <SwarmDashboard
                    swarmState={msg.swarmState}
                    isRunning={effectiveIsRunning && msg.id === messages[messages.length - 1]?.id}
                    onOpenRightTab={onOpenSwarm}
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

                {/* Interactive Question Card if Agent prompted a question or structured options extracted */}
                {(() => {
                  const activeQuestionData: QuestionCardData | null = msg.question || (() => {
                    if (msg.role !== 'assistant' || !msg.content || effectiveIsRunning) return null;
                    const extracted = extractQuestionsFromText(msg.content);
                    if (extracted && extracted.questions.length > 0 && extracted.questions.some(q => q.options && q.options.length > 0)) {
                      return {
                        questionId: `extracted-${msg.id}`,
                        question: extracted.intro || '请确认以下关键方案与偏好选择：',
                        questions: extracted.questions,
                        answered: false
                      };
                    }
                    return null;
                  })();

                  if (!activeQuestionData) return null;

                  return (
                    <InteractiveQuestionCard
                      key={activeQuestionData.questionId}
                      data={activeQuestionData}
                      onSubmitAnswer={(qId, ans) => onReplyQuestion(qId, ans)}
                    />
                  );
                })()}

                {/* Main Message Content with Intelligent Error Card handling & Running Placeholder */}
                {(() => {
                  const isLatestAssistant = msg.role === 'assistant' && msg.id === lastMsg?.id;
                  if (effectiveIsRunning && isLatestAssistant && !msg.content?.trim() && (!msg.steps || msg.steps.length === 0)) {
                    return (
                      <div className="flex items-center space-x-2.5 py-3 px-1 text-xs text-[var(--muted-foreground)] animate-pulse select-none">
                        <div className="h-2.5 w-2.5 rounded-full bg-[var(--primary)] animate-ping" />
                        <span className="font-medium text-[var(--foreground)]">ASTeam Agent 正在思考与调用底层工具中...</span>
                      </div>
                    );
                  }

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
                {msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (() => {
                  const isMsgRunning = effectiveIsRunning && msg.id === messages[messages.length - 1]?.id;
                  const completedCount = msg.steps.filter(s => s.status === 'completed').length;
                  return (
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs select-none">
                      <div className="flex items-center space-x-2">
                        {isMsgRunning ? (
                          <Loader2 className="h-3.5 w-3.5 text-[var(--primary)] animate-spin shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                        )}
                        <span className="font-semibold text-xs text-[var(--foreground)]">
                          {isMsgRunning
                            ? `任务规划与执行中 (${completedCount} / ${msg.steps.length} 步骤完成)`
                            : `规划与执行轨迹归档 (${completedCount} / ${msg.steps.length} 步骤已通过)`
                          }
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
                  );
                })()}

                {/* 交付物清单聚合看板 (Multi-Artifacts Delivery Board - v2.1.0) */}
                {msg.role === 'assistant' && (() => {
                  const detectedArtifacts = extractAllArtifactsFromMessage(msg);
                  if (detectedArtifacts.length === 0) return null;

                  return (
                    <div className="mt-3.5 rounded-2xl border border-[var(--primary)]/30 bg-[var(--card)] p-3.5 shadow-sm select-none">
                      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[var(--border)]/60">
                        <div className="flex items-center space-x-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-[var(--foreground)]">
                            本轮任务交付物清单 ({detectedArtifacts.length} 个落盘制品)
                          </span>
                        </div>
                        <span className="text-[11px] text-[var(--muted-foreground)]">
                          物理落盘验证通过 · 支持一键定位与工作台分屏预览
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {detectedArtifacts.map((art) => {
                          const isExcel = art.type === 'excel';
                          const isText = art.type === 'text';
                          const isHtml = art.type === 'html';
                          const isImage = art.type === 'image';

                          const formatSize = (bytes?: number) => {
                            if (!bytes) return '';
                            if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
                            return `${(bytes / 1024).toFixed(1)} KB`;
                          };

                          return (
                            <div
                              key={art.id}
                              className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)]/70 bg-[var(--muted)]/25 hover:bg-[var(--muted)]/50 hover:border-[var(--primary)]/40 transition-all group/item"
                            >
                              <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                  isExcel ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                                  isText ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                                  isHtml ? 'bg-cyan-500/15 text-cyan-600' :
                                  isImage ? 'bg-fuchsia-500/15 text-fuchsia-600' :
                                  'bg-zinc-500/15 text-zinc-400'
                                }`}>
                                  {isExcel ? <FileSpreadsheet className="h-4 w-4" /> :
                                   isText ? <FileCode className="h-4 w-4" /> :
                                   isHtml ? <Globe className="h-4 w-4" /> :
                                   isImage ? <ImageIcon className="h-4 w-4" /> :
                                   <FileText className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-[var(--foreground)] truncate max-w-[200px]" title={art.title}>
                                    {art.title}
                                  </div>
                                  <div className="flex items-center space-x-1.5 text-[10px] text-[var(--muted-foreground)]">
                                    <span className="uppercase font-mono font-semibold">
                                      {art.filePath.split('.').pop() || art.type}
                                    </span>
                                    {art.sizeBytes ? (
                                      <span>· {formatSize(art.sizeBytes)}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                {/* 工作台预览按钮 */}
                                {onOpenPreview && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onOpenPreview({
                                        type: (isExcel ? 'excel' : isText ? 'text' : isHtml ? 'html' : isImage ? 'image' : 'text') as any,
                                        title: art.title,
                                        filePath: art.filePath,
                                        content: ''
                                      });
                                    }}
                                    title="在右侧工作台独立分栏中查看预览"
                                    className="flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors cursor-pointer shadow-2xs"
                                  >
                                    <Eye className="h-3 w-3" />
                                    <span className="hidden sm:inline">预览</span>
                                  </button>
                                )}

                                {/* 定位 */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.electronAPI?.showItemInFolder) {
                                      window.electronAPI.showItemInFolder(art.filePath);
                                    }
                                  }}
                                  title="在 Windows 资源管理器中高亮定位"
                                  className="p-1 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                </button>

                                {/* 外部打开 */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.electronAPI?.openPath) {
                                      window.electronAPI.openPath(art.filePath);
                                    }
                                  }}
                                  title="调用系统默认软件打开"
                                  className="p-1 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
                      <span>{msg.durationMs ? `${(msg.durationMs / 1000).toFixed(1)}s` : (effectiveIsRunning && msg.id === messages[messages.length - 1]?.id ? '执行中...' : '已完成')}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Zap className="h-2.5 w-2.5 text-[var(--primary)]" />
                      <span>
                        {msg.tokenStats ? (
                          `Tokens: ${(msg.tokenStats.totalTokens || 0).toLocaleString()} (输入: ${Math.round((msg.tokenStats.promptTokens || 0) / 100) / 10}k · 输出: ${Math.round((msg.tokenStats.completionTokens || 0) / 100) / 10}k)`
                        ) : (
                          `Tokens: ~${Math.round(msg.content.length * 0.75)}`
                        )}
                      </span>
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

        {/* 正在运行的独立交互控制台卡片 (内嵌平滑展示，避免误导为交互弹窗) */}
        {activeRunningTerminalStep && (
          <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xs animate-in fade-in duration-200 select-text">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)] select-none">
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary)]"></span>
                </span>
                <span className="font-medium text-xs text-[var(--foreground)] tracking-wide">
                  终端进程实时管道 (Terminal Stream)
                </span>
              </div>
              <span className="text-[10px] bg-[var(--muted)] text-[var(--muted-foreground)] rounded px-2 py-0.5 font-medium">
                执行中 (支持按需推入 stdin)
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
                  ) : file.type?.startsWith('document/') ? (
                    <FileText className="h-3 w-3 text-indigo-500" />
                  ) : (
                    <FileText className="h-3 w-3 text-[var(--primary)]" />
                  )}
                  <span className="max-w-[140px] truncate font-mono">{file.name}</span>
                  {file.type?.startsWith('document/') ? (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-500 font-medium flex items-center gap-1">
                      <span>已智能脱壳</span>
                      {file.extractedImages && file.extractedImages.length > 0 && (
                        <span className="text-amber-500 font-normal">· 🖼️ {file.extractedImages.length} 张图表已就位</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[9px] text-[var(--muted-foreground)]">
                      ({Math.round(file.size / 1024)} KB)
                    </span>
                  )}
                  {file.localPath && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-600 dark:text-teal-400 font-medium" title={`本地物理路径: ${file.localPath}`}>
                      💾 物理就绪
                    </span>
                  )}
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

          {/* Prominent Global Skill Notification Banner (v2.0.2) */}
          {skillNotification && (
            <div className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-semibold shadow-xs animate-in fade-in-50 slide-in-from-bottom-2 ${
              skillNotification.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }`}>
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 fill-emerald-500 text-emerald-500 shrink-0" />
                <span>{skillNotification.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setSkillNotification(null)}
                className="opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Active Mounted Skills - Compact Pill Bar (v2.2.0) */}
          {mountedSkillIds.length > 0 && !isSkillsBarExpanded && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--primary)]/8 border border-[var(--primary)]/20 text-xs select-none transition-all shadow-2xs">
              <div className="flex items-center space-x-2 min-w-0">
                <Zap className="h-3.5 w-3.5 fill-[var(--primary)] text-[var(--primary)] shrink-0" />
                <span className="text-[11px] font-medium text-[var(--foreground)] truncate">
                  已就绪 <strong className="text-[var(--primary)] font-semibold">{mountedSkillIds.length}</strong> 项企业技能
                  <span className="text-[10px] text-[var(--muted-foreground)] ml-1 font-normal hidden sm:inline">
                    (含 ECCOM Word/Excel/PPT 办公套件)
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2.5 shrink-0 text-[11px]">
                <button
                  type="button"
                  onClick={() => setIsSkillsBarExpanded(true)}
                  className="font-medium text-[var(--primary)] hover:underline cursor-pointer flex items-center gap-0.5"
                  title="展开查看所有已就绪技能标签"
                >
                  <span>展开明细</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                <span className="text-[var(--border)]">|</span>
                <button
                  type="button"
                  onClick={() => setShowSkillPicker(true)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                  title="打开技能挂载与勾选调度面板"
                >
                  管理
                </button>
                <button
                  type="button"
                  onClick={() => setMountedSkillIds([])}
                  className="text-[var(--muted-foreground)] hover:text-rose-500 cursor-pointer"
                  title="本轮清空已挂载技能"
                >
                  清空
                </button>
              </div>
            </div>
          )}

          {/* Active Mounted Skills - Expanded Chips View (v2.2.0) */}
          {mountedSkillIds.length > 0 && isSkillsBarExpanded && (
            <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-[var(--primary)]/5 border border-[var(--primary)]/20 text-xs animate-in fade-in-50">
              <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]/40">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--primary)]">
                  <Zap className="h-3.5 w-3.5 fill-[var(--primary)] text-[var(--primary)]" />
                  <span>已就绪企业技能 ({mountedSkillIds.length})</span>
                </div>
                <div className="flex items-center space-x-2.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShowSkillPicker(true)}
                    className="text-[var(--primary)] hover:underline cursor-pointer"
                  >
                    + 挂载管理
                  </button>
                  <span className="text-[var(--border)]">|</span>
                  <button
                    type="button"
                    onClick={() => setIsSkillsBarExpanded(false)}
                    className="font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer flex items-center gap-0.5"
                  >
                    <span>收起明细</span>
                    <ChevronDown className="h-3 w-3 rotate-180" />
                  </button>
                  <span className="text-[var(--border)]">|</span>
                  <button
                    type="button"
                    onClick={() => setMountedSkillIds([])}
                    className="text-[var(--muted-foreground)] hover:text-rose-500 cursor-pointer"
                  >
                    清除全部
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {mountedSkillIds.map(id => {
                  const idCanon = getCanonicalSkillId(id);
                  const s = availableSkills.find(item => item.id === id || (idCanon && getCanonicalSkillId(item.id) === idCanon));
                  const isFolder = s?.isFolderSkill;
                  const cleanName = s ? s.name.replace(/^\[.*?\]\s*/, '') : id.replace(/^custom:(?:global|workspace|extra):/, '');
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--card)] border border-[var(--primary)]/25 text-[var(--foreground)] shadow-2xs group hover:border-[var(--primary)]/50 transition-colors"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isFolder ? 'bg-indigo-500' : 'bg-[var(--primary)]'}`} />
                      <span className="max-w-[150px] truncate" title={s?.description || id}>
                        {cleanName}
                      </span>
                      {isFolder && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                          复合包
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setMountedSkillIds(prev => prev.filter(x => x !== id && (!idCanon || getCanonicalSkillId(x) !== idCanon)))}
                        className="text-[var(--muted-foreground)] hover:text-rose-500 transition-colors ml-0.5 cursor-pointer"
                        title="取消挂载此技能"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
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

              {/* Skill Selector Popover Button & Modal (v1.11.0) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSkillPicker(prev => !prev)}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors border cursor-pointer ${
                    mountedSkillIds.length > 0
                      ? 'border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)] font-semibold shadow-2xs'
                      : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                  title="选择/勾选本轮要执行的技能包 (支持 ECCOM 办公套件与自定义技能)"
                >
                  <Zap className={`h-3 w-3 ${mountedSkillIds.length > 0 ? 'fill-[var(--primary)] text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`} />
                  <span>技能挂载</span>
                  {mountedSkillIds.length > 0 && (
                    <span className="flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--primary)] text-[9px] font-bold text-white px-0.5">
                      {mountedSkillIds.length}
                    </span>
                  )}
                </button>

                {/* Popover Card */}
                {showSkillPicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-84 sm:w-96 rounded-xl border border-[var(--border)] bg-[var(--card)]/98 backdrop-blur-md p-3 shadow-2xl z-50 flex flex-col gap-2 animate-in slide-in-from-bottom-2 select-none">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-[var(--primary)] fill-[var(--primary)]" />
                        <span className="font-semibold text-xs text-[var(--foreground)]">
                          技能挂载与调度中心
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSkillPicker(false)}
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Search & Quick Actions */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <input
                        type="text"
                        value={skillPickerSearch}
                        onChange={e => setSkillPickerSearch(e.target.value)}
                        placeholder="搜索技能名称、拼音或触发词..."
                        className="flex-1 min-w-[140px] rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleImportFile}
                        disabled={isImportingFile}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-2 py-1 text-[10px] font-medium transition-colors shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                        title="选择本地 .zip 压缩包或 .md 技能文件导入并立即自动挂载"
                      >
                        {isImportingFile ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileUp className="h-3 w-3" />
                        )}
                        <span>导入 ZIP/文件</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleImportFolder}
                        disabled={isImportingFolder}
                        className="inline-flex items-center gap-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 text-[10px] font-medium transition-colors shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                        title="选择包含 SKILL.md 的本地文件夹导入并立即自动挂载"
                      >
                        {isImportingFolder ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FolderOpen className="h-3 w-3" />
                        )}
                        <span>文件夹导入</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSyncSkills}
                        disabled={isSyncingSkills}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] px-2 py-1 text-[10px] font-medium transition-colors shadow-2xs cursor-pointer shrink-0 disabled:opacity-50"
                        title="立即从数据中枢和外部技能库热同步所有最新技能"
                      >
                        <RefreshCw className={`h-3 w-3 ${isSyncingSkills ? 'animate-spin text-[var(--primary)]' : ''}`} />
                        <span>热同步</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = availableSkills.map(s => s.id);
                          setMountedSkillIds(mountedSkillIds.length === allIds.length ? [] : allIds);
                        }}
                        className="text-[10px] text-[var(--primary)] hover:underline shrink-0 cursor-pointer font-medium"
                      >
                        {mountedSkillIds.length === availableSkills.length ? '全部取消' : '全选'}
                      </button>
                    </div>

                    {/* Skill Notification Banner (v2.0.1) */}
                    {skillNotification && (
                      <div className={`p-2 rounded-lg text-xs font-medium animate-in fade-in flex items-center justify-between ${
                        skillNotification.type === 'success'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                      }`}>
                        <span>{skillNotification.text}</span>
                        <button type="button" onClick={() => setSkillNotification(null)} className="opacity-70 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* Skill List with Checkboxes */}
                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 text-xs">
                      {availableSkills
                        .filter(s => {
                          if (!skillPickerSearch.trim()) return true;
                          const q = skillPickerSearch.toLowerCase();
                          return (
                            s.name.toLowerCase().includes(q) ||
                            (s.description && s.description.toLowerCase().includes(q)) ||
                            (s.triggers && s.triggers.some((t: string) => t.toLowerCase().includes(q))) ||
                            s.id.toLowerCase().includes(q)
                          );
                        })
                        .map(s => {
                          const sCanon = getCanonicalSkillId(s.id);
                          const isChecked = mountedSkillIds.some(
                            mId => mId === s.id || (sCanon && getCanonicalSkillId(mId) === sCanon)
                          );
                          const isFolder = s.isFolderSkill;
                          return (
                            <label
                              key={s.id}
                              className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all cursor-pointer ${
                                isChecked
                                  ? 'border-amber-500/50 bg-amber-500/10 shadow-2xs'
                                  : 'border-[var(--border)]/60 bg-[var(--background)]/50 hover:bg-[var(--muted)]/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setMountedSkillIds(prev => {
                                    const has = prev.some(x => x === s.id || (sCanon && getCanonicalSkillId(x) === sCanon));
                                    if (has) {
                                      return prev.filter(x => x !== s.id && (!sCanon || getCanonicalSkillId(x) !== sCanon));
                                    } else {
                                      const cleanPrev = prev.filter(x => !sCanon || getCanonicalSkillId(x) !== sCanon);
                                      return [...cleanPrev, s.id];
                                    }
                                  });
                                }}
                                className="mt-0.5 rounded border-[var(--border)] text-amber-500 focus:ring-amber-500 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-xs text-[var(--foreground)] truncate">
                                    {s.name.replace(/^\[.*?\]\s*/, '')}
                                  </span>
                                  {isFolder ? (
                                    <span className="text-[9px] font-medium px-1 rounded bg-indigo-500/15 text-indigo-500 border border-indigo-500/30">
                                      复合包 (含脚本/模板)
                                    </span>
                                  ) : s.id.startsWith('custom:workspace:') ? (
                                    <span className="text-[9px] font-medium px-1 rounded bg-teal-500/15 text-teal-500 border border-teal-500/30">
                                      项目专属
                                    </span>
                                  ) : s.id.startsWith('custom:extra:') ? (
                                    <span className="text-[9px] font-medium px-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                      外部仓库
                                    </span>
                                  ) : s.id.startsWith('custom:global:') ? (
                                    <span className="text-[9px] font-medium px-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                      自定义
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-medium px-1 rounded bg-blue-500/15 text-blue-500 border border-blue-500/30">
                                      官方内置
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 mt-0.5">
                                  {s.description}
                                </p>
                                {s.scriptsDir && (
                                  <p className="text-[10px] text-indigo-500 font-mono truncate mt-0.5" title={s.scriptsDir}>
                                    ⚡ 脚本: {s.scriptsDir.split(/[\\/]/).pop()}
                                  </p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                    </div>

                    {/* Smart Skill Generator Hint (v1.11.1) */}
                    <div className="rounded-lg bg-[var(--primary)]/5 border border-[var(--primary)]/20 p-2 text-[11px] flex items-center justify-between text-[var(--muted-foreground)]">
                      <span className="truncate">
                        💡 键入 <strong className="text-[var(--primary)]">@创建技能</strong> 可根据使用习惯与对话自动生成专属 Skill
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSkillPicker(false);
                          setInput(prev => (prev ? `${prev} @创建技能 ` : '@创建技能 '));
                        }}
                        className="text-[10px] text-[var(--primary)] hover:underline font-semibold shrink-0 cursor-pointer ml-1"
                      >
                        立即唤起
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-[var(--border)] pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--muted-foreground)] text-[10px]">
                        已勾选 <strong className="text-amber-500">{mountedSkillIds.length}</strong> 项
                      </span>
                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowSkillPicker(false);
                            onOpenSettings();
                          }}
                          className="text-[var(--primary)] hover:underline text-[10px] cursor-pointer"
                        >
                          管理与导入技能...
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
                    className="flex items-center space-x-1 text-[var(--foreground)] font-medium hover:text-[var(--primary)] transition-colors"
                  >
                    <Folder className="h-3 w-3 text-amber-500" />
                    <span className="truncate max-w-[160px]" title={workspacePath}>
                      {workspaceName}
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
                  ? `终端命令执行中... 若需交互输入（如 y/n）可直接在此键入后按 Enter`
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
            ) : effectiveIsRunning && !isWaitingForUser ? (
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onStopAgent}
                  title="停止当前任务"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--error)] text-[var(--error-foreground)] hover:opacity-90 transition-opacity shadow-xs select-none cursor-pointer"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
                {input.trim() && (
                  <button
                    type="button"
                    onClick={handleSend}
                    title="发送实时协作插话给当前运行的 Agent (Enter)"
                    className="flex h-8 items-center space-x-1 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer select-none"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    <span>实时插话</span>
                  </button>
                )}
              </div>
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
