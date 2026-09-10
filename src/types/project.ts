export interface Project {
  id: string;
  name: string;
  path: string;
  isExpanded: boolean;
  createdAt: number;
  gitBranch?: string;
  gitChangesCount?: {
    files: number;
    additions: number;
    deletions: number;
  };
}

export interface ProjectSession {
  id: string;
  projectId: string; // 'general' or specific project id
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  isUnread?: boolean;
  model?: string;
}

export interface McpToolConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isBuiltin: boolean;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isBuiltin: boolean;
  promptSnippet?: string;
}

export type ExecutionMode = 'auto_edit' | 'plan_only' | 'safe_approval' | 'swarm';

export type SwarmAgentRole = 'architect' | 'coder' | 'tester' | 'reviewer';
export type SwarmAgentStatus = 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';
export type SwarmPhase = 'planning' | 'executing' | 'verifying' | 'reviewing' | 'completed' | 'failed';

export interface SwarmWorkerAgent {
  id: string;
  name: string;
  role: SwarmAgentRole;
  workerIndex: number;
  taskTitle: string;
  progress: number; // 0 - 100
  status: 'idle' | 'running' | 'completed' | 'failed';
  tokenCount: number;
  durationMs: number;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
  parentId?: string;
}

export interface WorkerPoolMetrics {
  totalSpawned: number;
  activeConcurrency: number;
  maxConcurrency: number;
  completedWorkers: number;
  failedWorkers: number;
  totalTokens: number;
  totalDurationMs: number;
}

export interface SwarmSubTask {
  id: string;
  title: string;
  role: SwarmAgentRole;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input: string;
  output?: string;
  error?: string;
  dependencies?: string[];
  startedAt?: number;
  completedAt?: number;
  isParallel?: boolean;
  workerId?: string;
  progress?: number;
}

export interface SwarmBusMessage {
  id: string;
  fromRole: SwarmAgentRole | 'system' | 'user' | string;
  toRole: SwarmAgentRole | 'all' | string;
  type: 'task_dispatch' | 'task_result' | 'issue_report' | 'approval' | 'discussion' | 'system_notice';
  content: string;
  timestamp: number;
  taskId?: string;
  workerId?: string;
}

export interface SwarmAgentState {
  role: SwarmAgentRole;
  name: string;
  title: string;
  status: SwarmAgentStatus;
  currentTaskId?: string;
  taskTitle?: string;
  tokenCount?: number;
  lastActiveTime: number;
}

export interface SwarmState {
  sessionId: string;
  phase: SwarmPhase;
  activeRole: SwarmAgentRole | null;
  agents: Record<SwarmAgentRole, SwarmAgentState>;
  tasks: SwarmSubTask[];
  messages: SwarmBusMessage[];
  workers?: SwarmWorkerAgent[];
  workerPoolMetrics?: WorkerPoolMetrics;
  summary?: string;
  startedAt: number;
  updatedAt: number;
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface GitStatusSummary {
  branch: string;
  isGitRepo: boolean;
  files: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface CheckpointItem {
  id: string;
  sessionId: string;
  workspacePath: string;
  timestamp: number;
  title: string;
  description?: string;
  modifiedFiles: string[];
  newFiles: string[];
  isGitRepo: boolean;
  backupDirPath: string;
  rolledBack?: boolean;
  rolledBackAt?: number;
}

export interface ProjectRulesInfo {
  hasRules: boolean;
  filePath: string | null;
  ruleType: 'asteamrules' | 'asteam_rules_file' | 'asteam_md' | 'none';
  content: string;
}

export interface WorkspaceFileItem {
  name: string;
  relPath: string;
  ext: string;
}

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
  score: number;
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

