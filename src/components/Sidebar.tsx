import React, { useState } from 'react';
import {
  Folder,
  FolderPlus,
  Plus,
  MoreVertical,
  Pin,
  Trash2,
  Settings,
  ChevronDown,
  ChevronRight,
  Filter,
  MessageSquare,
  Sparkles,
  GitBranch,
  FolderOpen
} from 'lucide-react';
import { Project, ProjectSession } from '../types/project';

interface SidebarProps {
  projects: Project[];
  sessions: ProjectSession[];
  activeProjectId: string | null;
  activeSessionId: string;
  onSelectProject: (projectId: string) => void;
  onToggleProjectExpand: (projectId: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
  onSelectSession: (sessionId: string, projectId: string) => void;
  onNewSessionForProject: (projectId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onTogglePinSession: (sessionId: string) => void;
  onOpenSettings: () => void;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '刚刚';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 5) return '刚刚';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  onSelectProject,
  onToggleProjectExpand,
  onAddProject,
  onRemoveProject,
  onSelectSession,
  onNewSessionForProject,
  onDeleteSession,
  onTogglePinSession,
  onOpenSettings
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [showFilterInput, setShowFilterInput] = useState(false);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);

  const generalSessions = sessions.filter(s => s.projectId === 'general');

  const filterSessions = (list: ProjectSession[]) => {
    if (!filterQuery.trim()) return list;
    return list.filter(s => s.title.toLowerCase().includes(filterQuery.toLowerCase()));
  };

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] select-none text-xs">
      {/* Top Header: Projects + Action Icons */}
      <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-3 bg-[var(--card)]/40">
        <span className="font-semibold text-xs tracking-tight text-[var(--foreground)]">
          Projects
        </span>

        <div className="flex items-center space-x-1 text-[var(--muted-foreground)]">
          <button
            type="button"
            onClick={() => setShowFilterInput(!showFilterInput)}
            title="搜索/过滤会话"
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onAddProject}
            title="添加本地项目文件夹"
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Input Bar if opened */}
      {showFilterInput && (
        <div className="border-b border-[var(--border)] p-2 bg-[var(--background)]">
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder="搜索会话..."
            className="w-full rounded border border-[var(--input)] bg-[var(--card)] px-2 py-1 text-[11px] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
            autoFocus
          />
        </div>
      )}

      {/* Tree Content: General Chat + Projects List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* 1. General Unattached Chat Group */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)] group">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>通用宿主任务 (免项目模式)</span>
            </div>
            <button
              type="button"
              onClick={() => onNewSessionForProject('general')}
              title="新建通用宿主任务"
              className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--card)] text-[var(--foreground)] transition-opacity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-0.5 pl-2">
            {filterSessions(generalSessions).map(session => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id, 'general')}
                  className={`group relative flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                    isActive
                      ? 'bg-[var(--primary)] text-white font-medium shadow-2xs'
                      : 'text-[var(--foreground)] hover:bg-[var(--card)]'
                  }`}
                >
                  <span className="truncate pr-2" title={session.title}>
                    {session.title || '新对话'}
                  </span>

                  <div className="flex items-center space-x-1 shrink-0 text-[10px]">
                    <span className={isActive ? 'text-white/80' : 'text-[var(--muted-foreground)]'}>
                      {formatRelativeTime(session.updatedAt || session.createdAt)}
                    </span>
                    {isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white ml-0.5" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Projects List and Nested Sessions (Matching Reference Screenshot) */}
        {projects.map(project => {
          const projectSessions = sessions.filter(s => s.projectId === project.id);
          const isProjectActive = activeProjectId === project.id;

          return (
            <div key={project.id} className="space-y-0.5">
              {/* Project Header Item */}
              <div
                onClick={() => {
                  onSelectProject(project.id);
                  onToggleProjectExpand(project.id);
                }}
                className={`group flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                  isProjectActive
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-semibold'
                    : 'text-[var(--foreground)] hover:bg-[var(--card)]'
                }`}
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <span className="text-[var(--muted-foreground)]">
                    {project.isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </span>
                  <Folder className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                  <span className="truncate text-xs" title={project.path}>
                    {project.name}
                  </span>
                </div>

                {/* Project Actions on Hover */}
                <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewSessionForProject(project.id);
                    }}
                    title={`在 "${project.name}" 下新建任务会话`}
                    className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--muted)] text-[var(--foreground)]"
                  >
                    <Plus className="h-3 w-3" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`从列表中移除项目 "${project.name}"？（不会删除本地文件）`)) {
                        onRemoveProject(project.id);
                      }
                    }}
                    title="移除项目"
                    className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--error)]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Nested Project Sessions */}
              {project.isExpanded && (
                <div className="pl-4 space-y-0.5 border-l border-[var(--border)] ml-3 my-0.5">
                  {filterSessions(projectSessions).length === 0 ? (
                    <div className="py-1 px-2 text-[10px] text-[var(--muted-foreground)] italic">
                      暂无会话，点击上方 + 新建
                    </div>
                  ) : (
                    filterSessions(projectSessions).map(session => {
                      const isActive = session.id === activeSessionId;
                      return (
                        <div
                          key={session.id}
                          onClick={() => onSelectSession(session.id, project.id)}
                          className={`group relative flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-xs transition-colors ${
                            isActive
                              ? 'bg-[var(--primary)] text-white font-medium shadow-2xs'
                              : 'text-[var(--foreground)] hover:bg-[var(--card)]'
                          }`}
                        >
                          <span className="truncate pr-2" title={session.title}>
                            {session.title || '新任务'}
                          </span>

                          <div className="flex items-center space-x-1 shrink-0 text-[10px]">
                            {session.isPinned && (
                              <Pin className={`h-2.5 w-2.5 rotate-45 ${isActive ? 'text-white' : 'text-[var(--primary)]'}`} />
                            )}
                            <span className={isActive ? 'text-white/80' : 'text-[var(--muted-foreground)]'}>
                              {formatRelativeTime(session.updatedAt || session.createdAt)}
                            </span>
                            {/* Blue dot indicator matching user's screenshot */}
                            {isActive ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-white ml-0.5" />
                            ) : session.isUnread ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 ml-0.5" />
                            ) : null}

                            {/* Delete on hover */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session.id);
                              }}
                              className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity ${
                                isActive ? 'hover:bg-white/20 text-white' : 'hover:bg-[var(--muted)] text-[var(--muted-foreground)]'
                              }`}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {projects.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3 text-center space-y-2 bg-[var(--card)]/30 my-4">
            <FolderOpen className="h-6 w-6 text-[var(--muted-foreground)] mx-auto" />
            <p className="text-[11px] text-[var(--muted-foreground)]">
              还没有添加项目，点击上方添加本地工程目录
            </p>
            <button
              type="button"
              onClick={onAddProject}
              className="inline-flex items-center space-x-1 rounded bg-[var(--primary)]/10 px-2 py-1 text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors"
            >
              <FolderPlus className="h-3 w-3" />
              <span>添加 Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Settings Button (Exact layout as User's Reference Screenshot) */}
      <div className="border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center space-x-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)] transition-colors"
        >
          <Settings className="h-4 w-4 text-[var(--primary)]" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
