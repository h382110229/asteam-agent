import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ProjectScanInfo {
  name: string;
  path: string;
  drive: string;
  projectType: string;
  indicators: string[];
  sizeMB: number;
  fileCount: number;
  lastModified: string;
  hasGit: boolean;
  notes?: string;
}

export interface FastScanOptions {
  roots?: string[];
  maxDepth?: number;
  includeSystemDrives?: boolean;
  excludeDirs?: string[];
  calculateSize?: boolean;
}

export class FastScanner {
  private readonly defaultExcludeDirs = new Set([
    '$recycle.bin',
    'system volume information',
    'windows',
    'program files',
    'program files (x86)',
    'programdata',
    'perflogs',
    'appdata',
    'local\\temp',
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.idea',
    '.vscode',
    'dist',
    'build',
    'out',
    'target',
    'bin',
    'obj',
    'vendor',
    '__pycache__'
  ]);

  private readonly projectIndicators: Array<{
    pattern: RegExp | string;
    type: string;
    isFile: boolean;
  }> = [
    { pattern: 'package.json', type: 'Node.js/JavaScript', isFile: true },
    { pattern: 'tsconfig.json', type: 'TypeScript', isFile: true },
    { pattern: 'requirements.txt', type: 'Python', isFile: true },
    { pattern: 'pyproject.toml', type: 'Python', isFile: true },
    { pattern: 'setup.py', type: 'Python', isFile: true },
    { pattern: 'Cargo.toml', type: 'Rust', isFile: true },
    { pattern: 'go.mod', type: 'Go', isFile: true },
    { pattern: 'pom.xml', type: 'Java (Maven)', isFile: true },
    { pattern: 'build.gradle', type: 'Java/Kotlin (Gradle)', isFile: true },
    { pattern: 'build.gradle.kts', type: 'Kotlin (Gradle)', isFile: true },
    { pattern: 'CMakeLists.txt', type: 'C/C++ (CMake)', isFile: true },
    { pattern: 'Makefile', type: 'C/C++ (Make)', isFile: true },
    { pattern: /\.csproj$/i, type: '.NET (C#)', isFile: true },
    { pattern: /\.sln$/i, type: '.NET Solution', isFile: true },
    { pattern: 'composer.json', type: 'PHP', isFile: true },
    { pattern: 'Gemfile', type: 'Ruby', isFile: true },
    { pattern: '.git', type: 'Git Repository', isFile: false }
  ];

  /**
   * 自动探测 Windows 下可用的物理盘符 (C:, D:, E:, etc.)
   */
  public detectAvailableDrives(): string[] {
    if (process.platform !== 'win32') {
      return ['/'];
    }

    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const available: string[] = [];
    for (const letter of letters) {
      const driveRoot = `${letter}:\\`;
      try {
        if (fs.existsSync(driveRoot)) {
          // 确认能够正常读取
          fs.readdirSync(driveRoot);
          available.push(driveRoot);
        }
      } catch {}
    }
    return available.length > 0 ? available : ['C:\\'];
  }

  /**
   * 快速扫描指定根目录下的所有开发工程
   */
  public async scanProjects(options: FastScanOptions = {}): Promise<ProjectScanInfo[]> {
    const roots = options.roots && options.roots.length > 0
      ? options.roots
      : this.detectAvailableDrives();

    const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 4;
    const customExcludes = new Set(
      (options.excludeDirs || []).map(d => d.toLowerCase())
    );

    const foundProjects: ProjectScanInfo[] = [];
    const seenPaths = new Set<string>();

    for (const root of roots) {
      try {
        if (!fs.existsSync(root)) continue;
        await this.traverseDir(root, 0, maxDepth, customExcludes, foundProjects, seenPaths, options.calculateSize ?? true);
      } catch (err) {
        console.warn(`[FastScanner] Failed to scan root ${root}:`, err);
      }
    }

    // 按大小降序排序
    return foundProjects.sort((a, b) => b.sizeMB - a.sizeMB);
  }

  private async traverseDir(
    currentDir: string,
    currentDepth: number,
    maxDepth: number,
    customExcludes: Set<string>,
    results: ProjectScanInfo[],
    seenPaths: Set<string>,
    calculateSize: boolean
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      // 无法访问（权限受限或被占用），平滑跳过
      return;
    }

    const files: string[] = [];
    const subDirs: string[] = [];

    for (const entry of entries) {
      const name = entry.name;
      const lowerName = name.toLowerCase();

      if (this.defaultExcludeDirs.has(lowerName) || customExcludes.has(lowerName)) {
        continue;
      }

      if (entry.isDirectory()) {
        subDirs.push(name);
      } else if (entry.isFile()) {
        files.push(name);
      }
    }

    // 检查当前目录是否匹配为开发工程
    const detectedIndicators: string[] = [];
    let detectedType = 'Unknown';
    let hasGit = false;

    // 先检查是否含有 .git 目录
    if (subDirs.includes('.git') || fs.existsSync(path.join(currentDir, '.git'))) {
      hasGit = true;
      detectedIndicators.push('.git');
    }

    for (const ind of this.projectIndicators) {
      if (ind.isFile) {
        if (typeof ind.pattern === 'string') {
          if (files.includes(ind.pattern)) {
            detectedIndicators.push(ind.pattern);
            if (detectedType === 'Unknown') detectedType = ind.type;
          }
        } else if (ind.pattern instanceof RegExp) {
          const matched = files.find(f => (ind.pattern as RegExp).test(f));
          if (matched) {
            detectedIndicators.push(matched);
            if (detectedType === 'Unknown') detectedType = ind.type;
          }
        }
      }
    }

    if (detectedType === 'Unknown' && hasGit) {
      detectedType = 'Git Repository';
    }

    const normalizedPath = path.normalize(currentDir);

    if (detectedIndicators.length > 0 && !seenPaths.has(normalizedPath.toLowerCase())) {
      // 排除根目录本身（如 C:\Users）被识别为单工程的假阳性
      const isSystemUsersRoot = /^[A-Za-z]:\\Users$/i.test(normalizedPath) || normalizedPath === '/Users';
      if (!isSystemUsersRoot) {
        seenPaths.add(normalizedPath.toLowerCase());

        let sizeMB = 0;
        let fileCount = files.length;
        let lastModified = '未知';

        try {
          const stat = fs.statSync(normalizedPath);
          lastModified = new Date(stat.mtimeMs).toISOString().replace('T', ' ').slice(0, 19);
        } catch {}

        if (calculateSize) {
          const sizeStats = this.quickEstimateDirectorySize(normalizedPath);
          sizeMB = sizeStats.sizeMB;
          fileCount = sizeStats.fileCount;
        }

        const drive = process.platform === 'win32'
          ? (normalizedPath.slice(0, 2).toUpperCase() + '\\')
          : '/';

        results.push({
          name: path.basename(normalizedPath) || normalizedPath,
          path: normalizedPath,
          drive,
          projectType: detectedType,
          indicators: detectedIndicators,
          sizeMB,
          fileCount,
          lastModified,
          hasGit
        });

        // 如果已经是工程根目录，除非深度很浅，否则限制再往其深度递归，避免扫入子工程
        if (currentDepth >= 3) {
          return;
        }
      }
    }

    // 递归遍历子目录
    for (const sub of subDirs) {
      const subPath = path.join(currentDir, sub);
      await this.traverseDir(subPath, currentDepth + 1, maxDepth, customExcludes, results, seenPaths, calculateSize);
    }
  }

  /**
   * 浅层快速估算目录大小与文件数（避免无限递归锁死）
   */
  private quickEstimateDirectorySize(dirPath: string, maxItems: number = 2000): { sizeMB: number; fileCount: number } {
    let totalBytes = 0;
    let count = 0;
    const stack = [dirPath];

    while (stack.length > 0 && count < maxItems) {
      const current = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        count++;
        const full = path.join(current, entry.name);
        const lower = entry.name.toLowerCase();

        if (this.defaultExcludeDirs.has(lower)) continue;

        if (entry.isFile()) {
          try {
            const stat = fs.statSync(full);
            totalBytes += stat.size;
          } catch {}
        } else if (entry.isDirectory() && count < maxItems) {
          stack.push(full);
        }
      }
    }

    return {
      sizeMB: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      fileCount: count
    };
  }

  /**
   * 将扫描结果转换为 Markdown 表格格式
   */
  public toMarkdownTable(projects: ProjectScanInfo[]): string {
    if (projects.length === 0) return '未发现匹配的开发工程。';

    const header = '| 盘符 | 项目名称 | 项目类型 | 路径 | 大小(MB) | Git | 特征文件 | 最后修改 |\n|:---:|:---|:---|:---|:---:|:---:|:---|:---|';
    const rows = projects.map(p => {
      const gitStr = p.hasGit ? '✅' : '❌';
      const indStr = p.indicators.slice(0, 3).join(', ');
      return `| ${p.drive} | **${p.name}** | \`${p.projectType}\` | \`${p.path}\` | ${p.sizeMB} | ${gitStr} | ${indStr} | ${p.lastModified} |`;
    });

    return `${header}\n${rows.join('\n')}`;
  }

  /**
   * 将扫描结果转换为 CSV 格式
   */
  public toCsv(projects: ProjectScanInfo[]): string {
    const headers = ['Drive', 'Name', 'Type', 'Path', 'SizeMB', 'FileCount', 'HasGit', 'Indicators', 'LastModified'];
    const lines = [headers.join(',')];

    for (const p of projects) {
      const row = [
        `"${p.drive}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.projectType}"`,
        `"${p.path.replace(/"/g, '""')}"`,
        p.sizeMB,
        p.fileCount,
        p.hasGit ? 'TRUE' : 'FALSE',
        `"${p.indicators.join('; ')}"`,
        `"${p.lastModified}"`
      ];
      lines.push(row.join(','));
    }

    return lines.join('\r\n');
  }
}

export const fastScanner = new FastScanner();
