import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { GitStatusSummary, GitFileStatus } from '../types/project';
import { HtmlPreview } from './preview/HtmlPreview';
import { MermaidPreview } from './preview/MermaidPreview';
import { SvgPreview } from './preview/SvgPreview';
import { LiveTerminalCard } from './LiveTerminalCard';

export type WorkspaceDrawerTab = 'preview' | 'diff' | 'terminal';

export interface PreviewData {
  type: 'html' | 'mermaid' | 'svg';
  title?: string;
  content: string;
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
  terminalOutput = ''
}) => {
  const [currentTab, setCurrentTab] = useState<WorkspaceDrawerTab>(activeTab);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Git Diff states
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [discardSuccess, setDiscardSuccess] = useState<string | null>(null);

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
      <div className={`flex h-full flex-col border-l border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl animate-in slide-in-from-right duration-200 transition-all ${
        isFullScreen ? 'w-full' : 'w-full max-w-4xl'
      }`}>
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
                <HtmlPreview content={previewData.content} title={previewData.title} />
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
                <button
                  type="button"
                  onClick={() => handleTabSwitch('diff')}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  查看当前 Git 变更 &rarr;
                </button>
              </div>
            )}
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
          <div className="flex-1 p-4 bg-[#0a0e17] overflow-y-auto">
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
