export type ScheduledTaskType = 'health_check' | 'security_scan' | 'test_runner' | 'autonomous_task';

export type ScheduledTaskSchedule =
  | 'every_30m'
  | 'every_1h'
  | 'every_2h'
  | 'every_6h'
  | 'daily_2am'
  | 'daily_9am'
  | 'weekly'
  | string;

export interface ScheduledTask {
  id: string;
  name: string;
  type: ScheduledTaskType;
  schedule: ScheduledTaskSchedule;
  enabled: boolean;
  workspacePath: string | null;
  prompt?: string;
  createdAt: number;
  lastRunTime?: number;
  lastRunStatus?: 'success' | 'failed' | 'running';
  lastRunDurationMs?: number;
  lastReportPath?: string;
  nextRunTime?: number;
  runCount: number;
}

export interface InspectionReport {
  id: string;
  taskId: string;
  taskName: string;
  type: ScheduledTaskType;
  workspacePath: string;
  timestamp: number;
  status: 'pass' | 'warning' | 'fail';
  score: number; // 0 - 100
  summary: string;
  filePath: string;
  fileName: string;
  metrics: {
    totalItemsChecked?: number;
    issuesFound?: number;
    criticalIssues?: number;
    passedItems?: number;
    durationMs?: number;
    commandExecuted?: string;
  };
}

export interface SchedulerEventPayload {
  type: 'task_started' | 'task_completed' | 'task_failed' | 'report_generated';
  taskId: string;
  taskName: string;
  report?: InspectionReport;
  error?: string;
}
