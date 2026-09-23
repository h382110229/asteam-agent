import { ChildProcess } from 'node:child_process';

export type CommandType = 'user_prompt' | 'steering' | 'abort' | 'system_signal';

export interface CommandItem {
  id: string;
  type: CommandType;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * ASTeam 2.0.0 指令接纳中枢 (CommandInbox)
 * - 移植自 ZCode 的串行确定性指令消费机制
 * - 双通道：平滑协作式插话 (Steering) + 显式硬熔断 (Abort)
 * - 杜绝长任务过程中由于异步事件并发引发的状态死锁
 */
export class CommandInbox {
  private queue: CommandItem[] = [];
  private abortController: AbortController = new AbortController();
  private isAbortedFlag: boolean = false;
  private activeProcesses: Set<ChildProcess> = new Set();

  /**
   * 注册当前运行的子进程，用于在硬打断时精确级联清理
   */
  public registerProcess(proc: ChildProcess): void {
    this.activeProcesses.add(proc);
    proc.on('close', () => {
      this.activeProcesses.delete(proc);
    });
    proc.on('error', () => {
      this.activeProcesses.delete(proc);
    });
  }

  public unregisterProcess(proc: ChildProcess): void {
    this.activeProcesses.delete(proc);
  }

  /**
   * 压入用户协作式引导/插话修正 (Steering Message)
   */
  public enqueueSteering(content: string, metadata?: Record<string, any>): string {
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.queue.push({
      id,
      type: 'steering',
      content: content.trim(),
      timestamp: Date.now(),
      metadata
    });
    return id;
  }

  /**
   * 检查并消费所有待处理的 Steering 指令
   * 多个修正意见将被合并为一段清晰的引导提示
   */
  public consumeSteering(): string | null {
    const steeringItems = this.queue.filter(item => item.type === 'steering');
    if (steeringItems.length === 0) return null;

    // 清理已消费的项目
    this.queue = this.queue.filter(item => item.type !== 'steering');

    return steeringItems
      .map(item => `【用户在执行过程中的实时修正引导】: ${item.content}`)
      .join('\n\n');
  }

  /**
   * 触发显式硬打断 (Hard Abort / Cancel)
   * 1. 触发内部 AbortSignal
   * 2. 终止所有注册的终端子进程树
   * 3. 清空未消费队列
   */
  public triggerAbort(reason: string = '用户取消操作'): void {
    this.isAbortedFlag = true;
    try {
      this.abortController.abort(reason);
    } catch {}

    // 清理子进程树
    for (const proc of this.activeProcesses) {
      try {
        if (!proc.killed) {
          if (process.platform === 'win32' && proc.pid) {
            import('node:child_process').then(cp => {
              cp.spawn('taskkill', ['/pid', proc.pid!.toString(), '/T', '/F']);
            });
          } else {
            proc.kill('SIGKILL');
          }
        }
      } catch {}
    }
    this.activeProcesses.clear();
    this.queue = [];
  }

  public isAborted(): boolean {
    return this.isAbortedFlag;
  }

  public getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * 新轮次或重置时重置 Abort 状态
   */
  public reset(): void {
    this.queue = [];
    this.isAbortedFlag = false;
    this.abortController = new AbortController();
    this.activeProcesses.clear();
  }

  public getPendingCount(): number {
    return this.queue.length;
  }
}
