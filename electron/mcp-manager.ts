import { exec } from 'node:child_process';
import os from 'node:os';
import { getGitStatus, getFileDiff } from './git-manager';

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: Record<string, any>, context: { workspacePath: string | null }) => Promise<string>;
}

class McpManager {
  private tools: Map<string, McpToolDefinition> = new Map();

  constructor() {
    this.registerBuiltinTools();
  }

  private registerBuiltinTools() {
    // 1. web_fetch
    this.tools.set('web_fetch', {
      name: 'web_fetch',
      description: '抓取指定网页或在线文档的内容并提取正文文本',
      parameters: {
        url: { type: 'string', description: '要抓取的网页 HTTP/HTTPS 完整 URL' }
      },
      handler: async (args) => {
        const url = args.url;
        if (!url || typeof url !== 'string') {
          throw new Error('Missing parameter: url');
        }
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ASTeamAgent/1.1' }
          });
          if (!res.ok) {
            return `[HTTP ${res.status}] 无法获取页面内容: ${res.statusText}`;
          }
          const html = await res.text();
          // Simple HTML to readable text / markdown
          const text = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return text.slice(0, 8000) + (text.length > 8000 ? '\n\n[...正文内容已截断...]' : '');
        } catch (err: any) {
          return `抓取失败: ${err.message}`;
        }
      }
    });

    // 2. git_operations
    this.tools.set('git_operations', {
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
    this.tools.set('system_inspector', {
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

  getEnabledToolPrompts(enabledToolIds: string[]): string {
    const list: string[] = [];
    for (const id of enabledToolIds) {
      const tool = this.tools.get(id);
      if (tool) {
        list.push(
          `- \`${tool.name}\`: ${tool.description}\n  参数示例: \`\`\`tool:${tool.name}\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\``
        );
      }
    }
    return list.join('\n\n');
  }

  async executeTool(
    name: string,
    args: Record<string, any>,
    context: { workspacePath: string | null }
  ): Promise<string | null> {
    const tool = this.tools.get(name);
    if (!tool) return null;
    return await tool.handler(args, context);
  }
}

export const mcpManager = new McpManager();
