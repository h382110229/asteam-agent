/**
 * ASTeam Agent - Built-in MCP Preset Ecosystem & Market Definitions
 * 
 * Provides 6 curated, production-ready MCP server presets with visual parameter forms,
 * auto-assembly into standard MCP JSON config, and bidirectional synchronization.
 */

export interface McpPresetField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  placeholder?: string;
  defaultValue: any;
  description?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

export interface McpPresetDefinition {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'database' | 'filesystem' | 'devtools' | 'automation';
  runner: 'npx' | 'uvx';
  packageName: string;
  tags: string[];
  fields: McpPresetField[];
  toServerConfig: (fieldValues: Record<string, any>) => any;
  fromServerConfig: (config: any) => Record<string, any> | null;
}

export const MCP_PRESETS: McpPresetDefinition[] = [
  {
    id: 'filesystem',
    name: '本地文件系统 (Filesystem)',
    subtitle: '@modelcontextprotocol/server-filesystem',
    description: '安全沙箱化读写宿主指定目录文件，支持深度查找、文件监听与批量目录管理。',
    icon: 'FolderOpen',
    category: 'filesystem',
    runner: 'npx',
    packageName: '@modelcontextprotocol/server-filesystem',
    tags: ['官方推荐', '文件IO', '安全沙箱'],
    fields: [
      {
        key: 'allowedDirectories',
        label: '允许访问的目录路径',
        type: 'text',
        placeholder: '. 或者 D:/projects',
        defaultValue: '.',
        description: '限制此 MCP Server 只能访问的本地白名单绝对或相对路径（支持多个以逗号隔开）',
        required: true
      }
    ],
    toServerConfig: (values) => {
      const dirs = (values.allowedDirectories || '.')
        .split(',')
        .map((d: string) => d.trim())
        .filter(Boolean);
      return {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', ...(dirs.length > 0 ? dirs : ['.'])]
      };
    },
    fromServerConfig: (config) => {
      if (!config || !Array.isArray(config.args)) return null;
      const isMatch = config.args.some((arg: string) => arg.includes('server-filesystem'));
      if (!isMatch && config.command !== '@modelcontextprotocol/server-filesystem') return null;
      const pkgIdx = config.args.findIndex((arg: string) => arg.includes('server-filesystem'));
      const dirArgs = pkgIdx >= 0 ? config.args.slice(pkgIdx + 1) : [];
      return {
        allowedDirectories: dirArgs.join(', ') || '.'
      };
    }
  },
  {
    id: 'sqlite',
    name: 'SQLite 嵌入式数据库',
    subtitle: 'mcp-server-sqlite',
    description: '通过 uvx 运行原生 Python SQLite MCP 服务，支持只读或读写 SQL 查询与表结构分析。',
    icon: 'Database',
    category: 'database',
    runner: 'uvx',
    packageName: 'mcp-server-sqlite',
    tags: ['轻量SQL', 'Python生态', '免驱动'],
    fields: [
      {
        key: 'dbPath',
        label: 'SQLite 数据库文件路径',
        type: 'text',
        placeholder: './data.db 或者 C:/db/app.db',
        defaultValue: './data.db',
        description: '待操作的本地 SQLite 数据库文件绝对或相对路径',
        required: true
      }
    ],
    toServerConfig: (values) => ({
      command: 'uvx',
      args: ['mcp-server-sqlite', '--db-path', values.dbPath || './data.db']
    }),
    fromServerConfig: (config) => {
      if (!config || !Array.isArray(config.args)) return null;
      const hasSqlite = config.args.some((a: string) => a.includes('sqlite'));
      if (!hasSqlite) return null;
      const dbIdx = config.args.indexOf('--db-path');
      const dbPath = dbIdx >= 0 && config.args[dbIdx + 1] ? config.args[dbIdx + 1] : './data.db';
      return { dbPath };
    }
  },
  {
    id: 'postgres',
    name: 'PostgreSQL 数据库引擎',
    subtitle: '@modelcontextprotocol/server-postgres',
    description: '直连远程或本地 PostgreSQL 数据库实例，支持表结构透视、SQL 检索与执行。',
    icon: 'HardDrive',
    category: 'database',
    runner: 'npx',
    packageName: '@modelcontextprotocol/server-postgres',
    tags: ['关系数据库', '企业级', 'SQL'],
    fields: [
      {
        key: 'connectionUrl',
        label: 'PostgreSQL 连接串 (Connection URL)',
        type: 'password',
        placeholder: 'postgresql://user:password@localhost:5432/mydb',
        defaultValue: 'postgresql://postgres:postgres@localhost:5432/postgres',
        description: '标准 PostgreSQL 连接 URI (包含协议、凭证、地址及端口)',
        required: true
      }
    ],
    toServerConfig: (values) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', values.connectionUrl || 'postgresql://postgres:postgres@localhost:5432/postgres']
    }),
    fromServerConfig: (config) => {
      if (!config || !Array.isArray(config.args)) return null;
      const isPg = config.args.some((a: string) => a.includes('server-postgres'));
      if (!isPg) return null;
      const pkgIdx = config.args.findIndex((arg: string) => arg.includes('server-postgres'));
      const connStr = pkgIdx >= 0 && config.args[pkgIdx + 1] ? config.args[pkgIdx + 1] : '';
      return { connectionUrl: connStr };
    }
  },
  {
    id: 'github',
    name: 'GitHub 官方平台集成',
    subtitle: '@modelcontextprotocol/server-github',
    description: '一键联动 GitHub 官方 API：跨仓库搜索代码、管理 Issue、审查 Pull Request 及操作分支。',
    icon: 'GitBranch',
    category: 'devtools',
    runner: 'npx',
    packageName: '@modelcontextprotocol/server-github',
    tags: ['官方认证', '版本控制', '代码托管'],
    fields: [
      {
        key: 'personalAccessToken',
        label: 'GitHub Personal Access Token (PAT)',
        type: 'password',
        placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        defaultValue: '',
        description: '具备 repo / read:org 权限的 GitHub 个人访问令牌',
        required: true
      }
    ],
    toServerConfig: (values) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: values.personalAccessToken || ''
      }
    }),
    fromServerConfig: (config) => {
      if (!config || !Array.isArray(config.args)) return null;
      const isGh = config.args.some((a: string) => a.includes('server-github'));
      if (!isGh) return null;
      const token = config.env?.GITHUB_PERSONAL_ACCESS_TOKEN || '';
      return { personalAccessToken: token };
    }
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer 浏览器自动化',
    subtitle: '@modelcontextprotocol/server-puppeteer',
    description: '通过无头 Chrome 驱动网页自动化交互，支持动态 JavaScript 渲染页面抓取与截屏。',
    icon: 'Sparkles',
    category: 'automation',
    runner: 'npx',
    packageName: '@modelcontextprotocol/server-puppeteer',
    tags: ['无头浏览器', '动态抓取', '网页渲染'],
    fields: [
      {
        key: 'headless',
        label: '运行模式',
        type: 'select',
        defaultValue: 'true',
        description: '后台静默执行 (无头) 或弹出真实浏览器窗口',
        options: [
          { label: '后台无头模式 (Headless, 性能最高)', value: 'true' },
          { label: '前台可视化窗口 (有头调试模式)', value: 'false' }
        ],
        required: false
      }
    ],
    toServerConfig: (values) => ({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      env: {
        PUPPETEER_HEADLESS: values.headless || 'true'
      }
    }),
    fromServerConfig: (config) => {
      if (!config || !Array.isArray(config.args)) return null;
      const isPup = config.args.some((a: string) => a.includes('server-puppeteer'));
      if (!isPup) return null;
      return {
        headless: config.env?.PUPPETEER_HEADLESS || 'true'
      };
    }
  },
  {
    id: 'git',
    name: 'Git 本地版本库专攻',
    subtitle: 'mcp-server-git',
    description: '面向本地 Git 仓库的深度交互协议，支持精准 Blame 分析、分支合并、Stash 暂存及历史检索。',
    icon: 'Terminal',
    category: 'devtools',
    runner: 'uvx',
    packageName: 'mcp-server-git',
    tags: ['底层Git', '差异比对', 'Python生态'],
    fields: [
      {
        key: 'repositoryPath',
        label: '目标 Git 仓库路径',
        type: 'text',
        placeholder: '. 或者 D:/workspace/project',
        defaultValue: '.',
        description: '待进行版本控制分析的本地 Git 仓库根目录路径',
        required: true
      }
    ],
    toServerConfig: (values) => ({
      command: 'uvx',
      args: ['mcp-server-git', '--repository', values.repositoryPath || '.']
    }),
    fromServerConfig: (config) => {
      if (!config || !Array.isArray(config.args)) return null;
      const isGit = config.args.some((a: string) => a.includes('mcp-server-git'));
      if (!isGit) return null;
      const repoIdx = config.args.indexOf('--repository');
      const repoPath = repoIdx >= 0 && config.args[repoIdx + 1] ? config.args[repoIdx + 1] : '.';
      return { repositoryPath: repoPath };
    }
  }
];

// Helper utilities for bidirectional sync between customMcpConfig JSON string and Presets

export function parseMcpJson(jsonStr: string): { mcpServers: Record<string, any> } {
  try {
    const parsed = JSON.parse(jsonStr || '{}');
    if (parsed && typeof parsed === 'object') {
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        parsed.mcpServers = {};
      }
      return parsed;
    }
    return { mcpServers: {} };
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Checks if a preset is active in the current customMcpConfig JSON
 */
export function isPresetInstalled(jsonStr: string, presetId: string): boolean {
  const { mcpServers } = parseMcpJson(jsonStr);
  if (mcpServers[presetId]) return true;
  // Also check if any server matches preset definition
  const preset = MCP_PRESETS.find(p => p.id === presetId);
  if (!preset) return false;
  return Object.values(mcpServers).some(cfg => preset.fromServerConfig(cfg) !== null);
}

/**
 * Extracts current field values for a preset from the JSON config, fallback to default values
 */
export function getPresetValues(jsonStr: string, presetId: string): Record<string, any> {
  const preset = MCP_PRESETS.find(p => p.id === presetId);
  if (!preset) return {};

  const defaults: Record<string, any> = {};
  for (const f of preset.fields) {
    defaults[f.key] = f.defaultValue;
  }

  const { mcpServers } = parseMcpJson(jsonStr);
  if (mcpServers[presetId]) {
    const extracted = preset.fromServerConfig(mcpServers[presetId]);
    if (extracted) {
      return { ...defaults, ...extracted };
    }
  }

  // Fallback: check other keys
  for (const cfg of Object.values(mcpServers)) {
    const extracted = preset.fromServerConfig(cfg);
    if (extracted) {
      return { ...defaults, ...extracted };
    }
  }

  return defaults;
}

/**
 * Updates or removes a preset in the JSON config string, preserving non-preset servers
 */
export function applyPresetToConfig(
  jsonStr: string,
  presetId: string,
  enabled: boolean,
  fieldValues: Record<string, any>
): string {
  const base = parseMcpJson(jsonStr);
  const preset = MCP_PRESETS.find(p => p.id === presetId);
  if (!preset) return jsonStr;

  if (enabled) {
    // Generate server config and save to mcpServers[presetId]
    base.mcpServers[presetId] = preset.toServerConfig(fieldValues);
  } else {
    // Delete presetId
    delete base.mcpServers[presetId];
    // Also delete any key that matches this preset
    for (const [k, cfg] of Object.entries(base.mcpServers)) {
      if (preset.fromServerConfig(cfg) !== null) {
        delete base.mcpServers[k];
      }
    }
  }

  return JSON.stringify(base, null, 2);
}
