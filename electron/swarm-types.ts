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
  workers: SwarmWorkerAgent[];
  workerPoolMetrics: WorkerPoolMetrics;
  summary?: string;
  startedAt: number;
  updatedAt: number;
}
