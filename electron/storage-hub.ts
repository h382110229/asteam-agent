import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';

export interface StorageHubConfig {
  dataRootDir: string;
  customized: boolean;
  lastMigratedAt?: number;
}

export interface StorageSubdirStat {
  name: string;
  subPath: string;
  absolutePath: string;
  fileCount: number;
  totalSize: number; // bytes
}

export interface StorageStats {
  dataRootDir: string;
  isDefaultLocation: boolean;
  totalSize: number;
  subdirs: Record<string, StorageSubdirStat>;
  hasLegacyData: boolean;
  legacyDataStats?: {
    skillsCount: number;
    workspaceFilesCount: number;
  };
}

export class StorageHub {
  private configFilePath: string;
  private currentRootDir: string;

  constructor() {
    this.configFilePath = this.resolveConfigFilePath();
    this.currentRootDir = this.loadInitialRootDir();
    this.ensureDirectoryStructure(this.currentRootDir);
  }

  private resolveConfigFilePath(): string {
    // 优先检查 Windows D:\ASTeamData 或已存在的独立自闭环配置文件
    if (process.platform === 'win32') {
      try {
        const dDriveCfg = path.join('D:\\ASTeamData', 'storage-config.json');
        if (fs.existsSync(dDriveCfg)) {
          return dDriveCfg;
        }
      } catch {}
    }
    try {
      if (app && app.isReady && app.isReady()) {
        return path.join(app.getPath('userData'), 'asteam-storage-config.json');
      }
    } catch {}
    return path.join(os.homedir(), '.asteam', 'storage-config.json');
  }

  /**
   * 自动探测与决定初始数据根目录：
   * 1. 优先读取已存在的非系统盘自闭环配置 (如 D:\ASTeamData\storage-config.json)；
   * 2. 读取用户自定义持久化配置；
   * 3. 若无配置，默认智能首选 Windows 非系统盘（D:\ASTeamData），实现真正的存储与环境自闭环；
   * 4. 若无 D 盘，回退使用本地主目录下的 ASTeamData (彻底避免污染 C:\Users\xxx\.asteam)。
   */
  private loadInitialRootDir(): string {
    // 1. 优先探测 D:\ASTeamData 自闭环配置
    if (process.platform === 'win32') {
      try {
        const dCfg = path.join('D:\\ASTeamData', 'storage-config.json');
        if (fs.existsSync(dCfg)) {
          const raw = fs.readFileSync(dCfg, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed.dataRootDir && typeof parsed.dataRootDir === 'string') {
            return path.normalize(parsed.dataRootDir);
          }
        }
      } catch {}
    }

    // 2. 读取配置中心文件
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsed: StorageHubConfig = JSON.parse(raw);
        if (parsed.dataRootDir && typeof parsed.dataRootDir === 'string') {
          return path.normalize(parsed.dataRootDir);
        }
      }
    } catch (e) {
      console.warn('[StorageHub] Failed to read storage config, using default:', e);
    }

    // 3. 默认智能优选：Windows 探测并优先使用 D 盘，实现自闭环隔离
    if (process.platform === 'win32') {
      try {
        if (fs.existsSync('D:\\')) {
          return 'D:\\ASTeamData';
        }
      } catch {}
    }

    return path.join(os.homedir(), 'ASTeamData');
  }

  /**
   * 确保数据中枢的核心 5 大模块子目录存在
   */
  public ensureDirectoryStructure(rootDir: string) {
    const subdirs = ['workspaces', 'skills', 'memory', 'artifacts', 'logs', 'enterprise_hub'];
    try {
      if (!fs.existsSync(rootDir)) {
        fs.mkdirSync(rootDir, { recursive: true });
      }
      for (const sub of subdirs) {
        const target = path.join(rootDir, sub);
        if (!fs.existsSync(target)) {
          fs.mkdirSync(target, { recursive: true });
        }
      }
    } catch (err) {
      console.error(`[StorageHub] Failed to create directories under ${rootDir}:`, err);
    }
  }

  public getDataRootDir(): string {
    return this.currentRootDir;
  }

  public getEnterpriseHubDir(): string {
    const dir = path.join(this.currentRootDir, 'enterprise_hub');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  }

  public getWorkspacesDir(): string {
    return path.join(this.currentRootDir, 'workspaces');
  }

  public getSkillsDir(): string {
    return path.join(this.currentRootDir, 'skills');
  }

  public getMemoryDir(): string {
    return path.join(this.currentRootDir, 'memory');
  }

  public getArtifactsDir(): string {
    return path.join(this.currentRootDir, 'artifacts');
  }

  public getLogsDir(): string {
    return path.join(this.currentRootDir, 'logs');
  }

  /**
   * 获取 MCP 服务持久化配置文件路径 (存储在中枢根目录下以确保自闭环，与宿主及其他 Agent 隔离)
   */
  public getMcpConfigFilePath(): string {
    return path.join(this.currentRootDir, 'mcp_servers.json');
  }

  /**
   * 动态切换数据根目录并持久化
   */
  public setDataRootDir(newPath: string): { success: boolean; rootDir: string; error?: string } {
    if (!newPath || typeof newPath !== 'string' || !newPath.trim()) {
      return { success: false, rootDir: this.currentRootDir, error: '目录路径不能为空' };
    }
    const normalized = path.normalize(newPath.trim());
    try {
      this.ensureDirectoryStructure(normalized);
      this.currentRootDir = normalized;

      const configDir = path.dirname(this.configFilePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configData: StorageHubConfig = {
        dataRootDir: normalized,
        customized: true,
        lastMigratedAt: Date.now()
      };
      // 1. 持久化到应用级配置
      fs.writeFileSync(this.configFilePath, JSON.stringify(configData, null, 2), 'utf-8');
      // 2. 同时在目标中枢根目录下保存一份自闭环配置，确保数据盘插拔或跨环境迁移自闭环
      const selfContainedConfig = path.join(normalized, 'storage-config.json');
      if (path.normalize(this.configFilePath) !== path.normalize(selfContainedConfig)) {
        try {
          fs.writeFileSync(selfContainedConfig, JSON.stringify(configData, null, 2), 'utf-8');
        } catch {}
      }
      return { success: true, rootDir: normalized };
    } catch (err: any) {
      return { success: false, rootDir: this.currentRootDir, error: err.message || '切换目录失败' };
    }
  }

  /**
   * 递归统计目录大小与文件数量
   */
  private calculateDirStat(dirPath: string): { count: number; size: number } {
    let count = 0;
    let size = 0;
    if (!fs.existsSync(dirPath)) return { count, size };

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          const sub = this.calculateDirStat(full);
          count += sub.count;
          size += sub.size;
        } else if (entry.isFile()) {
          count++;
          try {
            const st = fs.statSync(full);
            size += st.size;
          } catch {}
        }
      }
    } catch {}

    return { count, size };
  }

  /**
   * 获取存储中枢全景统计信息与旧版本数据待迁移侦测
   */
  public getStorageStats(): StorageStats {
    const subdirs: Record<string, StorageSubdirStat> = {};
    const modules = [
      { key: 'workspaces', label: '工作区 (workspaces)' },
      { key: 'skills', label: '全局技能库 (skills)' },
      { key: 'memory', label: '持久记忆与画像 (memory)' },
      { key: 'artifacts', label: '交付制品归档 (artifacts)' },
      { key: 'logs', label: '调度运行日志 (logs)' }
    ];

    let totalSize = 0;
    for (const mod of modules) {
      const dirPath = path.join(this.currentRootDir, mod.key);
      const stat = this.calculateDirStat(dirPath);
      totalSize += stat.size;
      subdirs[mod.key] = {
        name: mod.label,
        subPath: mod.key,
        absolutePath: dirPath,
        fileCount: stat.count,
        totalSize: stat.size
      };
    }

    // 检查旧版本数据 (legacy ~/.asteam and ~/ASTeam-Workspace)
    const legacySkillsDir = path.join(os.homedir(), '.asteam', 'skills');
    const legacyWorkspaceDir = path.join(os.homedir(), 'ASTeam-Workspace');
    let legacySkillsCount = 0;
    let legacyWorkspaceFiles = 0;

    if (fs.existsSync(legacySkillsDir)) {
      try {
        legacySkillsCount = fs.readdirSync(legacySkillsDir).filter(f => f.endsWith('.md')).length;
      } catch {}
    }
    if (fs.existsSync(legacyWorkspaceDir)) {
      try {
        legacyWorkspaceFiles = this.calculateDirStat(legacyWorkspaceDir).count;
      } catch {}
    }

    const hasLegacyData = legacySkillsCount > 0 || legacyWorkspaceFiles > 0;

    return {
      dataRootDir: this.currentRootDir,
      isDefaultLocation: this.currentRootDir.toLowerCase().includes('.asteam') || this.currentRootDir.startsWith(os.homedir()),
      totalSize,
      subdirs,
      hasLegacyData,
      legacyDataStats: hasLegacyData ? {
        skillsCount: legacySkillsCount,
        workspaceFilesCount: legacyWorkspaceFiles
      } : undefined
    };
  }

  /**
   * 一键平滑迁移现有旧数据至新存储根目录
   */
  public async migrateLegacyData(): Promise<{ success: boolean; migratedSkills: number; migratedWorkspaceFiles: number; message: string }> {
    const legacySkillsDir = path.join(os.homedir(), '.asteam', 'skills');
    const legacyWorkspaceDir = path.join(os.homedir(), 'ASTeam-Workspace');

    let migratedSkills = 0;
    let migratedWorkspaceFiles = 0;

    this.ensureDirectoryStructure(this.currentRootDir);
    const targetSkillsDir = this.getSkillsDir();
    const targetWorkspaceDir = this.getWorkspacesDir();

    try {
      // 1. 迁移全局技能
      if (fs.existsSync(legacySkillsDir)) {
        const files = fs.readdirSync(legacySkillsDir);
        for (const f of files) {
          if (f.endsWith('.md')) {
            const src = path.join(legacySkillsDir, f);
            const dst = path.join(targetSkillsDir, f);
            if (!fs.existsSync(dst)) {
              fs.copyFileSync(src, dst);
              migratedSkills++;
            }
          }
        }
      }

      // 2. 迁移旧工作区文件
      if (fs.existsSync(legacyWorkspaceDir)) {
        const copyRecursive = (srcDir: string, destDir: string) => {
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          const entries = fs.readdirSync(srcDir, { withFileTypes: true });
          for (const ent of entries) {
            const srcPath = path.join(srcDir, ent.name);
            const dstPath = path.join(destDir, ent.name);
            if (ent.isDirectory()) {
              copyRecursive(srcPath, dstPath);
            } else if (ent.isFile()) {
              if (!fs.existsSync(dstPath)) {
                fs.copyFileSync(srcPath, dstPath);
                migratedWorkspaceFiles++;
              }
            }
          }
        };
        copyRecursive(legacyWorkspaceDir, targetWorkspaceDir);
      }

      return {
        success: true,
        migratedSkills,
        migratedWorkspaceFiles,
        message: `成功迁移 ${migratedSkills} 项技能和 ${migratedWorkspaceFiles} 个工作区文件到新中枢目录！`
      };
    } catch (err: any) {
      return {
        success: false,
        migratedSkills,
        migratedWorkspaceFiles,
        message: `数据平滑迁移过程发生错误: ${err.message}`
      };
    }
  }
}

export const storageHub = new StorageHub();
