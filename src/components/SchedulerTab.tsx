import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Trash2,
  RotateCcw,
  Shield,
  Activity,
  Code2,
  Bot,
  ExternalLink,
  FolderOpen,
  FileText,
  FileCheck2,
  Sparkles,
  ChevronRight,
  Eye,
  Check,
  X
} from 'lucide-react';
import { ScheduledTask, InspectionReport, ScheduledTaskType } from '../types/project';

interface SchedulerTabProps {
  workspacePath: string | null;
  onPreviewReport?: (title: string, content: string, filePath?: string) => void;
}

const TYPE_CONFIG: Record<
  ScheduledTaskType,
  {
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  health_check: {
    name: '代码健康体检',
    icon: Activity,
    accentColor: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    borderColor: 'border-sky-200 dark:border-sky-800/60'
  },
  security_scan: {
    name: '依赖与密钥安全',
    icon: Shield,
    accentColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800/60'
  },
  test_runner: {
    name: '自动化测试巡检',
    icon: Code2,
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800/60'
  },
  autonomous_task: {
    name: '长程自主巡航',
    icon: Bot,
    accentColor: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800/60'
  },
  enterprise_compliance: {
    name: '企业安全合规体检',
    icon: Shield,
    accentColor: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/30',
    borderColor: 'border-teal-200 dark:border-teal-800/60'
  }
};

const SCHEDULE_LABELS: Record<string, string> = {
  every_30m: '每 30 分钟',
  every_1h: '每 1 小时',
  every_2h: '每 2 小时',
  every_6h: '每 6 小时',
  daily_2am: '每天凌晨 02:00',
  daily_9am: '每天上午 09:00',
  weekly: '每周一次'
};

export const SchedulerTab: React.FC<SchedulerTabProps> = ({ workspacePath, onPreviewReport }) => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeReportFilter, setActiveReportFilter] = useState<'all' | ScheduledTaskType>('all');
  const [previewingReport, setPreviewingReport] = useState<{ title: string; content: string; filePath?: string } | null>(null);

  // New task form state
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskType, setNewTaskType] = useState<ScheduledTaskType>('health_check');
  const [newTaskSchedule, setNewTaskSchedule] = useState('every_2h');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');

  const loadData = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const [fetchedTasks, fetchedReports] = await Promise.all([
        window.electronAPI.getScheduledTasks(workspacePath),
        window.electronAPI.getInspectionReports(workspacePath)
      ]);
      setTasks(fetchedTasks || []);
      setReports(fetchedReports || []);
    } catch (err) {
      console.error('Failed to load scheduler data:', err);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadData();

    if (window.electronAPI?.onSchedulerEvent) {
      const cleanup = window.electronAPI.onSchedulerEvent((event: any) => {
        if (event.type === 'task_started') {
          setRunningTaskId(event.taskId);
        } else if (event.type === 'task_completed' || event.type === 'task_failed') {
          setRunningTaskId(null);
          loadData();
        }
      });
      return () => cleanup();
    }
  }, [loadData]);

  const handleToggleTask = async (task: ScheduledTask) => {
    if (!window.electronAPI) return;
    const nextEnabled = !task.enabled;
    const updated = await window.electronAPI.toggleScheduledTask(task.id, nextEnabled);
    if (updated) {
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, enabled: nextEnabled } : t)));
    }
  };

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRunNow = async (task: ScheduledTask) => {
    if (!window.electronAPI) return;
    setRunningTaskId(task.id);
    try {
      const report = await window.electronAPI.runScheduledTaskNow(task.id, workspacePath || undefined);
      if (report) {
        await loadData();
        showToast(`巡检完成:「${task.name}」(${report.score} 分 · ${report.status.toUpperCase()})`, 'success');
      }
    } catch (err: any) {
      console.error('Run task now failed:', err);
      showToast(`巡检失败: ${err.message || '未知异常'}`, 'error');
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.electronAPI) return;
    const success = await window.electronAPI.deleteScheduledTask(taskId);
    if (success) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !window.electronAPI) return;

    const created = await window.electronAPI.saveScheduledTask({
      name: newTaskName.trim(),
      type: newTaskType,
      schedule: newTaskSchedule,
      enabled: true,
      workspacePath,
      prompt: newTaskType === 'autonomous_task' ? newTaskPrompt.trim() : undefined
    });

    if (created) {
      setTasks(prev => [...prev, created]);
      setShowCreateModal(false);
      setNewTaskName('');
      setNewTaskPrompt('');
      showToast(`已创建后台巡航任务: ${created.name}`, 'success');
    }
  };

  const handleOpenReport = async (report: InspectionReport) => {
    if (!window.electronAPI) return;
    // 优先读取 HTML 自包含全景审计报表 (支持打印与系统级 PDF 导出)
    const pathToRead = report.htmlReportPath || report.filePath;
    const isHtml = Boolean(report.htmlReportPath || pathToRead.endsWith('.html'));
    const res = await window.electronAPI.readInspectionReport(pathToRead);
    if (res.success && res.content) {
      const reportTitle = isHtml
        ? (report.fileName.endsWith('.html') ? report.fileName : report.fileName.replace(/\.md$/, '.html'))
        : report.fileName;

      if (onPreviewReport) {
        onPreviewReport(reportTitle, res.content, pathToRead);
      } else {
        setPreviewingReport({
          title: reportTitle,
          content: res.content,
          filePath: pathToRead
        });
      }
    } else {
      showToast(`读取报告失败: ${res.error || '文件无法加载'}`, 'error');
    }
  };

  const handleRevealFile = async (filePath?: string) => {
    if (filePath && window.electronAPI?.showItemInFolder) {
      await window.electronAPI.showItemInFolder(filePath);
    }
  };

  const filteredReports = reports.filter(r => {
    if (activeReportFilter === 'all') return true;
    return r.type === activeReportFilter;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="flex items-center space-x-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
            <CalendarClock className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">
                后台长程巡航与定时调度器
              </span>
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                后台守护中 (Active Daemon)
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              脱离前台 UI · 周期性全库体检 · 依赖已知漏洞扫描 · 交付制品自动沉淀
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] cursor-pointer"
            title="刷新巡检任务与体检报告"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-teal-700 cursor-pointer dark:bg-teal-500 dark:hover:bg-teal-600"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>新建巡航任务</span>
          </button>
        </div>
      </div>

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Section A: Active Scheduled Tasks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center space-x-1.5">
              <span>自主巡航任务列表 ({tasks.length})</span>
            </h3>
            <span className="text-[11px] text-[var(--muted-foreground)]">
              已启用 {tasks.filter(t => t.enabled).length} / {tasks.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map(task => {
              const config = TYPE_CONFIG[task.type] || TYPE_CONFIG.health_check;
              const Icon = config.icon;
              const isRunning = runningTaskId === task.id || task.lastRunStatus === 'running';

              return (
                <div
                  key={task.id}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition-all ${
                    config.bgColor
                  } ${config.borderColor} ${!task.enabled ? 'opacity-60' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-2xs dark:bg-slate-800 ${config.accentColor}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          {config.name}
                        </span>
                      </div>

                      {/* Enable Switch Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleTask(task)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          task.enabled ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={task.enabled ? '点击禁用该任务' : '点击启用该任务'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            task.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1 mb-1">
                      {task.name}
                    </h4>

                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>调度周期: <strong className="font-medium text-slate-700 dark:text-slate-200">{SCHEDULE_LABELS[task.schedule] || task.schedule}</strong></span>
                      </div>

                      {task.lastRunTime && (
                        <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                          <span>上次完成: {new Date(task.lastRunTime).toLocaleTimeString()}</span>
                          {task.lastRunDurationMs && (
                            <span>({(task.lastRunDurationMs / 1000).toFixed(1)}s)</span>
                          )}
                        </div>
                      )}

                      {task.nextRunTime && task.enabled && (
                        <div className="text-[11px] text-teal-700 dark:text-teal-400 font-mono">
                          下次运行: {new Date(task.nextRunTime).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5 text-xs dark:border-slate-800">
                    <span className="text-[11px] text-slate-400">
                      已累计巡检 {task.runCount || 0} 次
                    </span>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleRunNow(task)}
                        disabled={isRunning}
                        className="flex items-center space-x-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-teal-700 border border-teal-300 shadow-2xs hover:bg-teal-50 cursor-pointer dark:bg-slate-800 dark:text-teal-300 dark:border-teal-700 dark:hover:bg-slate-700"
                        title="立即在后台静默执行一次"
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin text-teal-600" />
                            <span>巡检中...</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 text-teal-600" />
                            <span>立即巡检</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer transition-colors"
                        title="删除该任务"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section B: Inspection Reports Shelf */}
        <div className="border-t border-[var(--border)] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center space-x-2">
              <FileCheck2 className="h-4 w-4 text-teal-600" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
                交付制品库 · 体检巡检报告 ({filteredReports.length})
              </h3>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center space-x-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveReportFilter('all')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeReportFilter === 'all'
                    ? 'bg-teal-600 text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setActiveReportFilter('health_check')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeReportFilter === 'health_check'
                    ? 'bg-teal-600 text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                健康体检
              </button>
              <button
                type="button"
                onClick={() => setActiveReportFilter('security_scan')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeReportFilter === 'security_scan'
                    ? 'bg-teal-600 text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                安全审计
              </button>
              <button
                type="button"
                onClick={() => setActiveReportFilter('test_runner')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeReportFilter === 'test_runner'
                    ? 'bg-teal-600 text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                单测巡检
              </button>
              <button
                type="button"
                onClick={() => setActiveReportFilter('enterprise_compliance')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  activeReportFilter === 'enterprise_compliance'
                    ? 'bg-teal-600 text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                安全合规
              </button>
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--muted-foreground)]">
              <FileText className="h-8 w-8 text-[var(--muted-foreground)]/50 mb-2" />
              <p>当前工作区暂无体检报告</p>
              <p className="mt-1 text-[11px]">点击上方任意巡检任务的「立即巡检」按钮即可自动生成第一份报告</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              {filteredReports.map(report => {
                const config = TYPE_CONFIG[report.type] || TYPE_CONFIG.health_check;
                const Icon = config.icon;

                return (
                  <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-[var(--muted)]/50 transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--background)] shadow-2xs ${config.accentColor}`}>
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-[var(--foreground)] truncate max-w-xs" title={report.fileName}>
                            {report.fileName}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.2 text-[10px] font-medium ${
                            report.status === 'pass'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                              : report.status === 'warning'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                          }`}>
                            {report.score} 分 · {report.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-1">
                          {report.summary}
                        </p>
                        <div className="text-[10px] text-[var(--muted-foreground)] font-mono mt-0.5">
                          生成时间: {new Date(report.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenReport(report)}
                        className="flex items-center space-x-1 rounded-md bg-teal-600 px-2.5 py-1.2 text-xs font-medium text-white shadow-2xs hover:bg-teal-700 cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>查阅报告</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevealFile(report.filePath)}
                        className="flex items-center space-x-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] cursor-pointer"
                        title="在资源管理器中定位"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Scheduled Task */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center space-x-2">
                <CalendarClock className="h-4 w-4 text-teal-600" />
                <span>新建后台自主巡航任务</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[var(--foreground)] mb-1">
                  任务名称
                </label>
                <input
                  type="text"
                  value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  placeholder="例如：深夜核心依赖安全排查"
                  required
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)] focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--foreground)] mb-1">
                  巡检类型
                </label>
                <select
                  value={newTaskType}
                  onChange={e => setNewTaskType(e.target.value as ScheduledTaskType)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)] focus:border-teal-500 focus:outline-hidden"
                >
                  <option value="health_check">🩺 工作区代码健康体检 (Health Check)</option>
                  <option value="security_scan">🛡️ 依赖漏洞与密钥安全排查 (Security Scan)</option>
                  <option value="test_runner">🧪 自动化单元测试巡检 (Test Runner)</option>
                  <option value="enterprise_compliance">🏢 企业级安全合规与敏感风险综合体检 (Compliance Scan)</option>
                  <option value="autonomous_task">🤖 长程自主任务巡航 (Autonomous Runner)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-[var(--foreground)] mb-1">
                  调度频次 (Cron 周期)
                </label>
                <select
                  value={newTaskSchedule}
                  onChange={e => setNewTaskSchedule(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)] focus:border-teal-500 focus:outline-hidden"
                >
                  <option value="every_30m">每 30 分钟一次</option>
                  <option value="every_1h">每 1 小时一次</option>
                  <option value="every_2h">每 2 小时一次</option>
                  <option value="every_6h">每 6 小时一次</option>
                  <option value="daily_2am">每天凌晨 02:00</option>
                  <option value="daily_9am">每天上午 09:00</option>
                  <option value="weekly">每周一次</option>
                </select>
              </div>

              {newTaskType === 'autonomous_task' && (
                <div>
                  <label className="block font-medium text-[var(--foreground)] mb-1">
                    自主提示词 / 任务指引
                  </label>
                  <textarea
                    value={newTaskPrompt}
                    onChange={e => setNewTaskPrompt(e.target.value)}
                    rows={3}
                    placeholder="输入 Agent 在无人值守状态下执行的重构/编写提示词..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs text-[var(--foreground)] focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer shadow-xs"
                >
                  创建并启用
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Inline Report Preview */}
      {previewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 bg-[var(--background)]">
              <div className="flex items-center space-x-2">
                <FileCheck2 className="h-4 w-4 text-teal-600" />
                <span className="font-semibold text-xs text-[var(--foreground)]">
                  {previewingReport.title}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {previewingReport.filePath && (
                  <button
                    type="button"
                    onClick={() => handleRevealFile(previewingReport.filePath)}
                    className="flex items-center space-x-1 text-xs text-teal-600 hover:underline cursor-pointer"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>打开所在目录</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewingReport(null)}
                  className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed text-[var(--foreground)] bg-[var(--card)] select-text whitespace-pre-wrap">
              {previewingReport.content}
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className={`flex items-center space-x-2.5 rounded-xl border px-4 py-3 shadow-lg text-xs font-medium ${
            toastMessage.type === 'success'
              ? 'bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-300 dark:bg-teal-950/80 backdrop-blur-md'
              : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300 dark:bg-red-950/80 backdrop-blur-md'
          }`}>
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};
