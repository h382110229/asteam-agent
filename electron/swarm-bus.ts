import {
  SwarmAgentRole,
  SwarmAgentStatus,
  SwarmPhase,
  SwarmSubTask,
  SwarmBusMessage,
  SwarmAgentState,
  SwarmState,
  SwarmWorkerAgent,
  WorkerPoolMetrics
} from './swarm-types';

export type SwarmStateUpdateListener = (state: SwarmState) => void;
export type SwarmMessageListener = (message: SwarmBusMessage) => void;

const DEFAULT_AGENTS_CONFIG: Record<SwarmAgentRole, { name: string; title: string }> = {
  architect: { name: 'Architect', title: '架构规划与编排主控' },
  coder: { name: 'Coder', title: '全栈核心研发工程师' },
  tester: { name: 'Tester', title: '自动化测试与质量保障' },
  reviewer: { name: 'Reviewer', title: '代码规范与安全审计官' }
};

export class SwarmMessageBus {
  private state: SwarmState;
  private stateListeners: Set<SwarmStateUpdateListener> = new Set();
  private messageListeners: Set<SwarmMessageListener> = new Set();

  constructor(sessionId: string) {
    const now = Date.now();
    const initialAgents: Record<SwarmAgentRole, SwarmAgentState> = {
      architect: {
        role: 'architect',
        name: DEFAULT_AGENTS_CONFIG.architect.name,
        title: DEFAULT_AGENTS_CONFIG.architect.title,
        status: 'idle',
        lastActiveTime: now,
        tokenCount: 0
      },
      coder: {
        role: 'coder',
        name: DEFAULT_AGENTS_CONFIG.coder.name,
        title: DEFAULT_AGENTS_CONFIG.coder.title,
        status: 'idle',
        lastActiveTime: now,
        tokenCount: 0
      },
      tester: {
        role: 'tester',
        name: DEFAULT_AGENTS_CONFIG.tester.name,
        title: DEFAULT_AGENTS_CONFIG.tester.title,
        status: 'idle',
        lastActiveTime: now,
        tokenCount: 0
      },
      reviewer: {
        role: 'reviewer',
        name: DEFAULT_AGENTS_CONFIG.reviewer.name,
        title: DEFAULT_AGENTS_CONFIG.reviewer.title,
        status: 'idle',
        lastActiveTime: now,
        tokenCount: 0
      }
    };

    this.state = {
      sessionId,
      phase: 'planning',
      activeRole: null,
      agents: initialAgents,
      tasks: [],
      messages: [],
      workers: [],
      workerPoolMetrics: {
        totalSpawned: 0,
        activeConcurrency: 0,
        maxConcurrency: 4,
        completedWorkers: 0,
        failedWorkers: 0,
        totalTokens: 0,
        totalDurationMs: 0
      },
      startedAt: now,
      updatedAt: now
    };
  }

  public getState(): SwarmState {
    return {
      ...this.state,
      agents: { ...this.state.agents },
      tasks: [...this.state.tasks],
      messages: [...this.state.messages],
      workers: [...this.state.workers],
      workerPoolMetrics: { ...this.state.workerPoolMetrics }
    };
  }

  public onStateUpdate(listener: SwarmStateUpdateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onMessage(listener: SwarmMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public setPhase(phase: SwarmPhase) {
    this.state.phase = phase;
    this.state.updatedAt = Date.now();
    this.broadcast();
  }

  public setActiveRole(role: SwarmAgentRole | null) {
    this.state.activeRole = role;
    this.state.updatedAt = Date.now();
    this.broadcast();
  }

  public setAgentStatus(
    role: SwarmAgentRole,
    status: SwarmAgentStatus,
    details?: { currentTaskId?: string; taskTitle?: string; tokenDelta?: number }
  ) {
    const agent = this.state.agents[role];
    if (agent) {
      agent.status = status;
      agent.lastActiveTime = Date.now();
      if (details?.currentTaskId !== undefined) {
        agent.currentTaskId = details.currentTaskId;
      }
      if (details?.taskTitle !== undefined) {
        agent.taskTitle = details.taskTitle;
      }
      if (details?.tokenDelta) {
        agent.tokenCount = (agent.tokenCount || 0) + details.tokenDelta;
      }
      this.state.updatedAt = Date.now();
      this.broadcast();
    }
  }

  public dispatchTask(taskData: Omit<SwarmSubTask, 'status' | 'startedAt' | 'completedAt'>): SwarmSubTask {
    const newTask: SwarmSubTask = {
      ...taskData,
      status: 'pending',
      startedAt: undefined,
      completedAt: undefined
    };
    this.state.tasks.push(newTask);
    this.state.updatedAt = Date.now();

    this.postMessage({
      fromRole: 'architect',
      toRole: taskData.role,
      type: 'task_dispatch',
      content: `[任务派发] 派发子任务 #${newTask.id}: "${newTask.title}" 至 ${DEFAULT_AGENTS_CONFIG[taskData.role]?.name || taskData.role}`,
      taskId: newTask.id
    });

    this.broadcast();
    return newTask;
  }

  public updateTaskStatus(
    taskId: string,
    status: SwarmSubTask['status'],
    output?: string,
    error?: string,
    extra?: { progress?: number; workerId?: string }
  ): SwarmSubTask | null {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.status = status;
    if (status === 'running' && !task.startedAt) {
      task.startedAt = Date.now();
    }
    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      task.completedAt = Date.now();
    }
    if (output !== undefined) {
      task.output = output;
    }
    if (error !== undefined) {
      task.error = error;
    }
    if (extra?.progress !== undefined) {
      task.progress = extra.progress;
    }
    if (extra?.workerId) {
      task.workerId = extra.workerId;
    }

    this.state.updatedAt = Date.now();
    this.broadcast();
    return task;
  }

  // ==========================================
  // Elastic Worker Pool Management Methods
  // ==========================================

  public spawnWorker(params: {
    name: string;
    role: SwarmAgentRole;
    taskTitle: string;
    parentId?: string;
  }): SwarmWorkerAgent {
    const workerIndex = this.state.workers.length + 1;
    const worker: SwarmWorkerAgent = {
      id: `worker-${Date.now()}-${workerIndex}`,
      name: params.name,
      role: params.role,
      workerIndex,
      taskTitle: params.taskTitle,
      progress: 0,
      status: 'idle',
      tokenCount: 0,
      durationMs: 0,
      startedAt: Date.now(),
      parentId: params.parentId
    };

    this.state.workers.push(worker);
    this.state.workerPoolMetrics.totalSpawned++;
    this.state.updatedAt = Date.now();

    this.postMessage({
      fromRole: 'architect',
      toRole: 'all',
      type: 'system_notice',
      content: `⚡ [Worker Pool 弹性孵化] 动态孵化子智能体 ${worker.name} (Role: ${worker.role}) 处理: ${worker.taskTitle}`,
      workerId: worker.id
    });

    this.broadcast();
    return worker;
  }

  public updateWorkerProgress(
    workerId: string,
    progress: number,
    status: SwarmWorkerAgent['status'],
    details?: { tokenDelta?: number; error?: string }
  ): void {
    const worker = this.state.workers.find(w => w.id === workerId);
    if (!worker) return;

    worker.progress = Math.min(100, Math.max(0, progress));
    worker.status = status;
    if (worker.startedAt) {
      worker.durationMs = Date.now() - worker.startedAt;
    }
    if (details?.tokenDelta) {
      worker.tokenCount += details.tokenDelta;
      this.state.workerPoolMetrics.totalTokens += details.tokenDelta;
    }
    if (details?.error) {
      worker.error = details.error;
    }

    // Refresh active concurrency
    this.state.workerPoolMetrics.activeConcurrency = this.state.workers.filter(w => w.status === 'running').length;
    this.state.updatedAt = Date.now();
    this.broadcast();
  }

  public completeWorker(workerId: string, output: string, tokenCount = 0): void {
    const worker = this.state.workers.find(w => w.id === workerId);
    if (!worker) return;

    worker.progress = 100;
    worker.status = 'completed';
    worker.completedAt = Date.now();
    if (worker.startedAt) {
      worker.durationMs = worker.completedAt - worker.startedAt;
      this.state.workerPoolMetrics.totalDurationMs += worker.durationMs;
    }
    worker.output = output;
    if (tokenCount > 0) {
      worker.tokenCount += tokenCount;
      this.state.workerPoolMetrics.totalTokens += tokenCount;
    }

    this.state.workerPoolMetrics.completedWorkers++;
    this.state.workerPoolMetrics.activeConcurrency = this.state.workers.filter(w => w.status === 'running').length;
    this.state.updatedAt = Date.now();

    this.postMessage({
      fromRole: worker.name,
      toRole: 'architect',
      type: 'task_result',
      content: `✅ [Worker 交付] 子智能体 ${worker.name} 完成任务交付 (耗时: ${(worker.durationMs / 1000).toFixed(1)}s)`,
      workerId: worker.id
    });

    this.broadcast();
  }

  public failWorker(workerId: string, error: string): void {
    const worker = this.state.workers.find(w => w.id === workerId);
    if (!worker) return;

    worker.status = 'failed';
    worker.completedAt = Date.now();
    if (worker.startedAt) {
      worker.durationMs = worker.completedAt - worker.startedAt;
      this.state.workerPoolMetrics.totalDurationMs += worker.durationMs;
    }
    worker.error = error;

    this.state.workerPoolMetrics.failedWorkers++;
    this.state.workerPoolMetrics.activeConcurrency = this.state.workers.filter(w => w.status === 'running').length;
    this.state.updatedAt = Date.now();

    this.postMessage({
      fromRole: worker.name,
      toRole: 'architect',
      type: 'issue_report',
      content: `❌ [Worker 异常] 子智能体 ${worker.name} 执行失败: ${error}`,
      workerId: worker.id
    });

    this.broadcast();
  }

  public setMaxConcurrency(max: number): void {
    this.state.workerPoolMetrics.maxConcurrency = Math.max(1, max);
    this.state.updatedAt = Date.now();
    this.broadcast();
  }

  public postMessage(msgData: Omit<SwarmBusMessage, 'id' | 'timestamp'>): SwarmBusMessage {
    const message: SwarmBusMessage = {
      ...msgData,
      id: `smsg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now()
    };
    this.state.messages.push(message);
    this.state.updatedAt = Date.now();

    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch (err) {
        console.error('[SwarmMessageBus] Error in message listener:', err);
      }
    }

    this.broadcast();
    return message;
  }

  public setSummary(summary: string) {
    this.state.summary = summary;
    this.state.phase = 'completed';
    this.state.updatedAt = Date.now();
    this.broadcast();
  }

  private broadcast() {
    const clone = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(clone);
      } catch (err) {
        console.error('[SwarmMessageBus] Error in state listener:', err);
      }
    }
  }
}
