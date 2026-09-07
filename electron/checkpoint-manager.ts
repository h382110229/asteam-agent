import fs from 'node:fs';
import path from 'node:path';
import { storageHub } from './storage-hub';
import { getGitStatus } from './git-manager';

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

export class CheckpointManager {
  private activeSessionCheckpoints = new Map<string, CheckpointItem>();

  /**
   * 获取工作区快照根目录
   * 优先存放在工作区自身的 .asteam/checkpoints，无工作区时回退到数据中枢
   */
  public getCheckpointsBaseDir(workspacePath: string | null): string {
    if (workspacePath && fs.existsSync(workspacePath)) {
      const dir = path.join(workspacePath, '.asteam', 'checkpoints');
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch {}
      }
      return dir;
    }

    const fallbackDir = path.join(storageHub.getDataRootDir(), 'checkpoints');
    if (!fs.existsSync(fallbackDir)) {
      try {
        fs.mkdirSync(fallbackDir, { recursive: true });
      } catch {}
    }
    return fallbackDir;
  }

  /**
   * 获取或初始化快照元数据列表
   */
  private loadCheckpointsIndex(baseDir: string): CheckpointItem[] {
    const indexPath = path.join(baseDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const raw = fs.readFileSync(indexPath, 'utf-8');
        return JSON.parse(raw);
      } catch {}
    }
    return [];
  }

  /**
   * 持久化保存快照元数据列表
   */
  private saveCheckpointsIndex(baseDir: string, list: CheckpointItem[]) {
    const indexPath = path.join(baseDir, 'index.json');
    try {
      fs.writeFileSync(indexPath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CheckpointManager] Failed to save index:', e);
    }
  }

  /**
   * 开启或获取当前任务轮次的快照上下文
   */
  public getOrCreateTurnCheckpoint(
    sessionId: string,
    workspacePath: string,
    turnTitle: string
  ): CheckpointItem {
    const existing = this.activeSessionCheckpoints.get(sessionId);
    if (existing) {
      return existing;
    }

    const baseDir = this.getCheckpointsBaseDir(workspacePath);
    const ckptId = `ckpt-${Date.now()}`;
    const backupDirPath = path.join(baseDir, ckptId);
    if (!fs.existsSync(backupDirPath)) {
      try {
        fs.mkdirSync(backupDirPath, { recursive: true });
      } catch {}
    }

    let isGitRepo = false;
    try {
      isGitRepo = fs.existsSync(path.join(workspacePath, '.git'));
    } catch {}

    const item: CheckpointItem = {
      id: ckptId,
      sessionId,
      workspacePath,
      timestamp: Date.now(),
      title: turnTitle || '代码修改快照',
      modifiedFiles: [],
      newFiles: [],
      isGitRepo,
      backupDirPath,
      rolledBack: false
    };

    this.activeSessionCheckpoints.set(sessionId, item);

    // 存入索引
    const all = this.loadCheckpointsIndex(baseDir);
    all.unshift(item);
    this.saveCheckpointsIndex(baseDir, all);

    return item;
  }

  /**
   * 在 Agent 写入/修改文件前，为目标文件拍摄影子备份
   */
  public recordFileModification(
    sessionId: string,
    workspacePath: string,
    targetFilePath: string
  ): { checkpointId: string; wasNew: boolean } {
    const checkpoint = this.getOrCreateTurnCheckpoint(
      sessionId,
      workspacePath,
      `修改文件: ${path.basename(targetFilePath)}`
    );

    // 相对路径
    const relPath = path.isAbsolute(targetFilePath)
      ? path.relative(workspacePath, targetFilePath)
      : targetFilePath;

    // 检查文件是否已备份过（避免一轮中多次写入导致覆盖备份）
    if (checkpoint.modifiedFiles.includes(relPath) || checkpoint.newFiles.includes(relPath)) {
      return { checkpointId: checkpoint.id, wasNew: checkpoint.newFiles.includes(relPath) };
    }

    const absPath = path.isAbsolute(targetFilePath)
      ? targetFilePath
      : path.join(workspacePath, targetFilePath);

    const backupDest = path.join(checkpoint.backupDirPath, relPath);
    const backupSubdir = path.dirname(backupDest);

    if (fs.existsSync(absPath)) {
      // 原文件存在：完整物理备份
      if (!fs.existsSync(backupSubdir)) {
        try {
          fs.mkdirSync(backupSubdir, { recursive: true });
        } catch {}
      }
      fs.copyFileSync(absPath, backupDest);
      checkpoint.modifiedFiles.push(relPath);

      // 更新索引
      const baseDir = this.getCheckpointsBaseDir(workspacePath);
      const all = this.loadCheckpointsIndex(baseDir);
      const idx = all.findIndex(c => c.id === checkpoint.id);
      if (idx >= 0) {
        all[idx] = checkpoint;
        this.saveCheckpointsIndex(baseDir, all);
      }

      return { checkpointId: checkpoint.id, wasNew: false };
    } else {
      // 原文件不存在：标记为新生成的文件，回滚时将被自动移除
      checkpoint.newFiles.push(relPath);

      const baseDir = this.getCheckpointsBaseDir(workspacePath);
      const all = this.loadCheckpointsIndex(baseDir);
      const idx = all.findIndex(c => c.id === checkpoint.id);
      if (idx >= 0) {
        all[idx] = checkpoint;
        this.saveCheckpointsIndex(baseDir, all);
      }

      return { checkpointId: checkpoint.id, wasNew: true };
    }
  }

  /**
   * 结束当前轮次的快照跟踪
   */
  public finishTurnCheckpoint(sessionId: string): CheckpointItem | null {
    const item = this.activeSessionCheckpoints.get(sessionId);
    this.activeSessionCheckpoints.delete(sessionId);
    return item || null;
  }

  /**
   * 查询指定工作区或会话的所有快照点
   */
  public listCheckpoints(workspacePath: string | null, sessionId?: string): CheckpointItem[] {
    const baseDir = this.getCheckpointsBaseDir(workspacePath);
    const all = this.loadCheckpointsIndex(baseDir);
    if (sessionId) {
      return all.filter(c => c.sessionId === sessionId);
    }
    return all;
  }

  /**
   * 一键回滚时光机快照
   */
  public async rollbackCheckpoint(
    checkpointId: string,
    workspacePath: string | null
  ): Promise<{ success: boolean; message: string; restoredFiles: string[]; removedFiles: string[] }> {
    const baseDir = this.getCheckpointsBaseDir(workspacePath);
    const all = this.loadCheckpointsIndex(baseDir);
    const checkpoint = all.find(c => c.id === checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        message: `未找到快照记录 (${checkpointId})`,
        restoredFiles: [],
        removedFiles: []
      };
    }

    const targetWorkspace = checkpoint.workspacePath || workspacePath;
    if (!targetWorkspace || !fs.existsSync(targetWorkspace)) {
      return {
        success: false,
        message: '工作区路径不存在，无法执行回滚',
        restoredFiles: [],
        removedFiles: []
      };
    }

    const restoredFiles: string[] = [];
    const removedFiles: string[] = [];

    try {
      // 1. 恢复修改过的文件
      for (const relPath of checkpoint.modifiedFiles) {
        const backupPath = path.join(checkpoint.backupDirPath, relPath);
        const originalPath = path.join(targetWorkspace, relPath);
        if (fs.existsSync(backupPath)) {
          const parentDir = path.dirname(originalPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          fs.copyFileSync(backupPath, originalPath);
          restoredFiles.push(relPath);
        }
      }

      // 2. 移除新生成的文件
      for (const relPath of checkpoint.newFiles) {
        const originalPath = path.join(targetWorkspace, relPath);
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
          removedFiles.push(relPath);
        }
      }

      // 3. 更新快照状态
      checkpoint.rolledBack = true;
      checkpoint.rolledBackAt = Date.now();
      const idx = all.findIndex(c => c.id === checkpoint.id);
      if (idx >= 0) {
        all[idx] = checkpoint;
        this.saveCheckpointsIndex(baseDir, all);
      }

      const totalCount = restoredFiles.length + removedFiles.length;
      return {
        success: true,
        message: `已成功还原快照 ${checkpointId} (已恢复 ${restoredFiles.length} 个文件，已清理 ${removedFiles.length} 个新增文件)`,
        restoredFiles,
        removedFiles
      };
    } catch (err: any) {
      return {
        success: false,
        message: `回滚失败: ${err.message}`,
        restoredFiles,
        removedFiles
      };
    }
  }
}

export const checkpointManager = new CheckpointManager();
