import React, { useState, useEffect } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  FolderPlus,
  FolderCheck,
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  X,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export interface Session {
  id: string;
  title: string;
  createdAt: number;
}

interface WorkspaceFileItem {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  workspacePath: string | null;
  onSelectWorkspace: () => void;
  onClearWorkspace: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  workspacePath,
  onSelectWorkspace,
  onClearWorkspace
}) => {
  const [fileList, setFileList] = useState<WorkspaceFileItem[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const loadWorkspaceFiles = async (dir: string) => {
    if (!window.electronAPI) return;
    setLoadingFiles(true);
    try {
      const files = await window.electronAPI.listWorkspaceFiles(dir);
      setFileList(files);
    } catch {
      setFileList([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (workspacePath) {
      loadWorkspaceFiles(workspacePath);
    } else {
      setFileList([]);
      setShowFiles(false);
    }
  }, [workspacePath]);

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] select-none text-xs">
      {/* New Session Button */}
      <div className="p-3 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onNewSession}
          className="flex w-full items-center justify-center space-x-2 rounded-lg bg-[var(--primary)] py-2 px-3 font-semibold text-[var(--primary-foreground)] shadow-xs hover:bg-[var(--primary-hover)] transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>新建对话</span>
        </button>
      </div>

      {/* Workspace Management Section */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--card)]/40">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
            本地工作区 (Workspace)
          </span>
          {workspacePath && (
            <button
              type="button"
              onClick={() => loadWorkspaceFiles(workspacePath)}
              title="刷新工作区文件"
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <RefreshCw className={`h-3 w-3 ${loadingFiles ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {workspacePath ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5 shadow-2xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2 min-w-0">
                  <FolderCheck className="h-4 w-4 text-[var(--primary)] shrink-0" />
                  <div className="truncate">
                    <span className="font-semibold text-[var(--foreground)] truncate block" title={workspacePath}>
                      {workspaceName}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)] truncate block font-mono">
                      {workspacePath}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearWorkspace}
                  title="卸载工作区 (降级至通用对话)"
                  className="text-[var(--muted-foreground)] hover:text-[var(--error)] p-0.5 rounded transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Mode Badge */}
              <div className="mt-2 flex items-center justify-between">
                <span className="inline-flex items-center rounded-sm bg-[var(--primary)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--primary)]">
                  deepseek-harness 模式
                </span>
                <button
                  type="button"
                  onClick={onSelectWorkspace}
                  className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline"
                >
                  切换目录
                </button>
              </div>
            </div>

            {/* Expandable Workspace File Tree Preview */}
            <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--card)]/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowFiles(!showFiles)}
                className="flex w-full items-center justify-between p-2 text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <div className="flex items-center space-x-1.5">
                  {showFiles ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>工作区文件列表</span>
                </div>
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                  {fileList.length} 项
                </span>
              </button>

              {showFiles && (
                <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-0.5 font-mono text-[11px]">
                  {fileList.length === 0 ? (
                    <div className="text-[10px] text-[var(--muted-foreground)] py-1 italic">
                      (工作区为空或无第一层文件)
                    </div>
                  ) : (
                    fileList.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center space-x-1.5 py-0.5 text-[var(--foreground)] truncate"
                        title={item.path}
                      >
                        {item.isDirectory ? (
                          <Folder className="h-3 w-3 text-amber-500 shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                        )}
                        <span className="truncate">{item.name}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center space-y-2 bg-[var(--card)]/30">
            <div className="flex justify-center text-[var(--muted-foreground)]">
              <FolderPlus className="h-6 w-6 text-[var(--primary)]/70" />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold text-[var(--foreground)] text-[11px]">未挂载本地工作区</p>
              <p className="text-[10px] text-[var(--muted-foreground)] leading-relaxed">
                当前运行在通用对话模式。挂载文件夹后即可启用 deepseek-harness 的规划、代码修改及终端执行能力。
              </p>
            </div>
            <button
              type="button"
              onClick={onSelectWorkspace}
              className="inline-flex items-center space-x-1 rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors"
            >
              <FolderPlus className="h-3 w-3" />
              <span>选择文件夹挂载</span>
            </button>
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
          历史会话 ({sessions.length})
        </div>

        {sessions.map(s => {
          const isActive = s.id === activeSessionId;
          return (
            <div
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`group flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-[var(--primary)] text-white font-medium shadow-2xs'
                  : 'text-[var(--foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-[var(--muted-foreground)]'}`} />
                <span className="truncate text-xs">{s.title || '新对话'}</span>
              </div>

              {sessions.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                  title="删除会话"
                  className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${
                    isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Branding Info */}
      <div className="border-t border-[var(--border)] p-2.5 text-center text-[10px] text-[var(--muted-foreground)]">
        <span>ASTeam Agent · v1.0.0</span>
      </div>
    </aside>
  );
};
