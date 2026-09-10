import React, { useState } from 'react';
import {
  Users,
  Compass,
  Code2,
  CheckSquare,
  ShieldCheck,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Activity,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  SwarmState,
  SwarmAgentRole,
  SwarmSubTask,
  SwarmBusMessage,
  SwarmWorkerAgent
} from '../types/project';

interface SwarmTabProps {
  swarmState: SwarmState | null | undefined;
  isRunning?: boolean;
}

const ROLE_CONFIG: Record<
  SwarmAgentRole,
  {
    name: string;
    roleTitle: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    bgColor: string;
    borderColor: string;
    activeBorder: string;
    textColor: string;
  }
> = {
  architect: {
    name: 'Architect',
    roleTitle: '架构主控与编排',
    icon: Compass,
    accentColor: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    borderColor: 'border-sky-200 dark:border-sky-800/60',
    activeBorder: 'ring-2 ring-sky-500 border-sky-400',
    textColor: 'text-sky-800 dark:text-sky-300'
  },
  coder: {
    name: 'Coder',
    roleTitle: '全栈核心研发',
    icon: Code2,
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800/60',
    activeBorder: 'ring-2 ring-emerald-500 border-emerald-400',
    textColor: 'text-emerald-800 dark:text-emerald-300'
  },
  tester: {
    name: 'Tester',
    roleTitle: '自动化测试质量',
    icon: CheckSquare,
    accentColor: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800/60',
    activeBorder: 'ring-2 ring-amber-500 border-amber-400',
    textColor: 'text-amber-800 dark:text-amber-300'
  },
  reviewer: {
    name: 'Reviewer',
    roleTitle: '规约与安全审计',
    icon: ShieldCheck,
    accentColor: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800/60',
    activeBorder: 'ring-2 ring-purple-500 border-purple-400',
    textColor: 'text-purple-800 dark:text-purple-300'
  }
};

const PHASES = [
  { key: 'planning', label: '1. 架构拆解', icon: Compass },
  { key: 'executing', label: '2. 弹性编码', icon: Code2 },
  { key: 'verifying', label: '3. 用例质检', icon: CheckSquare },
  { key: 'reviewing', label: '4. 安全审计', icon: ShieldCheck },
  { key: 'completed', label: '5. 成果交付', icon: CheckCircle2 }
];

const PHASE_INDEX: Record<string, number> = {
  planning: 0,
  executing: 1,
  verifying: 2,
  reviewing: 3,
  completed: 4
};

export const SwarmTab: React.FC<SwarmTabProps> = ({ swarmState, isRunning = false }) => {
  const [isTasksOpen, setIsTasksOpen] = useState(true);
  const [isBusOpen, setIsBusOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  if (!swarmState) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center select-none bg-[var(--background)]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mb-4 shadow-xs">
          <Users className="h-8 w-8" />
        </div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-1.5">
          多智能体协同蜂群监控中心
        </h3>
        <p className="text-xs text-[var(--muted-foreground)] max-w-sm leading-relaxed mb-5">
          当前会话尚未激活多智能体协同。在聊天输入框输入 <code className="font-mono bg-[var(--muted)] px-1.5 py-0.5 rounded text-teal-600 dark:text-teal-400">/swarm</code> 即可唤醒架构师、工程师、测试员、审计员与动态弹性 Worker 集群！
        </p>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left max-w-sm w-full space-y-2.5 text-xs text-[var(--muted-foreground)]">
          <div className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-teal-500" />
            <span>蜂群协同核心特性</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            <span>4 大专业角色拓扑分工与闭环交付</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            <span>根据任务自适应动态孵化临时轻量 Worker 池</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            <span>固定于此右侧面板，避免被长文流式输出冲刷</span>
          </div>
        </div>
      </div>
    );
  }

  const currentPhaseIdx = PHASE_INDEX[swarmState.phase] ?? (swarmState.phase === 'failed' ? -1 : 0);
  const workers = swarmState.workers || [];
  const poolMetrics = swarmState.workerPoolMetrics || {
    totalSpawned: workers.length,
    activeConcurrency: workers.filter(w => w.status === 'running').length,
    maxConcurrency: 4,
    completedWorkers: workers.filter(w => w.status === 'completed').length,
    failedWorkers: workers.filter(w => w.status === 'failed').length,
    totalTokens: workers.reduce((acc, w) => acc + (w.tokenCount || 0), 0),
    totalDurationMs: workers.reduce((acc, w) => acc + (w.durationMs || 0), 0)
  };

  const roles: SwarmAgentRole[] = ['architect', 'coder', 'tester', 'reviewer'];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--background)] p-4 space-y-4">
      {/* 1. Header Bar with Fixed View Badge */}
      <div className="rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-50/60 to-emerald-50/40 p-3.5 dark:border-teal-900/50 dark:from-teal-950/20 dark:to-emerald-950/10 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
            <Users className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                蜂群协同固定监控视图
              </span>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                已固定防冲刷
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              在此常驻监视进度与 Worker 状态，不受左侧消息流滚动干扰
            </p>
          </div>
        </div>

        {swarmState.activeRole && isRunning && (
          <div className="flex items-center gap-1.5 rounded-full border border-teal-300/60 bg-white/90 px-3 py-1 text-xs font-medium text-teal-800 shadow-2xs dark:border-teal-700/60 dark:bg-slate-800 dark:text-teal-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
            </span>
            <span>活跃: {ROLE_CONFIG[swarmState.activeRole].name}</span>
          </div>
        )}
      </div>

      {/* 2. Top Execution Progress Stepper (用户强烈建议：顶部执行进度条挪到右侧) */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
            <Activity className="h-3.5 w-3.5 text-teal-500" />
            <span>执行进度阶段步进器 (Execution Phase Pipeline)</span>
          </div>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            当前阶段: <strong className="text-teal-600 dark:text-teal-400 uppercase">{swarmState.phase}</strong>
          </span>
        </div>

        {/* Stepper Steps */}
        <div className="grid grid-cols-5 gap-1 pt-1">
          {PHASES.map((phase, idx) => {
            const Icon = phase.icon;
            const isPassed = currentPhaseIdx > idx;
            const isCurrent = currentPhaseIdx === idx;

            return (
              <div key={phase.key} className="flex flex-col items-center text-center relative">
                {/* Step Node */}
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all mb-1.5 ${
                    isPassed
                      ? 'bg-emerald-500 text-white shadow-2xs'
                      : isCurrent
                      ? 'bg-teal-600 text-white ring-4 ring-teal-500/20 shadow-xs scale-105 animate-pulse'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }`}
                >
                  {isPassed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>

                {/* Step Label */}
                <span
                  className={`text-[10px] font-medium leading-tight ${
                    isCurrent
                      ? 'text-teal-600 dark:text-teal-400 font-semibold'
                      : isPassed
                      ? 'text-[var(--foreground)]'
                      : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  {phase.label}
                </span>

                {/* Connector line between steps */}
                {idx < PHASES.length - 1 && (
                  <div
                    className={`hidden sm:block absolute top-3.5 left-[calc(50%+14px)] w-[calc(100%-28px)] h-0.5 ${
                      isPassed ? 'bg-emerald-500' : 'bg-[var(--border)]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Elastic Worker Pool Dynamic Cluster Swimlane (重点：动态弹性 Worker 泳道看板) */}
      <div className="rounded-xl border border-teal-200/80 bg-[var(--card)] p-3.5 shadow-xs dark:border-teal-900/50">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-600 text-white">
              <Cpu className="h-3.5 w-3.5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                动态弹性子智能体池 (Elastic Worker Pool)
              </span>
              <span className="ml-1.5 text-[10px] text-teal-600 dark:text-teal-400 font-mono">
                {workers.length} 节点
              </span>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded bg-teal-500/10 px-2 py-0.5 text-teal-700 dark:text-teal-300 font-medium">
              并发: <strong>{poolMetrics.activeConcurrency}</strong> / {poolMetrics.maxConcurrency}
            </span>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300 font-medium">
              完成: <strong>{poolMetrics.completedWorkers}</strong>
            </span>
            {poolMetrics.failedWorkers > 0 && (
              <span className="rounded bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300 font-medium">
                异常: <strong>{poolMetrics.failedWorkers}</strong>
              </span>
            )}
            <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
              {((poolMetrics.totalDurationMs || 0) / 1000).toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Worker Cards or Idle state */}
        {workers.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">
            <Cpu className="h-6 w-6 mx-auto mb-2 opacity-40 text-teal-500" />
            <p>主控 Agent 正在拆解任务，进入编码与测试阶段将自适应孵化 Worker 节点...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 pt-3">
            {workers.map((w: SwarmWorkerAgent) => {
              const roleConfig = ROLE_CONFIG[w.role] || ROLE_CONFIG.coder;
              const isCompleted = w.status === 'completed';
              const isRunning = w.status === 'running';
              const isFailed = w.status === 'failed';

              return (
                <div
                  key={w.id}
                  className={`flex flex-col justify-between rounded-xl border p-3 text-xs transition-all bg-[var(--card)] ${
                    isRunning
                      ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
                      : isCompleted
                      ? 'border-emerald-300/60 dark:border-emerald-800/40'
                      : isFailed
                      ? 'border-rose-300/60 dark:border-rose-800/40'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${roleConfig.bgColor} ${roleConfig.textColor}`}>
                          {w.name}
                        </span>
                        <span className="truncate font-medium text-[var(--foreground)]" title={w.taskTitle}>
                          {w.taskTitle}
                        </span>
                      </div>

                      {/* Status indicator */}
                      <div className="shrink-0">
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            {w.progress}%
                          </span>
                        ) : isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            已交付
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                            <AlertCircle className="h-2.5 w-2.5" />
                            异常
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--muted-foreground)]">就绪</span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : isFailed
                            ? 'bg-rose-500'
                            : 'bg-teal-500 animate-pulse'
                        }`}
                        style={{ width: `${w.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Worker Footer Info */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>耗时: {(w.durationMs / 1000).toFixed(1)}s</span>
                    </span>
                    {w.tokenCount > 0 && (
                      <span className="font-mono">Tokens: {w.tokenCount}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Core 4 Professional Agents Matrix */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--foreground)]">
            四大专业角色协同拓扑 (Core Swarm Topology)
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">进程内异步总线互联</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {roles.map(roleKey => {
            const config = ROLE_CONFIG[roleKey];
            const Icon = config.icon;
            const agent = swarmState.agents[roleKey];
            const isActive = swarmState.activeRole === roleKey && isRunning;
            const isCompleted = agent?.status === 'completed';

            return (
              <div
                key={roleKey}
                className={`rounded-lg border p-2.5 text-xs transition-all ${config.bgColor} ${config.borderColor} ${
                  isActive ? config.activeBorder : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${config.accentColor}`} />
                    <span className="font-semibold text-[var(--foreground)]">{config.name}</span>
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.2 text-[9px] font-medium text-blue-700 dark:text-blue-300">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      推理中
                    </span>
                  ) : isCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      就绪
                    </span>
                  ) : (
                    <span className="text-[9px] text-[var(--muted-foreground)]">等待</span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
                  {agent?.taskTitle || (isActive ? '正在进行角色级深度推理...' : '待指派协同子任务')}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Subtask DAG Pipeline */}
      {swarmState.tasks.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs">
          <button
            type="button"
            onClick={() => setIsTasksOpen(!isTasksOpen)}
            className="flex w-full items-center justify-between text-xs font-semibold text-[var(--foreground)]"
          >
            <div className="flex items-center gap-1.5">
              {isTasksOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Layers className="h-3.5 w-3.5 text-teal-500" />
              <span>协同任务流水线 (DAG Pipeline: {swarmState.tasks.length})</span>
            </div>
            <span className="text-[11px] font-normal text-[var(--muted-foreground)]">
              完成 {swarmState.tasks.filter(t => t.status === 'completed').length} / {swarmState.tasks.length}
            </span>
          </button>

          {isTasksOpen && (
            <div className="space-y-2 pt-2.5 mt-2 border-t border-[var(--border)]">
              {swarmState.tasks.map((task: SwarmSubTask) => {
                const roleConfig = ROLE_CONFIG[task.role] || ROLE_CONFIG.coder;
                const isTaskExpanded = expandedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs"
                  >
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedTaskId(isTaskExpanded ? null : task.id)}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-medium ${roleConfig.bgColor} ${roleConfig.textColor}`}>
                          {roleConfig.name}
                        </span>
                        <span className="truncate font-medium text-[var(--foreground)]">{task.title}</span>
                      </div>
                      <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
                        {task.status === 'completed' ? '✅ 完成' : task.status === 'running' ? '⚡ 执行中' : task.status === 'failed' ? '❌ 失败' : '⏳ 排队'}
                      </span>
                    </div>
                    {isTaskExpanded && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)] text-[11px] text-[var(--muted-foreground)] space-y-1">
                        <p>{task.input}</p>
                        {task.output && (
                          <div className="rounded bg-[var(--muted)] p-2 font-mono text-[10px] text-[var(--foreground)] whitespace-pre-wrap">
                            {task.output}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. Asynchronous Bus Messages */}
      {swarmState.messages.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs">
          <button
            type="button"
            onClick={() => setIsBusOpen(!isBusOpen)}
            className="flex w-full items-center justify-between text-xs font-semibold text-[var(--foreground)]"
          >
            <div className="flex items-center gap-1.5">
              {isBusOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <MessageSquare className="h-3.5 w-3.5 text-teal-500" />
              <span>跨 Agent 通信总线日志 ({swarmState.messages.length})</span>
            </div>
            <span className="text-[10px] text-[var(--muted-foreground)]">实时通信流</span>
          </button>

          {isBusOpen && (
            <div className="space-y-1.5 pt-2.5 mt-2 border-t border-[var(--border)] max-h-48 overflow-y-auto">
              {swarmState.messages.map((msg: SwarmBusMessage) => (
                <div
                  key={msg.id}
                  className="rounded border border-[var(--border)] bg-[var(--background)] p-2 text-[10px]"
                >
                  <div className="flex items-center justify-between text-[9px] text-[var(--muted-foreground)] mb-1">
                    <span className="font-semibold text-teal-600 dark:text-teal-400 uppercase">
                      {msg.fromRole} ➔ {msg.toRole}
                    </span>
                    <span>
                      {(() => {
                        const ts = msg.timestamp;
                        if (!ts) return '';
                        const ms = ts < 10000000000 ? ts * 1000 : ts;
                        return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
                      })()}
                    </span>
                  </div>
                  <p className="text-[var(--foreground)]">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
