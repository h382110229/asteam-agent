import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  FileCode,
  FolderOpen,
  Edit3,
  GitCommit
} from 'lucide-react';
import { LiveTerminalCard } from './LiveTerminalCard';

export interface AgentStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  error?: string;
}

interface AgentTrajectoryProps {
  steps: AgentStep[];
  sessionId?: string;
  terminalOutputs?: Record<string, string>;
  onStopSession?: () => void;
}

export const AgentTrajectory: React.FC<AgentTrajectoryProps> = ({
  steps,
  sessionId,
  terminalOutputs,
  onStopSession
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  if (!steps || steps.length === 0) return null;

  const toggleStep = (id: string) => {
    setExpandedSteps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getToolIcon = (tool?: string) => {
    switch (tool) {
      case 'run_terminal_command':
        return <Terminal className="h-3.5 w-3.5 text-[var(--primary)]" />;
      case 'view_file':
        return <FileCode className="h-3.5 w-3.5 text-blue-500" />;
      case 'write_file':
        return <Edit3 className="h-3.5 w-3.5 text-amber-500" />;
      case 'list_directory':
        return <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />;
      default:
        return <GitCommit className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />;
    }
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const isAllDone = completedCount === steps.length;
  const hasRunning = steps.some(s => s.status === 'running');

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs shadow-xs">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between font-medium text-[var(--foreground)]"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-2">
          {hasRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
          ) : isAllDone ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--primary)]" />
          ) : (
            <GitCommit className="h-4 w-4 text-[var(--primary)]" />
          )}
          <span className="font-semibold text-xs">
            ASTeam Agent 2.0 任务规划与执行轨迹 (自研 Harness)
          </span>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
            {completedCount} / {steps.length} 步骤
          </span>
        </div>
        <button type="button" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Steps List */}
      {!isCollapsed && (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-2.5">
          {steps.map((step, idx) => {
            const isExpanded = expandedSteps[step.id] ?? (step.tool === 'run_terminal_command' || step.status === 'running' || step.status === 'failed');

            return (
              <div
                key={step.id || idx}
                className="rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/70 p-2.5 transition-all"
              >
                <div
                  className="flex cursor-pointer items-center justify-between"
                  onClick={() => toggleStep(step.id)}
                >
                  <div className="flex items-center space-x-2">
                    {/* Status Icon */}
                    {step.status === 'running' && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)] shrink-0" />
                    )}
                    {step.status === 'completed' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                    )}
                    {step.status === 'failed' && (
                      <AlertCircle className="h-3.5 w-3.5 text-[var(--error)] shrink-0" />
                    )}
                    {step.status === 'pending' && (
                      <Clock className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
                    )}

                    <span
                      className={`font-medium ${
                        step.status === 'running'
                          ? 'text-[var(--primary)] font-semibold'
                          : step.status === 'completed'
                          ? 'text-[var(--foreground)]'
                          : 'text-[var(--muted-foreground)]'
                      }`}
                    >
                      {step.title}
                    </span>

                    {step.tool && (
                      <div className="flex items-center space-x-1 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                        {getToolIcon(step.tool)}
                        <span className="font-mono">{step.tool}</span>
                      </div>
                    )}
                  </div>

                  {(step.args || step.result || step.error) && (
                    <span className="text-[var(--muted-foreground)]">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </div>

                {/* Details Accordion */}
                {isExpanded && (step.args || step.result || step.error || step.status === 'running') && (
                  <div className="mt-2 space-y-1.5 border-t border-[var(--border)]/50 pt-2 font-mono text-[11px]">
                    {step.tool === 'run_terminal_command' ? (
                      <LiveTerminalCard
                        sessionId={sessionId || 'current'}
                        stepId={step.id}
                        command={step.args?.command}
                        status={step.status}
                        liveOutput={terminalOutputs?.[step.id] || (step.status === 'running' ? (terminalOutputs?.[sessionId || ''] || '') : '')}
                        defaultOutput={step.result || step.error || ''}
                        onStop={onStopSession}
                        isExpandable={false}
                      />
                    ) : (
                      <>
                        {step.args && (
                          <div className="rounded bg-[var(--card)] p-2 border border-[var(--border)]/50">
                            <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] block mb-1">
                              调用参数
                            </span>
                            <pre className="overflow-x-auto text-[var(--foreground)] whitespace-pre-wrap">
                              {JSON.stringify(step.args, null, 2)}
                            </pre>
                          </div>
                        )}

                        {step.result && (
                          <div className="rounded bg-[var(--card)] p-2 border border-[var(--border)]/50">
                            <span className="text-[10px] uppercase font-bold text-[var(--primary)] block mb-1">
                              执行结果
                            </span>
                            <pre className="max-h-36 overflow-y-auto text-[var(--foreground)] whitespace-pre-wrap">
                              {step.result}
                            </pre>
                          </div>
                        )}

                        {step.error && (
                          <div className="rounded bg-[var(--error)]/10 p-2 border border-[var(--error)]/30 text-[var(--error)]">
                            <span className="text-[10px] uppercase font-bold block mb-1">
                              执行异常
                            </span>
                            <pre className="whitespace-pre-wrap">{step.error}</pre>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
