import React, { useState } from 'react';
import {
  Users,
  Compass,
  Code2,
  CheckSquare,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  SendHorizontal,
  FileCheck2,
  Zap,
  Cpu,
  Layers,
  PanelRightOpen,
  ChevronUp
} from 'lucide-react';
import { SwarmState, SwarmAgentRole, SwarmSubTask, SwarmBusMessage, SwarmWorkerAgent } from '../types/project';

interface SwarmDashboardProps {
  swarmState: SwarmState;
  isRunning?: boolean;
  onOpenRightTab?: () => void;
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

const PHASE_TITLES: Record<string, { label: string; color: string }> = {
  planning: { label: '🎯 架构拆解中', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  executing: { label: '💻 核心研发中', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  verifying: { label: '🧪 自动化质检中', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  reviewing: { label: '🛡️ 安全审计中', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  completed: { label: '✅ 协同闭环完成', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200' },
  failed: { label: '⚠️ 协同受阻', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
};

export const SwarmDashboard: React.FC<SwarmDashboardProps> = ({ swarmState, isRunning, onOpenRightTab }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWorkersOpen, setIsWorkersOpen] = useState(true);
  const [isTasksOpen, setIsTasksOpen] = useState(true);
  const [isBusMessagesOpen, setIsBusMessagesOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const phaseInfo = PHASE_TITLES[swarmState.phase] || {
    label: swarmState.phase,
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
  };

  const roles: SwarmAgentRole[] = ['architect', 'coder', 'tester', 'reviewer'];
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

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-teal-200/80 bg-gradient-to-b from-white to-slate-50 shadow-sm dark:border-teal-900/50 dark:from-slate-900 dark:to-slate-950">
      {/* 1. Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100/80 bg-teal-50/40 px-4 py-3 dark:border-teal-900/40 dark:bg-teal-950/20">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm dark:bg-teal-500">
            <Users className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                多智能体协同蜂群 (Multi-Agent Swarm)
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${phaseInfo.color}`}>
                {phaseInfo.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              4 角色分工拓扑 · 进程内跨 Agent 异步消息总线 · 自动化交付闭环
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {swarmState.activeRole && isRunning && (
            <div className="flex items-center gap-1.5 rounded-full border border-teal-300/60 bg-white/80 px-2.5 py-0.5 text-xs font-medium text-teal-800 shadow-xs dark:border-teal-700/60 dark:bg-slate-800/90 dark:text-teal-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500"></span>
              </span>
              <span>活跃: {ROLE_CONFIG[swarmState.activeRole].name}</span>
            </div>
          )}

          {onOpenRightTab && (
            <button
              type="button"
              onClick={onOpenRightTab}
              className="flex items-center gap-1 rounded-lg border border-teal-300/80 bg-white px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:bg-slate-800 dark:text-teal-300 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
              title="在右侧工作台固定视图查看实时进度，避免消息流滚动冲刷"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              <span>固定在右侧查看</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title={isMinimized ? '展开看板' : '折叠看板'}
          >
            {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>

      {/* 2. 4 Agents Matrix Grid */}
      <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map((roleKey) => {
          const config = ROLE_CONFIG[roleKey];
          const Icon = config.icon;
          const agent = swarmState.agents[roleKey];
          const isActive = swarmState.activeRole === roleKey && isRunning;
          const isCompleted = agent?.status === 'completed';

          return (
            <div
              key={roleKey}
              className={`relative flex flex-col justify-between rounded-lg border p-3 transition-all ${
                config.bgColor
              } ${config.borderColor} ${isActive ? config.activeBorder : ''}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-xs dark:bg-slate-800 ${config.accentColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {config.name}
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {config.roleTitle}
                      </span>
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {agent?.status === 'thinking' ? '思考中' : '执行中'}
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        已就绪
                      </span>
                    ) : agent?.status === 'failed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
                        <AlertCircle className="h-3 w-3" />
                        受阻
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Clock className="h-3 w-3" />
                        等待
                      </span>
                    )}
                  </div>
                </div>

                {/* Subtask / Title summary */}
                <div className="mt-2.5 min-h-[34px]">
                  <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                    {agent?.taskTitle || (isActive ? '正在进行角色级深度推理...' : '待指派任务')}
                  </p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  <span>自主 Agent</span>
                </span>
                {agent?.currentTaskId && (
                  <span className="font-mono text-[10px] text-slate-500">
                    #{agent.currentTaskId}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2.5 Elastic Worker Pool Dynamic Cluster Swimlane (v1.7.0) */}
      {workers.length > 0 && (
        <div className="border-t border-teal-100/80 bg-slate-50/50 p-3 dark:border-teal-900/40 dark:bg-slate-900/40">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => setIsWorkersOpen(!isWorkersOpen)}
              className="flex items-center gap-2 text-left text-xs font-semibold text-slate-700 hover:text-teal-600 dark:text-slate-200 dark:hover:text-teal-400"
            >
              {isWorkersOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Cpu className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>动态弹性子智能体集群 (Elastic Worker Pool: {workers.length})</span>
            </button>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span>并发活跃: <strong className="text-teal-600 dark:text-teal-400">{poolMetrics.activeConcurrency}</strong> / {poolMetrics.maxConcurrency}</span>
              <span>•</span>
              <span>已交付: <strong className="text-emerald-600 dark:text-emerald-400">{poolMetrics.completedWorkers}</strong></span>
              {poolMetrics.failedWorkers > 0 && (
                <>
                  <span>•</span>
                  <span className="text-red-500 font-medium">异常: {poolMetrics.failedWorkers}</span>
                </>
              )}
              <span>•</span>
              <span>耗时: {((poolMetrics.totalDurationMs || 0) / 1000).toFixed(1)}s</span>
            </div>
          </div>

          {isWorkersOpen && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
              {workers.map((w: SwarmWorkerAgent) => {
                const roleConfig = ROLE_CONFIG[w.role] || ROLE_CONFIG.coder;
                const isCompleted = w.status === 'completed';
                const isRunning = w.status === 'running';
                const isFailed = w.status === 'failed';

                return (
                  <div
                    key={w.id}
                    className={`flex flex-col justify-between rounded-lg border p-2.5 text-xs transition-all bg-white dark:bg-slate-800/90 ${
                      isRunning
                        ? 'border-teal-400 ring-1 ring-teal-400/40 shadow-xs'
                        : isCompleted
                        ? 'border-emerald-200 dark:border-emerald-800/60'
                        : isFailed
                        ? 'border-red-200 dark:border-red-800/60'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 pb-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${roleConfig.bgColor} ${roleConfig.textColor}`}>
                            {w.name}
                          </span>
                          <span className="truncate font-medium text-slate-800 dark:text-slate-100" title={w.taskTitle}>
                            {w.taskTitle}
                          </span>
                        </div>
                        <div className="shrink-0">
                          {isRunning ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {w.progress}%
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              完成
                            </span>
                          ) : isFailed ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                              <AlertCircle className="h-2.5 w-2.5" />
                              异常
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">就绪</span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-teal-500'
                          }`}
                          style={{ width: `${w.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[10px] text-slate-400 dark:border-slate-700/60">
                      <span>耗时: {(w.durationMs / 1000).toFixed(1)}s</span>
                      {w.tokenCount > 0 && <span>Tokens: {w.tokenCount}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. SubTasks Pipeline (DAG) */}
      {swarmState.tasks.length > 0 && (
        <div className="border-t border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsTasksOpen(!isTasksOpen)}
            className="flex w-full items-center justify-between bg-slate-50/70 px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/80 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:bg-slate-800/60"
          >
            <div className="flex items-center gap-2">
              {isTasksOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="font-semibold">协同任务拓扑流水线 ({swarmState.tasks.length})</span>
            </div>
            <span className="text-[11px] text-slate-400">
              已完成 {swarmState.tasks.filter((t) => t.status === 'completed').length} / {swarmState.tasks.length}
            </span>
          </button>

          {isTasksOpen && (
            <div className="divide-y divide-slate-100 px-4 py-2 dark:divide-slate-800/60">
              {swarmState.tasks.map((task: SwarmSubTask) => {
                const roleConfig = ROLE_CONFIG[task.role] || ROLE_CONFIG.coder;
                const isExpanded = expandedTaskId === task.id;

                return (
                  <div key={task.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : task.status === 'running' ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-500" />
                        ) : task.status === 'failed' ? (
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                        )}

                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${roleConfig.bgColor} ${roleConfig.textColor} border ${roleConfig.borderColor}`}>
                          {roleConfig.name}
                        </span>

                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {task.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {task.output && (
                          <button
                            type="button"
                            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            className="text-[11px] text-teal-600 hover:text-teal-700 dark:text-teal-400"
                          >
                            {isExpanded ? '收起详情' : '查看产出'}
                          </button>
                        )}
                        <span className="font-mono text-[11px] text-slate-400">
                          #{task.id}
                        </span>
                      </div>
                    </div>

                    {isExpanded && task.output && (
                      <div className="mt-2 rounded-md bg-slate-100 p-2.5 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                        <div className="mb-1 text-[11px] font-semibold text-slate-500">任务交付输出摘要:</div>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px]">
                          {task.output}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. Inter-Agent Message Bus Log */}
      {swarmState.messages.length > 0 && (
        <div className="border-t border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsBusMessagesOpen(!isBusMessagesOpen)}
            className="flex w-full items-center justify-between bg-slate-50/80 px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100/90 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">跨 Agent 异步消息总线交互</span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 font-semibold">
                {swarmState.messages.length} 条记录
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-teal-600 dark:text-teal-400 font-medium hover:underline">
              <span>{isBusMessagesOpen ? '点击收起通信流' : '展开查看协同通信流'}</span>
              {isBusMessagesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </div>
          </button>

          {isBusMessagesOpen && (
            <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto px-4 py-2 dark:divide-slate-800/60">
              {swarmState.messages.map((msg: SwarmBusMessage) => {
                const isFromRole = msg.fromRole in ROLE_CONFIG;
                const fromConfig = isFromRole ? ROLE_CONFIG[msg.fromRole as SwarmAgentRole] : null;

                return (
                  <div key={msg.id} className="py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {fromConfig?.name || msg.fromRole}
                      </span>
                      <SendHorizontal className="h-3 w-3 text-slate-400" />
                      <span className="text-slate-600 dark:text-slate-400">
                        {msg.toRole === 'all' ? '全体 Agent' : msg.toRole}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
                        {msg.type}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">
                      {msg.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
};
