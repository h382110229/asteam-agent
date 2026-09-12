/**
 * ASTeam Agent - Enterprise Auto-Updater Engine (v1.9.0)
 * 
 * Features:
 * - Semantic version detection & mandatory upgrade gate
 * - Real-time SHA-256 streaming integrity validation (anti-tamper)
 * - Network resilient chunked streaming download with progress & speed calculation
 * - Windows NSIS seamless silent installer invocation & restart
 * - Configurable enterprise update server endpoint & persistent preferences
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import { storageHub } from './storage-hub';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateAsset {
  fileName: string;
  downloadUrl: string;
  fileSize: number;
  sha256: string;
  sha512?: string;
  exists?: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  minSupportedVersion: string;
  isMandatory: boolean;
  releaseDate: string;
  title: string;
  changelog: string[];
  channel: string;
  assets: {
    installer: UpdateAsset;
    portable?: UpdateAsset;
  };
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export interface UpdaterConfig {
  serverUrl: string;
  autoCheck: boolean;
  channel: string;
  lastCheckedAt?: number;
}

export interface UpdateEventPayload {
  type: 'status' | 'progress';
  status?: UpdateStatus;
  updateInfo?: UpdateInfo | null;
  progress?: DownloadProgress;
  error?: string | null;
  downloadedFilePath?: string | null;
}

export class AutoUpdaterManager {
  private static instance: AutoUpdaterManager;
  private status: UpdateStatus = 'idle';
  private currentUpdateInfo: UpdateInfo | null = null;
  private downloadedFilePath: string | null = null;
  private errorMessage: string | null = null;
  private config: UpdaterConfig;
  private configFilePath: string;
  private eventListeners: Set<(payload: UpdateEventPayload) => void> = new Set();
  private activeAbortController: AbortController | null = null;

  private constructor() {
    this.configFilePath = path.join(storageHub.getDataRootDir(), 'updater-config.json');
    this.config = this.loadConfig();
  }

  public static getInstance(): AutoUpdaterManager {
    if (!AutoUpdaterManager.instance) {
      AutoUpdaterManager.instance = new AutoUpdaterManager();
    }
    return AutoUpdaterManager.instance;
  }

  private loadConfig(): UpdaterConfig {
    const defaultConfig: UpdaterConfig = {
      serverUrl: 'https://apphub.ashawk.online',
      autoCheck: true,
      channel: 'stable'
    };

    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...defaultConfig, ...parsed };
      }
    } catch (err) {
      console.warn('[AutoUpdater] Failed to read updater-config.json, using defaults:', err);
    }
    return defaultConfig;
  }

  public saveConfig(newConfig: Partial<UpdaterConfig>): UpdaterConfig {
    this.config = { ...this.config, ...newConfig };
    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AutoUpdater] Failed to save updater-config.json:', err);
    }
    return { ...this.config };
  }

  public getConfig(): UpdaterConfig {
    return { ...this.config };
  }

  public getStatus(): {
    status: UpdateStatus;
    updateInfo: UpdateInfo | null;
    error: string | null;
    downloadedFilePath: string | null;
  } {
    return {
      status: this.status,
      updateInfo: this.currentUpdateInfo,
      error: this.errorMessage,
      downloadedFilePath: this.downloadedFilePath
    };
  }

  public onEvent(listener: (payload: UpdateEventPayload) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private notifyStatus(status: UpdateStatus, error: string | null = null) {
    this.status = status;
    this.errorMessage = error;
    const payload: UpdateEventPayload = {
      type: 'status',
      status,
      updateInfo: this.currentUpdateInfo,
      error,
      downloadedFilePath: this.downloadedFilePath
    };
    this.eventListeners.forEach(fn => fn(payload));
  }

  private notifyProgress(progress: DownloadProgress) {
    const payload: UpdateEventPayload = {
      type: 'progress',
      status: this.status,
      progress
    };
    this.eventListeners.forEach(fn => fn(payload));
  }

  /**
   * Probes the server for any available updates
   */
  public async checkForUpdates(customServerUrl?: string): Promise<UpdateInfo | null> {
    const serverUrl = (customServerUrl || this.config.serverUrl || '').trim().replace(/\/+$/, '');
    if (!serverUrl) {
      this.notifyStatus('error', '未配置有效的企业更新服务器地址');
      return null;
    }

    this.notifyStatus('checking');

    try {
      const currentVersion = app ? app.getVersion() : '1.8.3';
      const checkUrl = `${serverUrl}/api/v1/update/check?current_version=${encodeURIComponent(currentVersion)}&platform=win32&arch=x64&channel=${encodeURIComponent(this.config.channel)}`;

      const response = await this.httpRequest(checkUrl, { timeout: 10000 });
      if (response.statusCode !== 200) {
        throw new Error(`更新服务器响应异常 (HTTP ${response.statusCode})`);
      }

      const parsed = JSON.parse(response.body);
      if (!parsed || !parsed.data) {
        throw new Error('更新服务器返回了无效的数据格式');
      }

      const updateData: UpdateInfo = parsed.data;
      this.currentUpdateInfo = updateData;
      this.config.lastCheckedAt = Date.now();
      this.saveConfig({ lastCheckedAt: this.config.lastCheckedAt });

      if (updateData.hasUpdate) {
        this.notifyStatus('available');
      } else {
        this.notifyStatus('up-to-date');
      }

      return updateData;
    } catch (err: any) {
      const errorMsg = err?.message || '检查更新失败，请检查网络或服务器状态';
      this.notifyStatus('error', errorMsg);
      return null;
    }
  }

  /**
   * Starts downloading the installer binary with progress calculation and SHA-256 verification
   */
  public async startDownload(): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (!this.currentUpdateInfo || !this.currentUpdateInfo.hasUpdate) {
      return { success: false, error: '当前没有可用的更新包' };
    }

    const asset = this.currentUpdateInfo.assets?.installer;
    if (!asset || !asset.downloadUrl) {
      return { success: false, error: '更新包元数据中缺少有效的安装包下载地址' };
    }

    this.notifyStatus('downloading');

    // Resolve full download URL
    let downloadUrl = asset.downloadUrl;
    if (downloadUrl.startsWith('/')) {
      downloadUrl = `${this.config.serverUrl.replace(/\/+$/, '')}${downloadUrl}`;
    }

    const tempDir = path.join(app ? app.getPath('temp') : path.resolve('.temp'), 'asteam-update');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const targetFileName = asset.fileName || `ASTeam-Agent-Setup-${this.currentUpdateInfo.latestVersion}.exe`;
    const targetFilePath = path.join(tempDir, targetFileName);
    const partFilePath = `${targetFilePath}.part`;

    // Housekeeping: clean older downloaded installers in tempDir to save user disk space
    try {
      const existingFiles = fs.readdirSync(tempDir);
      for (const file of existingFiles) {
        if (file !== targetFileName) {
          try { fs.unlinkSync(path.join(tempDir, file)); } catch {}
        }
      }
    } catch {}

    // Clean old partial files
    if (fs.existsSync(partFilePath)) {
      try { fs.unlinkSync(partFilePath); } catch {}
    }

    return new Promise((resolve) => {
      const fileStream = fs.createWriteStream(partFilePath);
      const hashStream = crypto.createHash('sha256');

      let transferredBytes = 0;
      let totalBytes = asset.fileSize || 0;
      let lastTime = Date.now();
      let lastBytes = 0;

      const urlObj = new URL(downloadUrl);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.get(downloadUrl, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          fileStream.close();
          try { fs.unlinkSync(partFilePath); } catch {}
          this.notifyStatus('error', `下载失败: HTTP ${res.statusCode}`);
          return resolve({ success: false, error: `下载失败: HTTP ${res.statusCode}` });
        }

        const serverHeaderSha256 = res.headers['x-checksum-sha256'] as string;
        const contentLength = res.headers['content-length'];
        if (contentLength) {
          totalBytes = parseInt(contentLength, 10);
        }

        res.on('data', (chunk: Buffer) => {
          transferredBytes += chunk.length;
          fileStream.write(chunk);
          hashStream.update(chunk);

          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          if (elapsed >= 0.3 || transferredBytes === totalBytes) {
            const bytesPerSecond = elapsed > 0 ? (transferredBytes - lastBytes) / elapsed : 0;
            const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0;
            lastTime = now;
            lastBytes = transferredBytes;

            this.notifyProgress({
              percent,
              transferredBytes,
              totalBytes,
              bytesPerSecond: Math.round(bytesPerSecond)
            });
          }
        });

        res.on('end', () => {
          fileStream.end(async () => {
            const computedSha256 = hashStream.digest('hex');
            const targetSha256 = asset.sha256 || serverHeaderSha256;

            // SHA-256 Anti-Tamper Verification
            if (targetSha256 && computedSha256.toLowerCase() !== targetSha256.toLowerCase()) {
              try { fs.unlinkSync(partFilePath); } catch {}
              const msg = `安装包 SHA-256 完整性校验失败 (预期: ${targetSha256.slice(0, 8)}..., 实际: ${computedSha256.slice(0, 8)}...)，已丢弃被篡改或损坏的文件`;
              this.notifyStatus('error', msg);
              return resolve({ success: false, error: msg });
            }

            // Move .part to target
            if (fs.existsSync(targetFilePath)) {
              try { fs.unlinkSync(targetFilePath); } catch {}
            }
            fs.renameSync(partFilePath, targetFilePath);

            this.downloadedFilePath = targetFilePath;
            this.notifyStatus('downloaded');
            resolve({ success: true, filePath: targetFilePath });
          });
        });

        res.on('error', (err) => {
          fileStream.close();
          try { fs.unlinkSync(partFilePath); } catch {}
          this.notifyStatus('error', `下载过程异常: ${err.message}`);
          resolve({ success: false, error: err.message });
        });
      });

      req.on('error', (err) => {
        fileStream.close();
        try { fs.unlinkSync(partFilePath); } catch {}
        this.notifyStatus('error', `连接下载服务器失败: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Launches the NSIS installer in silent or normal mode and quits current app
   */
  public installAndRestart(silent = true): { success: boolean; error?: string } {
    if (this.status !== 'downloaded' || !this.downloadedFilePath) {
      return { success: false, error: '安装包尚未下载完成或文件不存在' };
    }

    if (!fs.existsSync(this.downloadedFilePath)) {
      this.notifyStatus('error', '安装包文件不存在，请重新下载');
      return { success: false, error: '安装包文件不存在' };
    }

    this.notifyStatus('installing');

    try {
      const installerPath = this.downloadedFilePath;
      const currentExePath = process.execPath;

      if (process.platform === 'win32') {
        // Native Windows Shell Launcher Daemon:
        // 1. Creates a dedicated temporary batch launcher script (.cmd)
        // 2. Waits 2s for current ASTeam Agent process to gracefully terminate and release file locks
        // 3. Runs NSIS installer silently with /S and waits for file replacement completion
        // 4. Invokes explorer.exe to launch ASTeam Agent into the user's active desktop session with full foreground focus!
        // 5. Self-deletes upon completion without leaving temporary artifacts
        const tempDir = path.dirname(installerPath);
        const launcherScriptPath = path.join(tempDir, `asteam-update-launch-${Date.now()}.cmd`);
        const scriptContent = `@echo off\r\ntimeout /t 2 /nobreak >nul\r\nstart /wait "" "${installerPath}" /S\r\ntimeout /t 1 /nobreak >nul\r\nexplorer.exe "${currentExePath}"\r\n(goto) 2>nul & del "%~f0"\r\n`;

        fs.writeFileSync(launcherScriptPath, scriptContent, 'utf-8');

        const child = spawn('cmd.exe', ['/c', launcherScriptPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
      } else {
        const child = spawn(installerPath, [], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      }

      // Explicitly release single-instance lock BEFORE quitting so new instance starts cleanly
      if (app) {
        try {
          app.releaseSingleInstanceLock();
        } catch {}
      }

      setTimeout(() => {
        if (app) {
          app.quit();
        } else {
          process.exit(0);
        }
      }, 500);

      return { success: true };
    } catch (err: any) {
      this.notifyStatus('error', `启动安装程序失败: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private httpRequest(targetUrl: string, options: { timeout?: number } = {}): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(targetUrl);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.get(targetUrl, { timeout: options.timeout || 10000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 200,
            body: Buffer.concat(chunks).toString('utf-8')
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求服务器超时'));
      });

      req.on('error', reject);
    });
  }
}

export const autoUpdaterManager = AutoUpdaterManager.getInstance();
