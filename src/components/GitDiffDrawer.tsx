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
  Check
} from 'lucide-react';
import { GitStatusSummary, GitFileStatus } from '../types/project';

interface GitDiffDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string | null;
  gitStatus: GitStatusSummary | null;
  onRefreshGit: () => void;
}

export const GitDiffDrawer: React.FC<GitDiffDrawerProps> = ({
  isOpen,
  onClose,
  workspacePath,
  gitStatus,
  onRefreshGit
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [discardSuccess, setDiscardSuccess] = useState<string | null>(null);

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
    if (selectedFile && workspacePath && window.electronAPI) {
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
  }, [selectedFile, workspacePath]);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs animate-in fade-in duration-150 select-none">
      <div className="flex h-full w-full max-w-3xl flex-col border-l border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--background)]/60">
          <div className="flex items-center space-x-2">
            <GitBranch className="h-4 w-4 text-[var(--primary)]" />
            <span className="font-semibold text-xs text-[var(--foreground)]">
              工作区 Git 变更审阅 (Diff Drawer)
            </span>
            {gitStatus?.branch && (
              <span className="rounded bg-[var(--primary)]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--primary)]">
                {gitStatus.branch}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onRefreshGit}
              title="刷新 Git 状态"
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Area: Files List (Left) + Diff View (Right) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Files List Column */}
          <div className="w-64 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col">
            <div className="flex items-center justify-between p-2.5 border-b border-[var(--border)] text-[11px] font-medium text-[var(--muted-foreground)]">
              <span>变更文件 ({gitStatus?.files.length || 0})</span>
              {gitStatus && (
                <span className="font-mono text-[10px]">
                  <strong className="text-emerald-600 dark:text-emerald-400">+{gitStatus.totalAdditions}</strong>{' '}
                  <strong className="text-[var(--error)]">-{gitStatus.totalDeletions}</strong>
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {(!gitStatus || gitStatus.files.length === 0) ? (
                <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
                  工作区干净，无未提交的修改
                </div>
              ) : (
                gitStatus.files.map((file) => {
                  const isSelected = selectedFile === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      className={`group flex items-center justify-between rounded-md p-2 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'bg-[var(--primary)] text-white font-medium shadow-2xs'
                          : 'text-[var(--foreground)] hover:bg-[var(--card)]'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        {getStatusIcon(file.status)}
                        <span className="truncate font-mono text-[11px]" title={file.path}>
                          {file.path.split(/[\\/]/).pop()}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <span className={`font-mono text-[9px] ${isSelected ? 'text-white/80' : 'text-[var(--muted-foreground)]'}`}>
                          +{file.additions} -{file.deletions}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Diff View Column */}
          <div className="flex-1 flex flex-col bg-[var(--background)] overflow-hidden">
            {selectedFile ? (
              <>
                {/* File Bar */}
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2 bg-[var(--card)]">
                  <div className="flex items-center space-x-2 truncate">
                    <FileCode className="h-4 w-4 text-[var(--primary)] shrink-0" />
                    <span className="font-mono text-xs font-semibold text-[var(--foreground)] truncate" title={selectedFile}>
                      {selectedFile}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDiscard(selectedFile)}
                    className="inline-flex items-center space-x-1 rounded border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)] hover:border-[var(--error)] hover:text-[var(--error)] transition-colors"
                  >
                    {discardSuccess === selectedFile ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span>已放弃</span>
                      </>
                    ) : (
                      <>
                        <Undo2 className="h-3 w-3" />
                        <span>放弃修改</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Diff Viewer Body */}
                <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed">
                  {loadingDiff ? (
                    <div className="text-center text-[var(--muted-foreground)] py-8">
                      正在对比文件差异...
                    </div>
                  ) : !fileDiff ? (
                    <div className="text-center text-[var(--muted-foreground)] py-8">
                      暂无差异
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 overflow-x-auto">
                      {fileDiff.split('\n').map((line, idx) => {
                        let lineStyle = 'text-[var(--foreground)]';
                        let bgStyle = '';

                        if (line.startsWith('+++') || line.startsWith('---')) {
                          lineStyle = 'font-bold text-[var(--muted-foreground)]';
                        } else if (line.startsWith('@@')) {
                          lineStyle = 'text-blue-500 dark:text-blue-400 font-semibold';
                          bgStyle = 'bg-blue-500/5';
                        } else if (line.startsWith('+')) {
                          lineStyle = 'text-emerald-600 dark:text-emerald-400';
                          bgStyle = 'bg-emerald-500/10 -mx-3 px-3';
                        } else if (line.startsWith('-')) {
                          lineStyle = 'text-[var(--error)]';
                          bgStyle = 'bg-[var(--error)]/10 -mx-3 px-3';
                        }

                        return (
                          <div key={idx} className={`${lineStyle} ${bgStyle} whitespace-pre py-0.5`}>
                            {line || ' '}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[var(--muted-foreground)]">
                请在左侧选择要审阅的代码变更文件
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
