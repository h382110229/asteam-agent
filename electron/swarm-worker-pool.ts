import { SwarmMessageBus } from './swarm-bus';
import { SwarmAgentRole, SwarmSubTask, SwarmWorkerAgent } from './swarm-types';

export interface WorkerTaskJob {
  task: SwarmSubTask;
  workerName: string;
  executor: (
    worker: SwarmWorkerAgent,
    updateProgress: (progress: number, status: SwarmWorkerAgent['status'], details?: { tokenDelta?: number; error?: string }) => void
  ) => Promise<string>;
}

export interface WorkerPoolExecutionResult {
  taskId: string;
  workerId: string;
  workerName: string;
  role: SwarmAgentRole;
  title: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  tokens: number;
}

export interface MapReduceSummary {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalDurationMs: number;
  totalTokens: number;
  outputsByRole: Record<SwarmAgentRole, string[]>;
  consolidatedMarkdown: string;
}

export class ElasticWorkerPool {
  private bus: SwarmMessageBus;
  private maxConcurrency: number;
  private defaultTimeoutMs: number;
  private activeJobsCount = 0;

  constructor(bus: SwarmMessageBus, maxConcurrency = 3, defaultTimeoutMs = 180000) {
    this.bus = bus;
    this.maxConcurrency = maxConcurrency;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.bus.setMaxConcurrency(maxConcurrency);
  }

  public setConcurrency(limit: number) {
    this.maxConcurrency = Math.max(1, limit);
    this.bus.setMaxConcurrency(this.maxConcurrency);
  }

  /**
   * 弹性并发运行一组子任务并实行生命周期与超时看门狗管控
   */
  public async executeJobs(jobs: WorkerTaskJob[]): Promise<WorkerPoolExecutionResult[]> {
    const results: WorkerPoolExecutionResult[] = [];
    const queue = [...jobs];
    const executingPromises: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      if (queue.length === 0) return;
      const job = queue.shift()!;
      this.activeJobsCount++;

      // 1. 动态孵化 Worker 实例
      const worker = this.bus.spawnWorker({
        name: job.workerName,
        role: job.task.role,
        taskTitle: job.task.title,
        parentId: job.task.id
      });

      this.bus.updateTaskStatus(job.task.id, 'running', undefined, undefined, {
        progress: 10,
        workerId: worker.id
      });
      this.bus.updateWorkerProgress(worker.id, 15, 'running');

      const startTime = Date.now();
      let timeoutHandle: NodeJS.Timeout | null = null;

      try {
        // 2. 超时看门狗 Watchdog
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Worker [${job.workerName}] 执行超时 (>${this.defaultTimeoutMs / 1000}s)，被看门狗中断`));
          }, this.defaultTimeoutMs);
        });

        // 3. 执行任务
        const executePromise = job.executor(worker, (progress, status, details) => {
          this.bus.updateWorkerProgress(worker.id, progress, status, details);
          this.bus.updateTaskStatus(job.task.id, 'running', undefined, undefined, { progress });
        });

        const output = await Promise.race([executePromise, timeoutPromise]);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const duration = Date.now() - startTime;
        this.bus.completeWorker(worker.id, output);
        this.bus.updateTaskStatus(job.task.id, 'completed', output, undefined, { progress: 100 });

        results.push({
          taskId: job.task.id,
          workerId: worker.id,
          workerName: job.workerName,
          role: job.task.role,
          title: job.task.title,
          success: true,
          output,
          durationMs: duration,
          tokens: worker.tokenCount
        });
      } catch (err: any) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        const errMsg = err.message || String(err);
        this.bus.failWorker(worker.id, errMsg);
        this.bus.updateTaskStatus(job.task.id, 'failed', undefined, errMsg);

        results.push({
          taskId: job.task.id,
          workerId: worker.id,
          workerName: job.workerName,
          role: job.task.role,
          title: job.task.title,
          success: false,
          output: '',
          error: errMsg,
          durationMs: duration,
          tokens: worker.tokenCount
        });
      } finally {
        this.activeJobsCount--;
        // 驱动队列下一个任务
        if (queue.length > 0) {
          await runNext();
        }
      }
    };

    // 启动初始并发池
    const initialWorkers = Math.min(this.maxConcurrency, jobs.length);
    for (let i = 0; i < initialWorkers; i++) {
      executingPromises.push(runNext());
    }

    await Promise.all(executingPromises);
    return results;
  }

  /**
   * Map-Reduce 结果聚合器：将并行子智能体的分散输出归集为结构化汇总
   */
  public mapReduceResults(results: WorkerPoolExecutionResult[]): MapReduceSummary {
    const outputsByRole: Record<SwarmAgentRole, string[]> = {
      architect: [],
      coder: [],
      tester: [],
      reviewer: []
    };

    let totalTokens = 0;
    let totalDurationMs = 0;
    let successfulTasks = 0;
    let failedTasks = 0;

    for (const r of results) {
      if (r.success) {
        successfulTasks++;
        outputsByRole[r.role].push(`#### [${r.workerName}] ${r.title}\n${r.output}`);
      } else {
        failedTasks++;
        outputsByRole[r.role].push(`#### ⚠️ [${r.workerName}] ${r.title} (执行异常)\n错误原因: ${r.error}`);
      }
      totalTokens += r.tokens;
      totalDurationMs += r.durationMs;
    }

    const mdSections: string[] = [
      `### ⚡ 【Elastic Worker Pool 弹性集群交付汇聚 (Map-Reduce)】`,
      `- **孵化子智能体总数**：${results.length} 个`,
      `- **成功交付**：${successfulTasks} 项 | **异常受阻**：${failedTasks} 项`,
      `- **集群总开销**：Tokens: ${totalTokens} | 累计运行耗时: ${(totalDurationMs / 1000).toFixed(1)}s\n`
    ];

    if (outputsByRole.coder.length > 0) {
      mdSections.push(`### 💻 核心研发成果 (Coder Sub-Agents)\n` + outputsByRole.coder.join('\n\n'));
    }
    if (outputsByRole.tester.length > 0) {
      mdSections.push(`### 🧪 自动化测试验证成果 (Tester Sub-Agents)\n` + outputsByRole.tester.join('\n\n'));
    }
    if (outputsByRole.reviewer.length > 0) {
      mdSections.push(`### 🛡️ 规约与合规审计成果 (Reviewer)\n` + outputsByRole.reviewer.join('\n\n'));
    }

    return {
      totalTasks: results.length,
      successfulTasks,
      failedTasks,
      totalDurationMs,
      totalTokens,
      outputsByRole,
      consolidatedMarkdown: mdSections.join('\n\n')
    };
  }
}
