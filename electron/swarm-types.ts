export type SwarmAgentRole = 'architect' | 'coder' | 'tester' | 'reviewer';

export type SwarmAgentStatus = 'idle' | 'thinking' | 'executing' | 'completed' | 'failed';

export type SwarmPhase = 'planning' | 'executing' | 'verifying' | 'reviewing' | 'completed' | 'failed';

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
}

export interface SwarmBusMessage {
  id: string;
  fromRole: SwarmAgentRole | 'system' | 'user';
  toRole: SwarmAgentRole | 'all';
  type: 'task_dispatch' | 'task_result' | 'issue_report' | 'approval' | 'discussion' | 'system_notice';
  content: string;
  timestamp: number;
  taskId?: string;
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
  summary?: string;
  startedAt: number;
  updatedAt: number;
}
