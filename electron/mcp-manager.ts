import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getGitStatus, getFileDiff } from './git-manager';
import { searchWeb, fetchWebPage } from './web-search';
import { enterpriseHubManager } from './enterprise-hub-manager';
import { storageHub } from './storage-hub';

let NodeDatabaseSync: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sqliteMod = require('node:sqlite');
  NodeDatabaseSync = sqliteMod.DatabaseSync;
} catch {}

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: Record<string, any>, context: { workspacePath: string | null }) => Promise<string>;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  disabled?: boolean;
}

export interface DiscoveredMcpTool {
  serverName: string;
  name: string;
  fullName: string;
  description: string;
  parameters: Record<string, any>;
  inputSchema?: Record<string, any>;
}

export interface DiscoveredMcpPrompt {
  serverName: string;
  name: string;
  fullName: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'connecting' | 'error' | 'disconnected';
  transportType: 'stdio' | 'sse';
  tools: DiscoveredMcpTool[];
  prompts?: DiscoveredMcpPrompt[];
  error?: string;
  lastConnectedAt?: number;
}

interface ServerSession {
  name: string;
  config: McpServerConfig;
  status: 'connected' | 'connecting' | 'error' | 'disconnected';
  client: Client | null;
  transport: StdioClientTransport | SSEClientTransport | null;
  tools: DiscoveredMcpTool[];
  prompts: DiscoveredMcpPrompt[];
  error?: string;
  lastConnectedAt?: number;
  reconnectAttempts?: number;
  reconnectTimer?: any;
}

export function isNpxCommand(cmd: string): boolean {
  if (!cmd) return false;
  const firstToken = cmd.trim().split(/\s+/)[0] || '';
  const base = path.basename(firstToken).toLowerCase().replace(/\.(cmd|exe|bat|ps1)$/, '');
  return base === 'npx';
}

export function validateMcpToolArgs(
  schemaOrTool: Record<string, any> | undefined,
  args: Record<string, any>
): { valid: boolean; error?: string } {
  if (!schemaOrTool) return { valid: true };
  const schema = schemaOrTool.inputSchema ? schemaOrTool.inputSchema : schemaOrTool;

  const required = schema.required;
  if (Array.isArray(required)) {
    for (const reqField of required) {
      if (
        args[reqField] === undefined ||
        args[reqField] === null ||
        (typeof args[reqField] === 'string' && args[reqField].trim() === '')
      ) {
        return {
          valid: false,
          error: `[MCP 参数校验失败]: 缺少必填字段 "${reqField}"，有效 Schema 为:\n${JSON.stringify(schema, null, 2)}\n请根据 Schema 补充必填参数后重新调用。`
        };
      }
    }
  }

  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    for (const [key, propDef] of Object.entries<any>(properties)) {
      if (args[key] !== undefined && args[key] !== null) {
        const val = args[key];
        const expectedType = propDef.type;
        if (expectedType === 'string' && typeof val !== 'string') {
          return {
            valid: false,
            error: `[MCP 参数校验失败]: 字段 "${key}" 类型错误 (应为 string，实为 ${typeof val})，有效 Schema 为:\n${JSON.stringify(schema, null, 2)}\n请修正参数类型后重新调用。`
          };
        }
        if ((expectedType === 'number' || expectedType === 'integer') && (typeof val !== 'number' || isNaN(val))) {
          return {
            valid: false,
            error: `[MCP 参数校验失败]: 字段 "${key}" 类型错误 (应为 number，实为 ${typeof val})，有效 Schema 为:\n${JSON.stringify(schema, null, 2)}\n请修正参数类型后重新调用。`
          };
        }
        if (expectedType === 'boolean' && typeof val !== 'boolean') {
          return {
            valid: false,
            error: `[MCP 参数校验失败]: 字段 "${key}" 类型错误 (应为 boolean，实为 ${typeof val})，有效 Schema 为:\n${JSON.stringify(schema, null, 2)}\n请修正参数类型后重新调用。`
          };
        }
        if (expectedType === 'array' && !Array.isArray(val)) {
          return {
            valid: false,
            error: `[MCP 参数校验失败]: 字段 "${key}" 类型错误 (应为 array，实为 ${typeof val})，有效 Schema 为:\n${JSON.stringify(schema, null, 2)}\n请修正参数类型后重新调用。`
          };
        }
        if (expectedType === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
          return {
            valid: false,
            error: `[MCP 参数校验失败]: 字段 "${key}" 类型错误 (应为 object，实为 ${Array.isArray(val) ? 'array' : typeof val})，有效 Schema 为:\n${JSON.stringify(schema, null, 2)}\n请修正参数类型后重新调用。`
          };
        }
      }
    }
  }

  return { valid: true };
}

export function normalizeNpxArgs(cmd: string, args: string[]): string[] {
  const finalArgs = [...args];
  if (isNpxCommand(cmd)) {
    if (!finalArgs.includes('-y') && !finalArgs.includes('--yes')) {
      finalArgs.unshift('-y');
    }
  }
  return finalArgs;
}

function resolveWindowsCommand(cmd: string): string {
  if (process.platform !== 'win32') return cmd;
  if (/\.(exe|cmd|bat|ps1)$/i.test(cmd)) return cmd;
  const candidates = [`${cmd}.cmd`, `${cmd}.exe`, `${cmd}.bat`];
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const candidate of candidates) {
    for (const dir of pathDirs) {
      const full = path.join(dir, candidate);
      if (fs.existsSync(full)) {
        return full;
      }
    }
  }
  return cmd;
}

class McpManager {
  private builtinTools: Map<string, McpToolDefinition> = new Map();
  private servers: Map<string, ServerSession> = new Map();
  private isInitialized = false;

  constructor() {
    this.registerBuiltinTools();
  }

  isNpxCommand(cmd: string): boolean {
    return isNpxCommand(cmd);
  }

  normalizeNpxArgs(cmd: string, args: string[]): string[] {
    return normalizeNpxArgs(cmd, args);
  }

  validateMcpToolArgs(
    schema: Record<string, any> | undefined,
    args: Record<string, any>
  ): { isValid: boolean; errorMessage?: string; valid: boolean; error?: string } {
    const res = validateMcpToolArgs(schema, args);
    return {
      isValid: res.valid,
      errorMessage: res.error,
      valid: res.valid,
      error: res.error
    };
  }

  private registerBuiltinTools() {
    // 0. web_search (v1.5.0)
    this.builtinTools.set('web_search', {
      name: 'web_search',
      description: '联网技术检索：根据关键词检索官方技术文档、最新库变更、开源仓库或报错解决方案',
      parameters: {
        query: { type: 'string', description: '检索关键词或报错文本（例如 "electron 34 net.fetch", "react 19 useActionState"）' },
        maxResults: { type: 'number', description: '可选，返回条数，默认为 6' }
      },
      handler: async (args) => {
        return await searchWeb(args.query, { maxResults: args.maxResults });
      }
    });

    // 1. web_fetch (Enhanced in v1.5.0)
    this.builtinTools.set('web_fetch', {
      name: 'web_fetch',
      description: '抓取指定网页或在线技术文档的正文内容，并自动转换为结构化 Markdown（保留标题、代码块与链接）',
      parameters: {
        url: { type: 'string', description: '要抓取的网页 HTTP/HTTPS 完整 URL' }
      },
      handler: async (args) => {
        return await fetchWebPage(args.url);
      }
    });

    // 2. git_operations
    this.builtinTools.set('git_operations', {
      name: 'git_operations',
      description: '执行 Git 仓库检测、查看最近提交日志或提取未提交差异',
      parameters: {
        action: { type: 'string', description: '操作类型: status | log | diff' },
        filePath: { type: 'string', description: '可选，特定文件路径' }
      },
      handler: async (args, context) => {
        const { workspacePath } = context;
        if (!workspacePath) return '错误: 未挂载工作区，无法执行 Git 操作。';

        const action = args.action || 'status';
        if (action === 'status') {
          const status = await getGitStatus(workspacePath);
          if (!status.isGitRepo) return '当前工作区不是 Git 仓库。';
          return JSON.stringify(status, null, 2);
        } else if (action === 'diff') {
          return await getFileDiff(workspacePath, args.filePath || '');
        } else if (action === 'log') {
          return new Promise(resolve => {
            exec('git log -n 5 --oneline', { cwd: workspacePath, windowsHide: true }, (err, stdout) => {
              resolve(err ? `无法获取提交日志: ${err.message}` : (stdout || '暂无提交'));
            });
          });
        }
        return `未知 Git 动作: ${action}`;
      }
    });

    // 3. system_inspector
    this.builtinTools.set('system_inspector', {
      name: 'system_inspector',
      description: '检测本地宿主环境（操作系统、Node/npm/Python/Git 版本等系统诊断）',
      parameters: {},
      handler: async () => {
        const info = {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
          freeMemoryGB: Math.round(os.freemem() / (1024 * 1024 * 1024)),
          versions: process.versions
        };
        return JSON.stringify(info, null, 2);
      }
    });

    // 4. sqlite_query (v1.8.2 纯 JS/Node 内置高频工具)
    this.builtinTools.set('sqlite_query', {
      name: 'sqlite_query',
      description: '本地 SQLite 数据库查询与分析（纯 JS/Node 驱动）：支持打开本地 .db/.sqlite 文件或内存库，执行 SELECT/PRAGMA 等 SQL 分析',
      parameters: {
        query: { type: 'string', description: '要执行的 SQL 语句 (如 "SELECT name FROM sqlite_master WHERE type=\'table\'")' },
        dbPath: { type: 'string', description: '可选，本地 SQLite 数据库文件绝对或相对路径，不传默认使用临时内存库 :memory:' },
      },
      handler: async (args, context) => {
        const query = (args.query || args.sql || '').trim();
        if (!query) return '错误: 请提供要执行的 SQL 语句 (query/sql)。';
        const rawDbPath = args.dbPath ? args.dbPath.trim() : ':memory:';
        let resolvedDbPath = rawDbPath;
        if (rawDbPath !== ':memory:') {
          if (!path.isAbsolute(rawDbPath)) {
            const baseDir = context.workspacePath || process.cwd();
            resolvedDbPath = path.resolve(baseDir, rawDbPath);
          }
        }

        try {
          const DatabaseSync = NodeDatabaseSync;

          if (DatabaseSync) {
            const db = new DatabaseSync(resolvedDbPath);
            try {
              const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(query);
              if (isSelect) {
                const stmt = db.prepare(query);
                const rows = args.params && Array.isArray(args.params) ? stmt.all(...args.params) : stmt.all();
                return JSON.stringify({
                  dbPath: resolvedDbPath,
                  rowCount: rows.length,
                  rows
                }, null, 2);
              } else {
                // If query contains multiple statements (semicolon separated), use db.exec
                const statements = query.split(';').map(s => s.trim()).filter(Boolean);
                if (statements.length > 1) {
                  db.exec(query);
                  return JSON.stringify({
                    dbPath: resolvedDbPath,
                    status: 'success',
                    statementsCount: statements.length
                  }, null, 2);
                } else {
                  const stmt = db.prepare(query);
                  const info = args.params && Array.isArray(args.params) ? stmt.run(...args.params) : stmt.run();
                  return JSON.stringify({
                    dbPath: resolvedDbPath,
                    status: 'success',
                    changes: (info as any)?.changes ?? 0,
                    lastInsertRowid: (info as any)?.lastInsertRowid ?? 0
                  }, null, 2);
                }
              }
            } finally {
              try { db.close(); } catch {}
            }
          } else {
            return JSON.stringify({
              dbPath: resolvedDbPath,
              note: '本地宿主运行环境未启用内置 node:sqlite，已完成轻量诊断',
              exists: rawDbPath === ':memory:' ? true : fs.existsSync(resolvedDbPath),
              fileSize: rawDbPath !== ':memory:' && fs.existsSync(resolvedDbPath) ? fs.statSync(resolvedDbPath).size : 0
            }, null, 2);
          }
        } catch (err: any) {
          return `[SQLite 执行失败]: ${err.message || String(err)}`;
        }
      }
    });

    // 5. code_ast_inspector (v1.8.2 纯 JS 源码符号大纲与依赖分析)
    this.builtinTools.set('code_ast_inspector', {
      name: 'code_ast_inspector',
      description: '纯 JS 代码结构与语法树符号提取器：免外部重型环境提取 JS/TS/Python/Go/Java 等代码的大纲、函数、类、接口、导入与复杂度概览',
      parameters: {
        filePath: { type: 'string', description: '代码文件相对或绝对路径' },
        extractMode: { type: 'string', description: '提取模式: outline (类/函数/接口大纲, 默认) | imports (依赖引用) | metrics (行数与复杂度)' }
      },
      handler: async (args, context) => {
        const rawPath = (args.filePath || '').trim();
        if (!rawPath) return '错误: 请提供要分析的代码文件路径 (filePath)。';
        let resolved = rawPath;
        if (!path.isAbsolute(rawPath)) {
          const base = context.workspacePath || process.cwd();
          resolved = path.resolve(base, rawPath);
        }
        if (!fs.existsSync(resolved)) {
          return `错误: 目标文件不存在: ${resolved}`;
        }

        try {
          const content = fs.readFileSync(resolved, 'utf-8');
          const ext = path.extname(resolved).toLowerCase();
          const mode = args.extractMode || 'outline';
          const lines = content.split(/\r?\n/);
          const totalLines = lines.length;
          const commentLines = lines.filter(l => /^\s*(\/\/|\/\*|\*|#|--)/.test(l)).length;
          const blankLines = lines.filter(l => l.trim().length === 0).length;
          const codeLines = totalLines - commentLines - blankLines;

          const importStatements: string[] = [];
          for (const line of lines) {
            if (/^\s*(import\s+|export\s+.*from|const\s+.*=\s*require\(|from\s+.*import|package\s+|use\s+)/.test(line)) {
              importStatements.push(line.trim());
            }
          }

          const symbols: Array<{ type: string; name: string; line: number }> = [];
          lines.forEach((line, idx) => {
            const lineNum = idx + 1;
            let m = line.match(/(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/);
            if (m) {
              symbols.push({ type: 'class', name: m[1], line: lineNum });
              return;
            }
            m = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
            if (m) {
              symbols.push({ type: 'interface', name: m[1], line: lineNum });
              return;
            }
            m = line.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
            if (m) {
              symbols.push({ type: 'type', name: m[1], line: lineNum });
              return;
            }
            m = line.match(/(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)?\s*\(/);
            if (m) {
              symbols.push({ type: 'function', name: m[1] || 'anonymous', line: lineNum });
              return;
            }
            m = line.match(/(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/);
            if (m) {
              symbols.push({ type: 'arrow_function', name: m[1], line: lineNum });
              return;
            }
            m = line.match(/^\s*(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
            if (m) {
              symbols.push({ type: 'python_def', name: m[1], line: lineNum });
              return;
            }
            m = line.match(/^\s*class\s+([a-zA-Z0-9_]+)(?:\([^)]*\))?:/);
            if (m) {
              symbols.push({ type: 'python_class', name: m[1], line: lineNum });
              return;
            }
            m = line.match(/^func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
            if (m) {
              symbols.push({ type: 'go_func', name: m[1], line: lineNum });
              return;
            }
          });

          let branchingKeywords = 0;
          for (const line of lines) {
            const matches = line.match(/\b(if|else\s+if|for|while|case|catch)\b|(&&|\|\||\?)/g);
            if (matches) branchingKeywords += matches.length;
          }

          const functions = symbols.filter(s => s.type === 'function' || s.type === 'arrow_function' || s.type === 'python_def' || s.type === 'go_func');
          const classes = symbols.filter(s => s.type === 'class' || s.type === 'python_class');
          const interfaces = symbols.filter(s => s.type === 'interface');

          if (mode === 'imports') {
            return JSON.stringify({
              filePath: resolved,
              extension: ext,
              totalImports: importStatements.length,
              imports: importStatements
            }, null, 2);
          } else if (mode === 'metrics') {
            return JSON.stringify({
              filePath: resolved,
              metrics: {
                totalLines,
                codeLines,
                commentLines,
                blankLines,
                estimatedCyclomaticComplexity: branchingKeywords + 1
              }
            }, null, 2);
          } else {
            return JSON.stringify({
              filePath: resolved,
              extension: ext,
              symbolsCount: symbols.length,
              symbols,
              functions,
              classes,
              interfaces,
              importsCount: importStatements.length,
              metrics: { totalLines, codeLines, commentLines, blankLines }
            }, null, 2);
          }
        } catch (err: any) {
          return `[代码 AST 解析失败]: ${err.message || String(err)}`;
        }
      }
    });

    // 6. port_process_manager (v1.8.2 本地端口占用与进程诊断)
    this.builtinTools.set('port_process_manager', {
      name: 'port_process_manager',
      description: '本地端口占用与系统进程诊断管理工具：快速排查端口侦听（如 3000, 8080 等）、定位关联 PID 及进程信息',
      parameters: {
        action: { type: 'string', description: '操作类型: list_listening (列出侦听端口) | check_port / inspect (检查特定端口) | find_process (按PID或名称查找进程)' },
        port: { type: 'number', description: '可选，目标端口号（如 3000, 8080, 5173）' },
        pid: { type: 'number', description: '可选，目标进程 PID' },
        processName: { type: 'string', description: '可选，进程名称过滤关键词' }
      },
      handler: async (args) => {
        const action = args.action || 'list_listening';
        const targetPort = args.port ? Number(args.port) : null;
        const targetPid = args.pid ? Number(args.pid) : null;
        const processNameFilter = (args.processName || '').toLowerCase().trim();

        if (process.platform === 'win32') {
          return new Promise<string>((resolve) => {
            exec('netstat -ano -p tcp', { windowsHide: true }, (err, stdout) => {
              if (err) {
                return resolve(`获取端口信息失败: ${err.message}`);
              }
              const lines = (stdout || '').split(/\r?\n/);
              const entries: Array<{ proto: string; local: string; foreign: string; state: string; port: number; pid: number }> = [];

              for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4 && (parts[0].toUpperCase() === 'TCP' || parts[0].toUpperCase() === 'UDP')) {
                  const proto = parts[0].toUpperCase();
                  const local = parts[1];
                  const foreign = parts[2];
                  const state = parts.length >= 5 ? parts[3] : '';
                  const pid = parseInt(parts[parts.length - 1], 10);
                  const portMatch = local.match(/:(\d+)$/);
                  const port = portMatch ? parseInt(portMatch[1], 10) : 0;

                  if (state === 'LISTENING' || proto === 'UDP') {
                    if (targetPort && port !== targetPort) continue;
                    if (targetPid && pid !== targetPid) continue;
                    entries.push({ proto, local, foreign, state, port, pid });
                  }
                }
              }

              if ((action === 'check_port' || action === 'inspect') && targetPort) {
                return resolve(JSON.stringify({
                  port: targetPort,
                  status: entries.length > 0 ? 'occupied' : 'free',
                  ports: entries,
                  listeningPorts: entries,
                  details: entries
                }, null, 2));
              }

              if (processNameFilter) {
                exec('tasklist /fo csv /nh', { windowsHide: true }, (taskErr, taskStdout) => {
                  const pidMap = new Map<number, string>();
                  if (!taskErr && taskStdout) {
                    for (const tline of taskStdout.split(/\r?\n/)) {
                      const cols = tline.split('","').map(c => c.replace(/^"|"$/g, ''));
                      if (cols.length >= 2) {
                        const pName = cols[0];
                        const pId = parseInt(cols[1], 10);
                        if (!isNaN(pId)) pidMap.set(pId, pName);
                      }
                    }
                  }
                  const enriched = entries
                    .map(e => ({ ...e, processName: pidMap.get(e.pid) || 'unknown' }))
                    .filter(e => e.processName.toLowerCase().includes(processNameFilter));
                  resolve(JSON.stringify({ total: enriched.length, ports: enriched, entries: enriched.slice(0, 50) }, null, 2));
                });
                return;
              }

              return resolve(JSON.stringify({
                total: entries.length,
                ports: entries,
                listeningPorts: entries.slice(0, 40)
              }, null, 2));
            });
          });
        } else {
          return JSON.stringify({ message: '当前非 Windows 平台，建议使用系统 lsof 或 netstat 指令', ports: [], listeningPorts: [] });
        }
      }
    });
  }

  private scheduleReconnect(name: string, config: McpServerConfig, workspacePath?: string | null) {
    const session = this.servers.get(name);
    if (!session || session.status === 'disconnected') return;
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = undefined;
    }
    const attempts = session.reconnectAttempts || 0;
    if (attempts >= 3) {
      session.status = 'error';
      session.error = `多次尝试自动重连失败 (已达最大重试次数 ${attempts})`;
      return;
    }

    session.reconnectAttempts = attempts + 1;
    session.status = 'connecting';
    const delay = Math.min(1000 * Math.pow(2, attempts), 8000);
    console.log(`[McpManager] Scheduling reconnect for '${name}' in ${delay}ms (attempt ${attempts + 1}/3)...`);
    session.reconnectTimer = setTimeout(async () => {
      try {
        await this.connectServer(name, config, workspacePath);
        const reloaded = this.servers.get(name);
        if (reloaded && reloaded.status === 'connected') {
          reloaded.reconnectAttempts = 0;
          console.log(`[McpManager] Server '${name}' auto-reconnected successfully.`);
        }
      } catch (err: any) {
        console.warn(`[McpManager] Reconnect attempt failed for '${name}':`, err.message);
      }
    }, delay);
  }

  /**
   * Connect to a single MCP server
   */
  async connectServer(name: string, config: McpServerConfig, workspacePath?: string | null): Promise<ServerSession> {
    // Disconnect existing if any
    await this.disconnectServer(name);

    const session: ServerSession = {
      name,
      config,
      status: 'connecting',
      client: null,
      transport: null,
      tools: [],
      prompts: []
    };
    this.servers.set(name, session);

    if (config.disabled) {
      session.status = 'disconnected';
      return session;
    }

    try {
      let transport: StdioClientTransport | SSEClientTransport;

      if (config.url) {
        // SSE transport
        transport = new SSEClientTransport(new URL(config.url));
      } else if (config.command) {
        // Stdio transport
        const resolvedCmd = resolveWindowsCommand(config.command);
        const resolvedCwd = config.cwd || workspacePath || process.cwd();

        // P0: Windows npx deadlock immunity
        const rawArgs = config.args || [];
        const finalArgs = [...rawArgs];
        if (isNpxCommand(config.command)) {
          if (!finalArgs.includes('-y') && !finalArgs.includes('--yes')) {
            finalArgs.unshift('-y');
            console.log(`[McpManager] Detected 'npx' command without -y/--yes for '${name}'; auto-injected '-y' to prevent stdio pipe deadlock.`);
          }
        }

        transport = new StdioClientTransport({
          command: resolvedCmd,
          args: finalArgs,
          env: {
            ...process.env as Record<string, string>,
            ...(config.env || {})
          },
          cwd: resolvedCwd,
          stderr: 'pipe'
        });

        // Lifecycle & Resilience monitoring (P4)
        transport.onclose = () => {
          console.warn(`[McpManager] Server '${name}' transport closed.`);
          if (session.status === 'connected') {
            this.scheduleReconnect(name, config, workspacePath);
          }
        };
        transport.onerror = (err: any) => {
          console.warn(`[McpManager] Server '${name}' transport error:`, err);
          if (session.status === 'connected') {
            this.scheduleReconnect(name, config, workspacePath);
          }
        };
        const proc = (transport as any)._process;
        if (proc && typeof proc.on === 'function') {
          proc.on('exit', (code: number, signal: string) => {
            console.warn(`[McpManager] Server '${name}' process exited (code=${code}, signal=${signal}).`);
            if (session.status === 'connected') {
              this.scheduleReconnect(name, config, workspacePath);
            }
          });
        }
      } else {
        throw new Error(`MCP Server '${name}' 配置无效: 缺少 command 或 url`);
      }

      const client = new Client(
        {
          name: 'asteam-agent',
          version: '1.8.2'
        },
        {
          capabilities: {}
        }
      );

      await client.connect(transport);

      session.client = client;
      session.transport = transport;

      // Discover tools
      const toolsResult = await client.listTools();
      const discoveredTools: DiscoveredMcpTool[] = (toolsResult.tools || []).map((t: any) => ({
        serverName: name,
        name: t.name,
        fullName: `mcp__${name}__${t.name}`,
        description: t.description || `MCP tool provided by ${name}`,
        parameters: t.inputSchema?.properties || t.inputSchema || {},
        inputSchema: t.inputSchema || {}
      }));

      // Discover prompts (P3)
      let discoveredPrompts: DiscoveredMcpPrompt[] = [];
      try {
        const promptsResult = await client.listPrompts();
        if (promptsResult && promptsResult.prompts) {
          discoveredPrompts = promptsResult.prompts.map((p: any) => ({
            serverName: name,
            name: p.name,
            fullName: `mcp_prompt__${name}__${p.name}`,
            description: p.description || `MCP prompt provided by ${name}`,
            arguments: p.arguments || []
          }));
        }
      } catch {
        // prompts capability is optional
      }

      session.tools = discoveredTools;
      session.prompts = discoveredPrompts;
      session.status = 'connected';
      session.lastConnectedAt = Date.now();
      session.error = undefined;
      session.reconnectAttempts = 0;
      return session;
    } catch (err: any) {
      session.status = 'error';
      session.error = err.message || String(err);
      session.client = null;
      session.transport = null;
      return session;
    }
  }

  /**
   * Disconnect a single MCP server
   */
  async disconnectServer(name: string): Promise<void> {
    const session = this.servers.get(name);
    if (!session) return;

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = undefined;
    }
    session.reconnectAttempts = 0;

    if (session.client) {
      try {
        await session.client.close();
      } catch {}
    }
    if (session.transport) {
      try {
        await session.transport.close();
      } catch {}
    }

    session.client = null;
    session.transport = null;
    session.status = 'disconnected';
    session.tools = [];
    session.prompts = [];
  }

  /**
   * 读取存储中枢中已保存的 MCP 配置文件 (自闭环目录 D:\ASTeamData\mcp_servers.json)
   */
  getSavedConfigJson(): string {
    const configPath = storageHub.getMcpConfigFilePath();
    if (fs.existsSync(configPath)) {
      try {
        return fs.readFileSync(configPath, 'utf-8');
      } catch (err) {
        console.warn('[McpManager] Failed to read saved MCP config:', err);
      }
    }
    return JSON.stringify({ mcpServers: {} }, null, 2);
  }

  /**
   * Reload all servers from JSON configuration string, and persist to ASTeam closed-loop storage hub
   */
  async reloadServers(customMcpConfigJson?: string, workspacePath?: string | null): Promise<McpServerStatus[]> {
    let effectiveConfigJson = (customMcpConfigJson && customMcpConfigJson.trim()) ? customMcpConfigJson.trim() : '';

    // 若未显式传入配置，尝试从 ASTeam 专属存储中枢 (mcp_servers.json) 自动恢复
    if (!effectiveConfigJson) {
      effectiveConfigJson = this.getSavedConfigJson();
    }

    let parsedConfig: { mcpServers?: Record<string, McpServerConfig> } = {};
    try {
      parsedConfig = JSON.parse(effectiveConfigJson || '{}');
    } catch (e: any) {
      throw new Error(`MCP 配置 JSON 解析失败: ${e.message}`);
    }

    // 自动闭环持久化至 ASTeam 数据根目录 (例如 D:\ASTeamData\mcp_servers.json)，确保配置随数据盘迁移且不污染宿主或外部 Agent
    try {
      const configPath = storageHub.getMcpConfigFilePath();
      const parentDir = path.dirname(configPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(parsedConfig, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[McpManager] Failed to persist MCP config to StorageHub:', err);
    }

    const enterpriseServers = enterpriseHubManager.getEnabledEnterpriseMcpServers();
    const targetServers = { ...enterpriseServers, ...(parsedConfig.mcpServers || {}) };

    // 1. Disconnect servers not in the new config
    for (const [name] of this.servers.entries()) {
      if (!targetServers[name]) {
        await this.disconnectServer(name);
        this.servers.delete(name);
      }
    }

    // 2. Connect or reconnect servers in new config
    for (const [name, cfg] of Object.entries(targetServers)) {
      await this.connectServer(name, cfg, workspacePath);
    }

    this.isInitialized = true;
    return this.getServersStatus();
  }

  /**
   * Test a server configuration without saving it
   */
  async testServer(name: string, config: McpServerConfig, workspacePath?: string | null): Promise<{ success: boolean; tools?: DiscoveredMcpTool[]; prompts?: DiscoveredMcpPrompt[]; error?: string }> {
    let testClient: Client | null = null;
    let testTransport: StdioClientTransport | SSEClientTransport | null = null;

    try {
      if (config.url) {
        testTransport = new SSEClientTransport(new URL(config.url));
      } else if (config.command) {
        const resolvedCmd = resolveWindowsCommand(config.command);
        const resolvedCwd = config.cwd || workspacePath || process.cwd();

        const rawArgs = config.args || [];
        const finalArgs = [...rawArgs];
        if (isNpxCommand(config.command)) {
          if (!finalArgs.includes('-y') && !finalArgs.includes('--yes')) {
            finalArgs.unshift('-y');
          }
        }

        testTransport = new StdioClientTransport({
          command: resolvedCmd,
          args: finalArgs,
          env: {
            ...process.env as Record<string, string>,
            ...(config.env || {})
          },
          cwd: resolvedCwd,
          stderr: 'pipe'
        });
      } else {
        return { success: false, error: '缺少 command 或 url 配置' };
      }

      testClient = new Client(
        { name: 'asteam-agent-tester', version: '1.8.2' },
        { capabilities: {} }
      );

      await testClient.connect(testTransport);
      const toolsResult = await testClient.listTools();
      const discoveredTools: DiscoveredMcpTool[] = (toolsResult.tools || []).map((t: any) => ({
        serverName: name,
        name: t.name,
        fullName: `mcp__${name}__${t.name}`,
        description: t.description || `MCP tool provided by ${name}`,
        parameters: t.inputSchema?.properties || t.inputSchema || {},
        inputSchema: t.inputSchema || {}
      }));

      let discoveredPrompts: DiscoveredMcpPrompt[] = [];
      try {
        const promptsResult = await testClient.listPrompts();
        if (promptsResult && promptsResult.prompts) {
          discoveredPrompts = promptsResult.prompts.map((p: any) => ({
            serverName: name,
            name: p.name,
            fullName: `mcp_prompt__${name}__${p.name}`,
            description: p.description || `MCP prompt provided by ${name}`,
            arguments: p.arguments || []
          }));
        }
      } catch {}

      await testClient.close();
      await testTransport.close();

      return { success: true, tools: discoveredTools, prompts: discoveredPrompts };
    } catch (err: any) {
      if (testClient) {
        try { await testClient.close(); } catch {}
      }
      if (testTransport) {
        try { await testTransport.close(); } catch {}
      }
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Get statuses of all configured servers
   */
  getServersStatus(): McpServerStatus[] {
    const list: McpServerStatus[] = [];
    for (const [name, session] of this.servers.entries()) {
      list.push({
        name,
        status: session.status,
        transportType: session.config.url ? 'sse' : 'stdio',
        tools: session.tools,
        prompts: session.prompts,
        error: session.error,
        lastConnectedAt: session.lastConnectedAt
      });
    }
    return list;
  }

  /**
   * Get all active external MCP tools
   */
  getAllActiveMcpTools(): DiscoveredMcpTool[] {
    const tools: DiscoveredMcpTool[] = [];
    for (const session of this.servers.values()) {
      if (session.status === 'connected') {
        tools.push(...session.tools);
      }
    }
    return tools;
  }

  /**
   * Get all active external MCP prompts (P3)
   */
  getAllActiveMcpPrompts(): DiscoveredMcpPrompt[] {
    const prompts: DiscoveredMcpPrompt[] = [];
    for (const session of this.servers.values()) {
      if (session.status === 'connected' && session.prompts) {
        prompts.push(...session.prompts);
      }
    }
    return prompts;
  }

  /**
   * Fetch rendered prompt from an active MCP server (P3)
   */
  async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<string | null> {
    const session = this.servers.get(serverName);
    if (!session || session.status !== 'connected' || !session.client) {
      return null;
    }
    try {
      const result = await session.client.getPrompt({
        name: promptName,
        arguments: args
      });
      if (!result || !result.messages) return null;
      const parts: string[] = [];
      for (const msg of result.messages) {
        const role = msg.role || 'user';
        const content = typeof msg.content === 'string'
          ? msg.content
          : (msg.content?.text || JSON.stringify(msg.content));
        parts.push(`[${role.toUpperCase()}]: ${content}`);
      }
      return parts.join('\n\n');
    } catch (err: any) {
      return `[MCP 获取 Prompt 失败]: ${err.message || String(err)}`;
    }
  }

  /**
   * Get combined prompts for enabled builtin tools and active external MCP tools
   */
  getEnabledToolPrompts(enabledToolIds: string[] = [
    'web_search',
    'web_fetch',
    'git_operations',
    'system_inspector',
    'sqlite_query',
    'code_ast_inspector',
    'port_process_manager'
  ]): string {
    const list: string[] = [];

    // 1. Builtin tools
    for (const id of enabledToolIds) {
      const tool = this.builtinTools.get(id);
      if (tool) {
        list.push(
          `- \`${tool.name}\`: ${tool.description}\n  调用格式: \`\`\`tool:${tool.name}\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\``
        );
      }
    }

    // 2. External connected MCP tools
    const activeMcpTools = this.getAllActiveMcpTools();
    for (const tool of activeMcpTools) {
      list.push(
        `- \`${tool.fullName}\` (源自 MCP 服务 [${tool.serverName}]): ${tool.description}\n  调用格式: \`\`\`tool:${tool.fullName}\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\``
      );
    }

    return list.join('\n\n');
  }

  /**
   * Execute a tool by name (checks builtins first, then external MCP tools)
   */
  async executeTool(
    name: string,
    args: Record<string, any>,
    context: { workspacePath: string | null }
  ): Promise<string | null> {
    // 1. Check builtin tools
    const builtin = this.builtinTools.get(name);
    if (builtin) {
      return await builtin.handler(args, context);
    }

    // 2. Check external MCP tools
    // Tool name can be namespaced (mcp__serverName__toolName) or plain (toolName)
    let targetServerName: string | null = null;
    let targetToolName: string = name;

    if (name.startsWith('mcp__')) {
      const parts = name.split('__');
      if (parts.length >= 3) {
        targetServerName = parts[1];
        targetToolName = parts.slice(2).join('__');
      }
    }

    for (const [sName, session] of this.servers.entries()) {
      if (session.status !== 'connected' || !session.client) continue;

      if (targetServerName && sName !== targetServerName) continue;

      const matchingTool = session.tools.find(
        t => t.fullName === name || t.name === targetToolName || (!targetServerName && t.name === name)
      );

      if (matchingTool) {
        // P0: MCP Parameter Schema Pre-Validation with Self-Correction Guidance
        const validation = validateMcpToolArgs(matchingTool.inputSchema, args);
        if (!validation.valid) {
          return validation.error || 'MCP 参数校验失败';
        }

        try {
          const result = await session.client.callTool({
            name: matchingTool.name,
            arguments: args
          });

          // Parse result content
          if (!result || !result.content || !Array.isArray(result.content)) {
            return JSON.stringify(result, null, 2);
          }

          const parts: string[] = [];
          for (const item of result.content) {
            if (item.type === 'text') {
              parts.push(item.text);
            } else if (item.type === 'image') {
              parts.push(`[MCP 图片数据: ${item.mimeType}]`);
            } else if (item.type === 'resource') {
              parts.push(`[MCP 嵌入资源: ${JSON.stringify(item.resource)}]`);
            } else {
              parts.push(JSON.stringify(item));
            }
          }

          const textResult = parts.join('\n');
          if (result.isError) {
            return `[MCP 工具执行错误]:\n${textResult}`;
          }
          return textResult;
        } catch (err: any) {
          return `[MCP 工具调用异常]: ${err.message || String(err)}`;
        }
      }
    }

    return null;
  }

  /**
   * Directly execute a builtin tool and parse structured JSON result if available
   */
  async executeBuiltinTool(name: string, args: Record<string, any>, context?: { workspacePath: string | null }): Promise<{ success: boolean; data?: any; message?: string; error?: string }> {
    const raw = await this.executeTool(name, args, context || { workspacePath: null });
    if (raw === null) {
      return { success: false, error: `Tool ${name} not found` };
    }
    if (raw.startsWith('[') && raw.includes('失败]')) {
      return { success: false, error: raw };
    }
    try {
      const parsed = JSON.parse(raw);
      return { success: true, data: parsed, message: raw };
    } catch {
      return { success: true, message: raw, data: raw };
    }
  }
}

export const mcpManager = new McpManager();
