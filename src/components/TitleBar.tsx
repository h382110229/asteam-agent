import React, { useState, useEffect } from 'react';
import {
  Minus,
  Square,
  Copy,
  X,
  Settings,
  Sun,
  Moon,
  FolderGit2,
  Sparkles,
  GitBranch,
  FileDiff,
  Eye,
  ScrollText,
  Building2,
  Shield
} from 'lucide-react';
import { GitStatusSummary, ProjectRulesInfo } from '../types/project';

interface TitleBarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  workspacePath: string | null;
  gitStatus?: GitStatusSummary | null;
  onOpenGitDiff?: () => void;
  onOpenDrawer?: () => void;
  projectRules?: ProjectRulesInfo | null;
  onOpenRules?: () => void;
  onOpenEnterpriseHub?: () => void;
  onOpenSecurityCompliance?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  theme,
  onToggleTheme,
  onOpenSettings,
  workspacePath,
  gitStatus,
  onOpenGitDiff,
  onOpenDrawer,
  projectRules,
  onOpenRules,
  onOpenEnterpriseHub,
  onOpenSecurityCompliance
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
    }
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = async () => {
    window.electronAPI?.maximize();
    if (window.electronAPI) {
      const max = await window.electronAPI.isMaximized();
      setIsMaximized(max);
    }
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  const workspaceName = workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null;

  return (
    <header className="drag-region flex h-10 w-full items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-3 select-none z-50">
      {/* Left: App Logo & Workspace Tag */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          {/* ASteam Stylized Logo Icon */}
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary)] text-white shadow-xs">
            <span className="font-bold text-xs tracking-tight">A</span>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] ml-0.5" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-[var(--foreground)]">
            ASTeam Agent
          </span>
        </div>

        {/* Active Workspace Pill */}
        {workspacePath ? (
          <div
            title={workspacePath}
            className="flex items-center space-x-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]"
          >
            <FolderGit2 className="h-3 w-3 text-[var(--primary)]" />
            <span className="max-w-[140px] truncate font-mono text-[var(--foreground)]">
              {workspaceName}
            </span>
            <span className="rounded bg-[var(--primary)]/15 px-1 py-0.2 text-[9px] font-medium text-[var(--primary)]">
              harness
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
            <Sparkles className="h-2.5 w-2.5 text-[var(--primary)]" />
            <span className="font-medium text-[var(--foreground)]">通用宿主模式</span>
            <span className="rounded bg-[var(--primary)]/15 px-1 py-0.2 text-[9px] font-medium text-[var(--primary)]">
              可执行本机操作/生成文档
            </span>
          </div>
        )}

        {/* Git Branch & Diff Drawer Trigger Pill (No-Drag) */}
        {gitStatus && gitStatus.isGitRepo && (
          <button
            type="button"
            onClick={onOpenGitDiff}
            title="查看工作区 Git Diff 变更"
            className="no-drag flex items-center space-x-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors shadow-2xs"
          >
            <GitBranch className="h-3 w-3 text-[var(--primary)]" />
            <span className="font-mono">{gitStatus.branch || 'HEAD'}</span>
            {gitStatus.files.length > 0 ? (
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                · {gitStatus.files.length} 改动 (+{gitStatus.totalAdditions} -{gitStatus.totalDeletions})
              </span>
            ) : (
              <span className="text-[var(--muted-foreground)]">· 干净</span>
            )}
          </button>
        )}

        {/* Project Rules Pill */}
        {workspacePath && (
          <button
            type="button"
            onClick={onOpenRules}
            title={projectRules?.hasRules ? `当前项目行为准则已生效: ${projectRules.filePath}` : '该项目未配置行为准则，点击一键生成'}
            className={`no-drag flex items-center space-x-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors shadow-2xs cursor-pointer ${
              projectRules?.hasRules
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500'
                : 'border-dashed border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
            }`}
          >
            <ScrollText className="h-3 w-3" />
            <span>
              {projectRules?.hasRules
                ? `规约生效中 (${projectRules.ruleType === 'asteamrules' ? '.asteamrules' : projectRules.ruleType === 'asteam_md' ? 'ASTEAM.md' : '.asteam/rules'})`
                : '+ 规约未配置'}
            </span>
          </button>
        )}
      </div>

      {/* Right: Actions & Window Controls (All No-Drag) */}
      <div className="no-drag flex items-center space-x-1">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Workspace Workbench Drawer Button */}
        <button
          type="button"
          onClick={onOpenDrawer}
          title="打开右侧工作台 (多模态预览 / Git Diff / 交互控制台)"
          className="flex h-7 items-center space-x-1 rounded px-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer text-xs"
        >
          <Eye className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="hidden sm:inline font-medium">工作台</span>
        </button>

        {/* Enterprise Hub Button (v1.7.0) */}
        {onOpenEnterpriseHub && (
          <button
            type="button"
            onClick={onOpenEnterpriseHub}
            title="企业私有扩展与技能中心 (Enterprise Private Hub)"
            className="flex h-7 items-center space-x-1 rounded px-2 text-[var(--muted-foreground)] hover:bg-teal-50 hover:text-teal-600 dark:hover:bg-teal-950/40 dark:hover:text-teal-400 transition-colors cursor-pointer text-xs"
          >
            <Building2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden md:inline font-medium">企业扩展</span>
          </button>
        )}

        {/* Security & Knowledge Graph Button (v1.7.0) */}
        {onOpenSecurityCompliance && (
          <button
            type="button"
            onClick={onOpenSecurityCompliance}
            title="跨工作区图谱与出境安全围栏 (Security & Knowledge)"
            className="flex h-7 items-center space-x-1 rounded px-2 text-[var(--muted-foreground)] hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-950/40 dark:hover:text-purple-400 transition-colors cursor-pointer text-xs"
          >
            <Shield className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span className="hidden md:inline font-medium">安全围栏</span>
          </button>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="系统与模型配置"
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-[1px] bg-[var(--border)] mx-1" />

        {/* Window Controls */}
        <button
          type="button"
          onClick={handleMinimize}
          title="最小化"
          className="flex h-7 w-8 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={handleMaximize}
          title={isMaximized ? '向下还原' : '最大化'}
          className="flex h-7 w-8 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>

        <button
          type="button"
          onClick={handleClose}
          title="关闭 (最小化至系统托盘)"
          className="flex h-7 w-8 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--error)] hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
};
