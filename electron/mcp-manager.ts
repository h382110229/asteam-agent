import { exec } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getGitStatus, getFileDiff } from './git-manager';
import { searchWeb, fetchWebPage } from './web-search';

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
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'connecting' | 'error' | 'disconnected';
  transportType: 'stdio' | 'sse';
  tools: DiscoveredMcpTool[];
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
  error?: string;
  lastConnectedAt?: number;
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
      tools: []
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
        transport = new StdioClientTransport({
          command: resolvedCmd,
          args: config.args || [],
          env: {
            ...process.env as Record<string, string>,
            ...(config.env || {})
          },
          cwd: resolvedCwd,
          stderr: 'pipe'
        });
      } else {
        throw new Error(`MCP Server '${name}' 配置无效: 缺少 command 或 url`);
      }

      const client = new Client(
        {
          name: 'asteam-agent',
          version: '1.5.0'
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
        parameters: t.inputSchema?.properties || t.inputSchema || {}
      }));

      session.tools = discoveredTools;
      session.status = 'connected';
      session.lastConnectedAt = Date.now();
      session.error = undefined;
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
  }

  /**
   * Reload all servers from JSON configuration string
   */
  async reloadServers(customMcpConfigJson: string, workspacePath?: string | null): Promise<McpServerStatus[]> {
    let parsedConfig: { mcpServers?: Record<string, McpServerConfig> } = {};
    try {
      parsedConfig = JSON.parse(customMcpConfigJson || '{}');
    } catch (e: any) {
      throw new Error(`MCP 配置 JSON 解析失败: ${e.message}`);
    }

    const targetServers = parsedConfig.mcpServers || {};

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
  async testServer(name: string, config: McpServerConfig, workspacePath?: string | null): Promise<{ success: boolean; tools?: DiscoveredMcpTool[]; error?: string }> {
    let testClient: Client | null = null;
    let testTransport: StdioClientTransport | SSEClientTransport | null = null;

    try {
      if (config.url) {
        testTransport = new SSEClientTransport(new URL(config.url));
      } else if (config.command) {
        const resolvedCmd = resolveWindowsCommand(config.command);
        const resolvedCwd = config.cwd || workspacePath || process.cwd();
        testTransport = new StdioClientTransport({
          command: resolvedCmd,
          args: config.args || [],
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
        { name: 'asteam-agent-tester', version: '1.5.0' },
        { capabilities: {} }
      );

      await testClient.connect(testTransport);
      const toolsResult = await testClient.listTools();
      const discoveredTools: DiscoveredMcpTool[] = (toolsResult.tools || []).map((t: any) => ({
        serverName: name,
        name: t.name,
        fullName: `mcp__${name}__${t.name}`,
        description: t.description || `MCP tool provided by ${name}`,
        parameters: t.inputSchema?.properties || t.inputSchema || {}
      }));

      await testClient.close();
      await testTransport.close();

      return { success: true, tools: discoveredTools };
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
   * Get combined prompts for enabled builtin tools and active external MCP tools
   */
  getEnabledToolPrompts(enabledToolIds: string[] = ['web_search', 'web_fetch', 'git_operations', 'system_inspector']): string {
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
}

export const mcpManager = new McpManager();
