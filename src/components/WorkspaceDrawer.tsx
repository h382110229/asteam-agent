import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  GitBranch,
  GitCommit,
  RefreshCw,
  Undo2,
  FileCode,
  FilePlus,
  FileX,
  FileEdit,
  Check,
  Eye,
  Terminal,
  Maximize2,
  Minimize2,
  Sparkles,
  ExternalLink,
  Package,
  Globe,
  FolderOpen,
  FileText,
  Presentation,
  Download,
  Copy,
  Clock,
  Search
} from 'lucide-react';
import { GitStatusSummary, GitFileStatus } from '../types/project';
import { ChatMessageItem, extractPreviewableArtifact } from './ChatArea';
import { HtmlPreview } from './preview/HtmlPreview';
import { MermaidPreview } from './preview/MermaidPreview';
import { SvgPreview } from './preview/SvgPreview';
import { LiveTerminalCard } from './LiveTerminalCard';

export type WorkspaceDrawerTab = 'preview' | 'artifacts' | 'diff' | 'terminal';

export interface PreviewData {
  type: 'html' | 'mermaid' | 'svg';
  title?: string;
  content: string;
  filePath?: string;
}

export interface ArtifactItem {
  id: string;
  type: 'html' | 'svg' | 'mermaid' | 'docx' | 'pptx' | 'file';
  title: string;
  content?: string;
  filePath?: string;
  timestamp: number;
  previewData?: PreviewData;
}

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: WorkspaceDrawerTab;
  onTabChange?: (tab: WorkspaceDrawerTab) => void;
  previewData?: PreviewData | null;
  workspacePath: string | null;
  gitStatus: GitStatusSummary | null;
  onRefreshGit: () => void;
  activeSessionId?: string;
  terminalOutput?: string;
  messages?: ChatMessageItem[];
  onSelectPreview?: (data: PreviewData) => void;
}

export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({
  isOpen,
  onClose,
  activeTab = 'preview',
  onTabChange,
  previewData,
  workspacePath,
  gitStatus,
  onRefreshGit,
  activeSessionId = 'global',
  terminalOutput = '',
  messages = [],
  onSelectPreview
}) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceDrawerTab>(activeTab);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Draggable Drawer Width states
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('asteam_workbench_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 460 && parsed <= window.innerWidth - 200) {
          return parsed;
        }
      }
    } catch {}
    return Math.max(680, Math.min(1000, Math.round(window.innerWidth * 0.55)));
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = drawerWidth;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = dragStartXRef.current - e.clientX;
      const minW = 460;
      const maxW = Math.max(minW, window.innerWidth - 240);
      const newWidth = Math.min(maxW, Math.max(minW, dragStartWidthRef.current + delta));
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem('asteam_workbench_width', drawerWidth.toString());
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, drawerWidth]);

  const handleResetWidth = () => {
    const defaultW = Math.max(680, Math.min(1000, Math.round(window.innerWidth * 0.55)));
    setDrawerWidth(defaultW);
    try {
      localStorage.setItem('asteam_workbench_width', defaultW.toString());
    } catch {}
  };

  // Git Diff states
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [discardSuccess, setDiscardSuccess] = useState<string | null>(null);

  // Artifacts Shelf state & collection
  const [artifactFilter, setArtifactFilter] = useState<'all' | 'html' | 'svg' | 'mermaid' | 'docs'>('all');
  const [artifactSearch, setArtifactSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const artifacts = useMemo<ArtifactItem[]>(() => {
    const items: ArtifactItem[] = [];
    const seenKeys = new Set<string>();

    // 1. Current active previewData
    if (previewData) {
      const key = `preview:${previewData.type}:${previewData.title || ''}:${previewData.filePath || ''}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        items.push({
          id: 'current-active-preview',
          type: previewData.type,
          title: previewData.title || (previewData.type === 'html' ? 'HTML 页面预览' : previewData.type === 'svg' ? 'SVG 矢量设计' : 'Mermaid 架构图'),
          content: previewData.content,
          filePath: previewData.filePath,
          timestamp: Date.now(),
          previewData
        });
      }
    }

    // 2. Scan assistant messages
    for (let mIdx = messages.length - 1; mIdx >= 0; mIdx--) {
      const msg = messages[mIdx];
      if (msg.role !== 'assistant') continue;

      if (msg.steps && msg.steps.length > 0) {
        for (let sIdx = msg.steps.length - 1; sIdx >= 0; sIdx--) {
          const step = msg.steps[sIdx];
          if (!step.args) continue;

          if (step.tool === 'write_file') {
            const filePath = step.args.filePath || step.args.path || step.args.file || '';
            const fileName = filePath.split(/[\\/]/).pop() || '';
            const contentStr = typeof step.args.content === 'string' ? step.args.content : '';

            if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
              const key = `file:${filePath || fileName}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                items.push({
                  id: `step-${mIdx}-${sIdx}`,
                  type: 'html',
                  title: fileName || 'HTML 交付大屏',
                  content: contentStr,
                  filePath,
                  timestamp: msg.timestamp,
                  previewData: {
                    type: 'html',
                    title: fileName,
                    content: contentStr,
                    filePath
                  }
                });
              }
            } else if (filePath.endsWith('.svg')) {
              const key = `file:${filePath || fileName}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                items.push({
                  id: `step-${mIdx}-${sIdx}`,
                  type: 'svg',
                  title: fileName || 'SVG 矢量设计图',
                  content: contentStr,
                  filePath,
                  timestamp: msg.timestamp,
                  previewData: {
                    type: 'svg',
                    title: fileName,
                    content: contentStr,
                    filePath
                  }
                });
              }
            } else if (filePath.endsWith('.docx')) {
              const key = `file:${filePath || fileName}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                items.push({
                  id: `step-${mIdx}-${sIdx}`,
                  type: 'docx',
                  title: fileName || 'Word 商业方案报告',
                  filePath,
                  timestamp: msg.timestamp
                });
              }
            } else if (filePath.endsWith('.pptx')) {
              const key = `file:${filePath || fileName}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                items.push({
                  id: `step-${mIdx}-${sIdx}`,
                  type: 'pptx',
                  title: fileName || 'PowerPoint 商业幻灯片',
                  filePath,
                  timestamp: msg.timestamp
                });
              }
            }
          } else if (step.tool === 'generate_docx') {
            const filePath = step.args.filePath || step.args.path || (step.result && step.result.match(/([a-zA-Z]:[^\s]+?\.docx|\/[^\s]+?\.docx)/)?.[1]) || '';
            const fileName = filePath ? filePath.split(/[\\/]/).pop() || '' : (step.args.title ? `${step.args.title}.docx` : '方案白皮书.docx');
            const key = `docx:${filePath || fileName}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              items.push({
                id: `step-${mIdx}-${sIdx}`,
                type: 'docx',
                title: fileName,
                filePath,
                timestamp: msg.timestamp
              });
            }
          } else if (step.tool === 'generate_pptx') {
            const filePath = step.args.filePath || step.args.path || (step.result && step.result.match(/([a-zA-Z]:[^\s]+?\.pptx|\/[^\s]+?\.pptx)/)?.[1]) || '';
            const fileName = filePath ? filePath.split(/[\\/]/).pop() || '' : (step.args.title ? `${step.args.title}.pptx` : '商业演讲.pptx');
            const key = `pptx:${filePath || fileName}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              items.push({
                id: `step-${mIdx}-${sIdx}`,
                type: 'pptx',
                title: fileName,
                filePath,
                timestamp: msg.timestamp
              });
            }
          }
        }
      }

      // Check extracted previewable artifact from content/thought
      const artifact = extractPreviewableArtifact(msg.content || msg.thought || '', msg.steps);
      if (artifact) {
        const key = `artifact:${artifact.type}:${artifact.title || ''}:${artifact.filePath || ''}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          items.push({
            id: `msg-${mIdx}`,
            type: artifact.type,
            title: artifact.title || (artifact.type === 'html' ? 'HTML 页面预览' : artifact.type === 'svg' ? 'SVG 矢量设计' : 'Mermaid 架构图'),
            content: artifact.content,
            filePath: artifact.filePath,
            timestamp: msg.timestamp,
            previewData: artifact
          });
        }
      }
    }

    return items;
  }, [messages, previewData]);

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter(item => {
      if (artifactFilter === 'html' && item.type !== 'html') return false;
      if (artifactFilter === 'svg' && item.type !== 'svg') return false;
      if (artifactFilter === 'mermaid' && item.type !== 'mermaid') return false;
      if (artifactFilter === 'docs' && item.type !== 'docx' && item.type !== 'pptx') return false;
      if (artifactSearch.trim()) {
        const q = artifactSearch.toLowerCase();
        return item.title.toLowerCase().includes(q) || (item.filePath && item.filePath.toLowerCase().includes(q));
      }
      return true;
    });
  }, [artifacts, artifactFilter, artifactSearch]);

  const handleOpenArtifactInBrowser = async (item: ArtifactItem) => {
    if (!item.content && !item.filePath) return;
    if (window.electronAPI?.openInBrowser) {
      await window.electronAPI.openInBrowser({
        content: item.content || '',
        title: item.title,
        defaultPath: item.filePath
      });
    } else if (item.content) {
      const blob = new Blob([item.content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  const handleRevealArtifact = async (filePath?: string) => {
    if (filePath && window.electronAPI?.showItemInFolder) {
      await window.electronAPI.showItemInFolder(filePath);
    }
  };

  const handleOpenArtifactPath = async (filePath?: string) => {
    if (filePath && window.electronAPI?.openPath) {
      await window.electronAPI.openPath(filePath);
    }
  };

  const handleDownloadArtifact = async (item: ArtifactItem) => {
    if (!item.content) return;
    try {
      const ext = item.type === 'html' ? '.html' : item.type === 'svg' ? '.svg' : '.txt';
      const defaultName = item.title.includes('.') ? item.title : `${item.title}${ext}`;
      if (window.electronAPI?.saveFile) {
        await window.electronAPI.saveFile({
          defaultName,
          content: item.content,
          isBase64: false
        });
      }
    } catch (e) {
      console.error('Failed to save artifact:', e);
    }
  };

  const handleCopyArtifact = async (item: ArtifactItem) => {
    if (!item.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  useEffect(() => {
    if (activeTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (gitStatus && gitStatus.files.length > 0) {
      if (!selectedFile || !gitStatus.files.some(f => f.path === selectedFile)) {
        setSelectedFile(gitStatus.files[0].path);
      }
    } else {
      setSelectedFile(null);
      setFileDiff('');
    }
  }, [gitStatus]);

  useEffect(() => {
    if (currentTab === 'diff' && selectedFile && workspacePath && window.electronAPI) {
      setLoadingDiff(true);
      window.electronAPI.getFileDiff(workspacePath, selectedFile)
        .then(diff => {
          setFileDiff(diff);
        })
        .catch(err => {
          setFileDiff(`无法加载文件差异: ${err.message}`);
        })
        .finally(() => {
          setLoadingDiff(false);
        });
    }
  }, [currentTab, selectedFile, workspacePath]);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: WorkspaceDrawerTab) => {
    setCurrentTab(tab);
    onTabChange?.(tab);
  };

  const handleDiscard = async (relPath: string) => {
    if (!workspacePath || !window.electronAPI) return;
    const ok = window.confirm(`确定要放弃对 "${relPath}" 的本地修改吗？此操作不可恢复。`);
    if (!ok) return;

    const res = await window.electronAPI.discardFileChange(workspacePath, relPath);
    if (res) {
      setDiscardSuccess(relPath);
      setTimeout(() => setDiscardSuccess(null), 2000);
      onRefreshGit();
    }
  };

  const getStatusIcon = (status: GitFileStatus['status']) => {
    switch (status) {
      case 'added':
      case 'untracked':
        return <FilePlus className="h-3.5 w-3.5 text-emerald-500" />;
      case 'deleted':
        return <FileX className="h-3.5 w-3.5 text-[var(--error)]" />;
      default:
        return <FileEdit className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150 select-none">
      <div
        style={{ width: isFullScreen ? '100%' : `${drawerWidth}px` }}
        className={`relative flex h-full flex-col border-l border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl animate-in slide-in-from-right duration-150 transition-[width] ${
          isDragging ? 'transition-none select-none' : ''
        }`}
      >
        {/* Left Resizer Drag Handle (双击复位，按住自由拉伸) */}
        {!isFullScreen && (
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={handleResetWidth}
            title="按住鼠标拖拽调整工作台宽度，双击快速恢复默认"
            className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-40 group flex items-center justify-center select-none"
          >
            <div className={`w-1 h-12 rounded-full transition-all ${
              isDragging ? 'bg-[var(--primary)] h-20 shadow-md' : 'bg-[var(--border)] group-hover:bg-[var(--primary)] group-hover:h-16'
            }`} />
          </div>
        )}

        {/* Dragging Overlay (防止拖拽时光标进入 iframe 导致断触) */}
        {isDragging && (
          <div className="absolute inset-0 z-50 cursor-col-resize" />
        )}

        {/* Top Header with Tab Switcher */}
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--background)]/80">
          <div className="flex items-center space-x-1">
            {/* Tabs */}
            <button
              type="button"
              onClick={() => handleTabSwitch('preview')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                currentTab === 'preview'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>多模态产物预览</span>
              {previewData && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('artifacts')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                currentTab === 'artifacts'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>交付制品货架</span>
              {artifacts.length > 0 && (
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                  currentTab === 'artifacts' ? 'bg-white/25 text-white' : 'bg-[var(--primary)]/15 text-[var(--primary)]'
                }`}>
                  {artifacts.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('diff')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                currentTab === 'diff'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Git 变更审阅</span>
              {gitStatus && gitStatus.files.length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-400 font-mono">
                  {gitStatus.files.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabSwitch('terminal')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                currentTab === 'terminal'
                  ? 'bg-[var(--primary)] text-white shadow-xs'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>控制台大屏</span>
            </button>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center space-x-1">
            {/* Pop-out button if previewData exists */}
            {currentTab === 'preview' && previewData && window.electronAPI?.popoutPreview && (
              <button
                type="button"
                onClick={() => {
                  window.electronAPI.popoutPreview({
                    type: previewData.type,
                    title: previewData.title,
                    content: previewData.content
                  });
                }}
                title="弹出为独立系统子窗口 (支持多屏协同)"
                className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? '恢复常规宽度' : '全屏展开工作台'}
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title="关闭工作台 (Esc)"
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab 1: Live Preview */}
        {currentTab === 'preview' && (
          <div className="flex-1 overflow-hidden">
            {previewData ? (
              previewData.type === 'mermaid' ? (
                <MermaidPreview content={previewData.content} title={previewData.title} />
              ) : previewData.type === 'svg' ? (
                <SvgPreview content={previewData.content} title={previewData.title} />
              ) : (
                <HtmlPreview content={previewData.content} title={previewData.title} filePath={previewData.filePath} />
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[var(--muted-foreground)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--muted)] text-[var(--muted-foreground)] mb-4">
                  <Eye className="h-8 w-8" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--foreground)] mb-1">
                  暂无待预览的产物
                </h3>
                <p className="text-xs max-w-sm leading-relaxed mb-6">
                  当 Agent 生成 HTML 网页、Vue/React 代码、SVG 矢量设计图或 Mermaid 流程架构图时，点击消息中的【👁️ 实时预览】即可在此全屏呈现。
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('artifacts')}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                  >
                    查看交付制品货架 ({artifacts.length}) &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabSwitch('diff')}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                  >
                    查看 Git 变更 &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Artifacts Shelf (交付制品归档货架) */}
        {currentTab === 'artifacts' && (
          <div className="flex flex-1 flex-col overflow-hidden bg-[var(--background)]">
            {/* Shelf Toolbar: Filter Chips & Search */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5 bg-[var(--card)]/50">
              {/* Category Filter Chips */}
              <div className="flex items-center space-x-1 overflow-x-auto text-xs py-0.5">
                {[
                  { id: 'all', label: '全部产物', count: artifacts.length },
                  { id: 'html', label: 'HTML 大屏', count: artifacts.filter(a => a.type === 'html').length },
                  { id: 'svg', label: 'SVG 设计', count: artifacts.filter(a => a.type === 'svg').length },
                  { id: 'mermaid', label: 'Mermaid 拓扑', count: artifacts.filter(a => a.type === 'mermaid').length },
                  { id: 'docs', label: '商业公文', count: artifacts.filter(a => a.type === 'docx' || a.type === 'pptx').length },
                ].map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setArtifactFilter(chip.id as any)}
                    className={`flex items-center space-x-1 rounded-full px-2.5 py-1 transition-colors cursor-pointer ${
                      artifactFilter === chip.id
                        ? 'bg-[var(--primary)] text-white font-medium shadow-xs'
                        : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <span>{chip.label}</span>
                    {chip.count > 0 && (
                      <span className={`text-[10px] rounded-full px-1.5 py-0.2 ${
                        artifactFilter === chip.id ? 'bg-white/25 text-white' : 'bg-[var(--border)] text-[var(--muted-foreground)]'
                      }`}>
                        {chip.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative flex items-center min-w-[160px] max-w-[220px]">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  placeholder="搜索交付物..."
                  value={artifactSearch}
                  onChange={e => setArtifactSearch(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-8 pr-3 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>
            </div>

            {/* Artifacts Grid / List */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredArtifacts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center text-[var(--muted-foreground)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--muted)] text-[var(--muted-foreground)] mb-4">
                    <Package className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold text-sm text-[var(--foreground)] mb-1">
                    {artifacts.length === 0 ? '本会话暂未生成交付制品' : '未找到匹配的交付制品'}
                  </h3>
                  <p className="text-xs max-w-sm leading-relaxed mb-4">
                    当 Agent 生成 HTML 监控大屏、SVG 矢量设计图、Mermaid 流程图或 Office 报告时，系统会自动将交付物收纳在此货架中，方便集中查阅、外置打开与多端导出。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredArtifacts.map(art => {
                    const isHtml = art.type === 'html';
                    const isSvg = art.type === 'svg';
                    const isMermaid = art.type === 'mermaid';
                    const isDocx = art.type === 'docx';
                    const isPptx = art.type === 'pptx';

                    return (
                      <div
                        key={art.id}
                        className="group relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs hover:border-[var(--primary)]/40 hover:shadow-md transition-all"
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="flex items-center space-x-2.5">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                              isHtml ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                              isSvg ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                              isMermaid ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' :
                              isDocx ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
                              isPptx ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                              'bg-purple-500/10 text-purple-600'
                            }`}>
                              {isHtml && <Globe className="h-5 w-5" />}
                              {isSvg && <Sparkles className="h-5 w-5" />}
                              {isMermaid && <GitBranch className="h-5 w-5" />}
                              {isDocx && <FileText className="h-5 w-5" />}
                              {isPptx && <Presentation className="h-5 w-5" />}
                            </div>

                            <div className="overflow-hidden">
                              <h4 className="text-xs font-semibold text-[var(--foreground)] truncate max-w-[200px]" title={art.title}>
                                {art.title}
                              </h4>
                              <div className="flex items-center space-x-1.5 text-[10px] text-[var(--muted-foreground)] mt-0.5">
                                <span className={`px-1.5 py-0.2 rounded font-medium ${
                                  isHtml ? 'bg-blue-500/10 text-blue-600' :
                                  isSvg ? 'bg-emerald-500/10 text-emerald-600' :
                                  isMermaid ? 'bg-cyan-500/10 text-cyan-600' :
                                  isDocx ? 'bg-indigo-500/10 text-indigo-600' :
                                  'bg-amber-500/10 text-amber-600'
                                }`}>
                                  {isHtml ? 'HTML 页面' : isSvg ? 'SVG 矢量' : isMermaid ? 'Mermaid' : isDocx ? 'Word 文档' : isPptx ? 'PPT 幻灯片' : '文件'}
                                </span>
                                {art.timestamp && (
                                  <span className="flex items-center space-x-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    <span>{new Date(art.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* File Path Pill (if exists) */}
                        {art.filePath && (
                          <div
                            onClick={() => handleRevealArtifact(art.filePath)}
                            title={`点击在 Windows 资源管理器中定位: ${art.filePath}`}
                            className="flex items-center space-x-1 rounded bg-[var(--muted)]/60 px-2 py-1 text-[10px] text-[var(--muted-foreground)] font-mono truncate mb-3 cursor-pointer hover:bg-[var(--muted)] hover:text-[var(--primary)] transition-colors"
                          >
                            <FolderOpen className="h-3 w-3 shrink-0" />
                            <span className="truncate">{art.filePath}</span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-1">
                          <div className="flex items-center space-x-1.5">
                            {/* Primary Action: View Preview in workbench */}
                            {art.previewData && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (art.previewData) {
                                    onSelectPreview?.(art.previewData);
                                    handleTabSwitch('preview');
                                  }
                                }}
                                className="flex items-center space-x-1 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--primary)]/90 transition-colors shadow-2xs cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>立即预览</span>
                              </button>
                            )}

                            {/* External action for docx/pptx */}
                            {(isDocx || isPptx) && art.filePath && (
                              <button
                                type="button"
                                onClick={() => handleOpenArtifactPath(art.filePath)}
                                className="flex items-center space-x-1 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--primary)]/90 transition-colors shadow-2xs cursor-pointer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>系统打开</span>
                              </button>
                            )}

                            {/* External browser open for HTML */}
                            {isHtml && (
                              <button
                                type="button"
                                onClick={() => handleOpenArtifactInBrowser(art)}
                                title="在系统默认浏览器中打开 (Chrome/Edge 全屏体验)"
                                className="flex items-center space-x-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors cursor-pointer"
                              >
                                <Globe className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">浏览器打开</span>
                              </button>
                            )}
                          </div>

                          {/* Secondary utility actions */}
                          <div className="flex items-center space-x-1">
                            {art.filePath && (
                              <button
                                type="button"
                                onClick={() => handleRevealArtifact(art.filePath)}
                                title="在资源管理器中定位"
                                className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {art.content && (
                              <button
                                type="button"
                                onClick={() => handleDownloadArtifact(art)}
                                title="另存为本地文件"
                                className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {art.content && (
                              <button
                                type="button"
                                onClick={() => handleCopyArtifact(art)}
                                title="复制源码/内容"
                                className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                              >
                                {copiedId === art.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Git Diff Drawer */}
        {currentTab === 'diff' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Left File List */}
            <div className="w-64 border-r border-[var(--border)] bg-[var(--card)] flex flex-col shrink-0">
              <div className="flex items-center justify-between p-3 border-b border-[var(--border)] text-xs font-semibold text-[var(--foreground)]">
                <div className="flex items-center space-x-1.5">
                  <GitCommit className="h-4 w-4 text-[var(--primary)]" />
                  <span>已改动文件清单</span>
                </div>
                <button
                  type="button"
                  onClick={onRefreshGit}
                  title="刷新 Git 状态"
                  className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {!gitStatus || gitStatus.files.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                    工作区干净，无未提交修改。
                  </div>
                ) : (
                  gitStatus.files.map(f => {
                    const isSelected = selectedFile === f.path;
                    return (
                      <div
                        key={f.path}
                        onClick={() => setSelectedFile(f.path)}
                        className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[var(--primary)]/15 text-[var(--primary)] font-semibold'
                            : 'text-[var(--foreground)] hover:bg-[var(--muted)]/60'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          {getStatusIcon(f.status)}
                          <span className="truncate">{f.path}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDiscard(f.path);
                          }}
                          title="放弃此文件修改"
                          className="opacity-0 group-hover:opacity-100 rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--error)] transition-all"
                        >
                          <Undo2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Diff Viewer */}
            <div className="flex-1 flex flex-col bg-[var(--background)] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
                <span className="font-mono text-[var(--foreground)] font-medium">
                  {selectedFile || '请选择左侧文件'}
                </span>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => handleDiscard(selectedFile)}
                    className="flex items-center space-x-1 text-rose-400 hover:text-rose-300 text-xs transition-colors"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>放弃修改</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed select-text bg-[#090d14]">
                {loadingDiff ? (
                  <div className="flex items-center space-x-2 text-[var(--muted-foreground)]">
                    <RefreshCw className="h-4 w-4 animate-spin text-[var(--primary)]" />
                    <span>正在加载差异比较...</span>
                  </div>
                ) : fileDiff ? (
                  <pre className="whitespace-pre-wrap">
                    {fileDiff.split('\n').map((line, idx) => {
                      let color = 'text-slate-300';
                      let bg = '';
                      if (line.startsWith('+')) {
                        color = 'text-emerald-400';
                        bg = 'bg-emerald-950/30';
                      } else if (line.startsWith('-')) {
                        color = 'text-rose-400';
                        bg = 'bg-rose-950/30';
                      } else if (line.startsWith('@@')) {
                        color = 'text-cyan-400 font-bold';
                        bg = 'bg-cyan-950/20';
                      }
                      return (
                        <div key={idx} className={`px-1.5 py-0.5 ${color} ${bg}`}>
                          {line}
                        </div>
                      );
                    })}
                  </pre>
                ) : (
                  <div className="text-[var(--muted-foreground)]">
                    暂无差异详情。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Expanded Live Terminal */}
        {currentTab === 'terminal' && (
          <div className="flex-1 p-4 bg-[var(--background)] overflow-y-auto">
            <LiveTerminalCard
              sessionId={activeSessionId}
              status="running"
              title="ASTeam 全局交互式控制台"
              liveOutput={terminalOutput}
              isExpandable={false}
            />
          </div>
        )}
      </div>
    </div>
  );
};
