import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { storageHub } from './storage-hub';
import {
  EnterpriseExtensionItem,
  EnterpriseExtensionManifest,
  EnterpriseExtensionSecurityManifest,
  EnterpriseHubState,
  ImportExtensionOptions,
  SecurityAuditLevel,
  SecurityPermission
} from './enterprise-hub-types';

const execAsync = promisify(exec);

export class EnterpriseHubManager {
  private static instance: EnterpriseHubManager;
  private stateFilePath: string;
  private state: EnterpriseHubState = {
    extensions: [],
    trustedRegistries: ['https://registry.npmjs.org/'],
    offlineMode: false,
    lastSyncTime: Date.now()
  };

  private constructor() {
    this.stateFilePath = path.join(storageHub.getEnterpriseHubDir(), 'hub-state.json');
    this.loadState();
  }

  public static getInstance(): EnterpriseHubManager {
    if (!EnterpriseHubManager.instance) {
      EnterpriseHubManager.instance = new EnterpriseHubManager();
    }
    return EnterpriseHubManager.instance;
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.extensions)) {
          this.state = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('[EnterpriseHubManager] Failed to load hub-state.json, initializing empty state:', e);
    }
    this.saveState();
  }

  private saveState(): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[EnterpriseHubManager] Failed to save state:', e);
    }
  }

  public getState(): EnterpriseHubState {
    return { ...this.state };
  }

  public getExtensions(): EnterpriseExtensionItem[] {
    return [...this.state.extensions];
  }

  public getExtension(id: string): EnterpriseExtensionItem | undefined {
    return this.state.extensions.find(ext => ext.id === id);
  }

  /**
   * 计算指定文件或目录中核心文件的 SHA-256 哈希值
   */
  public computeSha256(targetPath: string): string {
    const hash = crypto.createHash('sha256');
    if (!fs.existsSync(targetPath)) {
      return '';
    }

    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      const fileBuffer = fs.readFileSync(targetPath);
      hash.update(fileBuffer);
      return hash.digest('hex');
    }

    // 目录扫描：按字典序遍历并散列文件内容
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          hash.update(entry.name);
          const buf = fs.readFileSync(full);
          hash.update(buf);
        }
      }
    };

    walk(targetPath);
    return hash.digest('hex');
  }

  /**
   * 静态安全扫描：分析扩展包的文件内容，检测高危系统调用与网络渗透行为
   */
  public auditSecurity(extDir: string, manifest: EnterpriseExtensionManifest): EnterpriseExtensionSecurityManifest {
    const detectedRisks: string[] = [];
    const requestedPermissions: Set<SecurityPermission> = new Set(manifest.permissions || []);

    const dangerousPatterns: Array<{ regex: RegExp; risk: string; perm?: SecurityPermission }> = [
      { regex: /rmdir\s+[\/\\]s\s+[\/\\]q\s+[c-zC-Z]:\\/i, risk: '检测到格式化/递归清空磁盘驱动器的高危指令' },
      { regex: /rm\s+-rf\s+[\/\\]/i, risk: '检测到递归删除根目录指令 (rm -rf /)' },
      { regex: /format\s+[c-zC-Z]:/i, risk: '检测到格式化系统分区高危命令' },
      { regex: /powershell\s+.*-enc(odedCommand)?/i, risk: '检测到 PowerShell Base64 编码混淆命令执行' },
      { regex: /net\s+user\s+.*\/add/i, risk: '检测到尝试添加系统账户行为' },
      { regex: /(fs\.(unlink|rm|rmdir)|fs\.promises\.(unlink|rm))/i, risk: '存在文件破坏性删除操作', perm: 'fs:write' },
      { regex: /(fs\.(readFile|createReadStream)|fs\.promises\.readFile)/i, risk: '需要文件读取权限', perm: 'fs:read' },
      { regex: /(child_process|execSync|spawnSync|execFile)/i, risk: '包含操作系统子进程命令执行调用', perm: 'shell:exec' },
      { regex: /(fetch\(|https?\.request|axios|socket\.connect)/i, risk: '存在出境网络调用', perm: 'net:outbound' },
      { regex: /(process\.env\[|dotenv)/i, risk: '存在环境密钥与敏感配置探测', perm: 'env:secrets' }
    ];

    const scanFile = (filePath: string) => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const item of dangerousPatterns) {
          if (item.regex.test(content)) {
            if (item.perm) {
              requestedPermissions.add(item.perm);
            }
            if (item.risk && !detectedRisks.includes(item.risk)) {
              detectedRisks.push(item.risk);
            }
          }
        }
      } catch {}
    };

    const walk = (dir: string, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, depth + 1);
          } else if (entry.isFile() && /\.(js|mjs|cjs|ts|py|sh|ps1|bat|cmd|json|md)$/i.test(entry.name)) {
            scanFile(full);
          }
        }
      } catch {}
    };

    walk(extDir);

    const actualHash = this.computeSha256(extDir);
    let signatureVerified = false;

    if (manifest.expectedSha256) {
      signatureVerified = manifest.expectedSha256.toLowerCase() === actualHash.toLowerCase();
    } else {
      // 若无显式指定 expectedSha256，则以初次计算出的哈希为信任基线
      signatureVerified = true;
    }

    let securityLevel: SecurityAuditLevel = 'trusted';
    const hasDanger = detectedRisks.some(r => r.includes('清空') || r.includes('格式化') || r.includes('混淆') || r.includes('添加系统账户'));
    if (hasDanger) {
      securityLevel = 'danger';
    } else if (detectedRisks.length > 2 || requestedPermissions.has('shell:exec')) {
      securityLevel = 'caution';
    }

    return {
      requestedPermissions: Array.from(requestedPermissions),
      detectedRisks,
      securityLevel,
      sha256Hash: actualHash,
      signatureVerified,
      signer: manifest.author || 'Enterprise Internal Provider',
      verifiedAt: Date.now()
    };
  }

  /**
   * 解析扩展目录内的 manifest.json 或 package.json 或 SKILL.md
   */
  public resolveManifest(extDir: string, fallbackId?: string): EnterpriseExtensionManifest {
    const manifestPath = path.join(extDir, 'asteam-extension.json');
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch {}
    }

    const mcpConfigPath = path.join(extDir, 'mcp.json');
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const mcpJson = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        const serverKey = Object.keys(mcpJson.mcpServers || {})[0] || fallbackId || 'enterprise-mcp';
        const srv = mcpJson.mcpServers?.[serverKey] || {};
        return {
          id: serverKey,
          name: serverKey,
          version: '1.0.0',
          description: `企业私有 MCP 服务 (${serverKey})`,
          type: 'mcp_server',
          entry: srv.command,
          args: srv.args,
          env: srv.env,
          permissions: ['shell:exec', 'net:outbound']
        };
      } catch {}
    }

    const pkgPath = path.join(extDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return {
          id: pkg.name || fallbackId || 'enterprise-tool',
          name: pkg.name || 'Enterprise Tool',
          version: pkg.version || '1.0.0',
          description: pkg.description || '企业内部自动化组件',
          type: 'mcp_server',
          author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
          entry: pkg.bin ? (typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0] as string) : 'node',
          permissions: ['shell:exec', 'fs:read']
        };
      } catch {}
    }

    const skillPath = path.join(extDir, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const name = titleMatch ? titleMatch[1].trim() : fallbackId || '企业私有技能';
      return {
        id: fallbackId || 'enterprise-skill',
        name,
        version: '1.0.0',
        description: '企业私有标准化业务技能 (SKILL.md)',
        type: 'skill',
        permissions: ['fs:read']
      };
    }

    // 默认兜底
    const id = fallbackId || `ext_${Date.now()}`;
    return {
      id,
      name: id,
      version: '1.0.0',
      description: '未提供 manifest 的企业扩展组件',
      type: 'mcp_server',
      permissions: ['fs:read']
    };
  }

  /**
   * 一键导入企业私有扩展
   */
  public async importExtension(options: ImportExtensionOptions): Promise<EnterpriseExtensionItem> {
    const hubDir = storageHub.getEnterpriseHubDir();
    const extsDir = path.join(hubDir, 'installed');
    if (!fs.existsSync(extsDir)) {
      fs.mkdirSync(extsDir, { recursive: true });
    }

    const extId = (options.targetId || path.basename(options.sourcePathOrUrl).replace(/\.(zip|tar\.gz|git)$/i, '') || `ext_${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    const targetInstallDir = path.join(extsDir, extId);
    if (fs.existsSync(targetInstallDir)) {
      // 若已存在则更新/覆盖
      try {
        fs.rmSync(targetInstallDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(targetInstallDir, { recursive: true });

    // 1. 根据来源渠道获取文件
    if (options.sourceType === 'zip') {
      await this.extractZip(options.sourcePathOrUrl, targetInstallDir);
    } else if (options.sourceType === 'git') {
      await this.cloneGitRepo(options.sourcePathOrUrl, targetInstallDir, options.branch);
    } else if (options.sourceType === 'npm') {
      await this.fetchNpmPackage(options.sourcePathOrUrl, targetInstallDir, options.npmRegistry);
    } else if (options.sourceType === 'local_dir') {
      this.copyDirectory(options.sourcePathOrUrl, targetInstallDir);
    }

    // 2. 解析 Manifest
    const manifest = this.resolveManifest(targetInstallDir, extId);
    if (options.expectedHash) {
      manifest.expectedSha256 = options.expectedHash;
    }

    // 3. 安全审计与哈希校验
    const security = this.auditSecurity(targetInstallDir, manifest);

    // 4. 构建并保存扩展实例
    const now = Date.now();
    const existingIndex = this.state.extensions.findIndex(e => e.id === extId);
    const item: EnterpriseExtensionItem = {
      id: extId,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      type: manifest.type,
      enabled: security.securityLevel !== 'danger', // 高危默认不自动启用
      sourceType: options.sourceType,
      sourceUri: options.sourcePathOrUrl,
      installDir: targetInstallDir,
      installedAt: existingIndex >= 0 ? this.state.extensions[existingIndex].installedAt : now,
      updatedAt: now,
      security,
      manifest,
      cachedOffline: true
    };

    if (existingIndex >= 0) {
      this.state.extensions[existingIndex] = item;
    } else {
      this.state.extensions.push(item);
    }

    this.state.lastSyncTime = now;
    this.saveState();

    return item;
  }

  /**
   * 解压离线 ZIP 归档包 (兼容 Windows PowerShell Expand-Archive)
   */
  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP 压缩包不存在: ${zipPath}`);
    }

    if (process.platform === 'win32') {
      const psCmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
      await execAsync(psCmd);
    } else {
      await execAsync(`unzip -o "${zipPath}" -d "${destDir}"`);
    }
  }

  /**
   * 克隆企业私有 Git 仓库
   */
  private async cloneGitRepo(repoUrl: string, destDir: string, branch?: string): Promise<void> {
    const branchArg = branch ? `--branch ${branch}` : '';
    const cmd = `git clone --depth 1 ${branchArg} "${repoUrl}" "${destDir}"`;
    await execAsync(cmd);
  }

  /**
   * 从内部 npm 镜像下载安装包
   */
  private async fetchNpmPackage(packageName: string, destDir: string, registry?: string): Promise<void> {
    const regArg = registry ? `--registry=${registry}` : '';
    const tempTarDir = path.join(destDir, '_tmp_pack');
    fs.mkdirSync(tempTarDir, { recursive: true });

    // npm pack 到临时目录
    await execAsync(`npm pack ${packageName} ${regArg}`, { cwd: tempTarDir });

    // 查找生成的 .tgz 文件
    const files = fs.readdirSync(tempTarDir).filter(f => f.endsWith('.tgz'));
    if (files.length === 0) {
      throw new Error(`未能从 npm 下载 ${packageName}`);
    }

    const tgzPath = path.join(tempTarDir, files[0]);
    await execAsync(`tar -xzf "${tgzPath}" -C "${destDir}" --strip-components=1`);

    try {
      fs.rmSync(tempTarDir, { recursive: true, force: true });
    } catch {}
  }

  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(src)) {
      throw new Error(`源目录不存在: ${src}`);
    }
    fs.cpSync(src, dest, { recursive: true });
  }

  /**
   * 切换启用状态
   */
  public toggleExtension(id: string, enabled: boolean): EnterpriseExtensionItem | null {
    const ext = this.state.extensions.find(e => e.id === id);
    if (!ext) return null;
    ext.enabled = enabled;
    ext.updatedAt = Date.now();
    this.saveState();
    return ext;
  }

  /**
   * 卸载企业扩展
   */
  public uninstallExtension(id: string): boolean {
    const idx = this.state.extensions.findIndex(e => e.id === id);
    if (idx === -1) return false;

    const ext = this.state.extensions[idx];
    try {
      if (fs.existsSync(ext.installDir)) {
        fs.rmSync(ext.installDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn(`[EnterpriseHubManager] Failed to remove dir: ${ext.installDir}`, e);
    }

    this.state.extensions.splice(idx, 1);
    this.saveState();
    return true;
  }

  /**
   * 汇总所有已启用的企业级 Skill 提示词
   */
  public getAggregatedEnterpriseSkillPrompts(): string {
    const enabledSkills = this.state.extensions.filter(e => e.type === 'skill' && e.enabled);
    if (enabledSkills.length === 0) return '';

    const parts: string[] = [];
    for (const item of enabledSkills) {
      const skillFile = path.join(item.installDir, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        try {
          const content = fs.readFileSync(skillFile, 'utf-8');
          parts.push(`【企业私有技能：${item.name} (SHA-256: ${item.security.sha256Hash.slice(0, 8)})】\n${content}`);
        } catch {}
      }
    }

    return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
  }

  /**
   * 获取所有启用的企业级 MCP 服务定义，供 McpManager 注入
   */
  public getEnabledEnterpriseMcpServers(): Record<string, any> {
    const result: Record<string, any> = {};
    const enabledServers = this.state.extensions.filter(e => e.type === 'mcp_server' && e.enabled);

    for (const ext of enabledServers) {
      result[`enterprise_${ext.id}`] = {
        command: ext.manifest.entry || 'node',
        args: ext.manifest.args || [],
        env: ext.manifest.env || {},
        cwd: ext.installDir,
        description: `[企业私有 MCP] ${ext.name} (v${ext.version})`
      };
    }

    return result;
  }
}

export const enterpriseHubManager = EnterpriseHubManager.getInstance();
