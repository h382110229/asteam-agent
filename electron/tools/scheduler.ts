import fs from 'node:fs';
import path from 'node:path';
import { ChatToolDefinition, ChatToolCall } from '../gateway/gateway-types';
import { securityFenceManager } from '../security-fence-manager';
import { artifactVerifier } from '../artifact-verifier';
import { inspectImageDetail } from './office/visual-tools';
import { extractOfficeDocumentContent } from '../office-extractor';
import { createWordDocx, createExcelXlsx, createPowerPointPptx } from '../office-generator';
import { exportHtmlToPdf } from '../pdf-generator';
import { fastScanner } from '../fast-scanner';
import { mcpManager } from '../mcp-manager';
import { skillManager } from '../skill-manager';

export interface ToolExecutionContext {
  workspacePath: string;
  isHostMode?: boolean;
  sessionId?: string;
  onTerminalData?: (data: string) => void;
  registerProcess?: (proc: any) => void;
  onThoughtNotice?: (msg: string) => void;
  trackedArtifacts?: Set<string>;
  onQuestion?: (data: {
    questionId: string;
    question: string;
    options?: string[];
    questions?: Array<{ question: string; options?: string[]; multiSelect?: boolean }>;
    multiSelect?: boolean;
  }) => Promise<string>;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  output: string;
  success: boolean;
  error?: string;
}

/**
 * ASTeam 2.0.0 标准化工具调用调度引擎 (ToolScheduler)
 * - 统一 OpenAI Function Calling JSON Schema
 * - 参数自适应纠偏与别名容错
 * - 出境安全围栏 (Security Fence) 前置合规阻断与脱敏
 * - 物理落盘产物跟踪 (Artifact Verifier)
 */
export class ToolScheduler {
  private toolDefinitions: ChatToolDefinition[] = [];

  constructor() {
    this.registerBuiltinToolSchemas();
  }

  /**
   * 注册系统内置全套标准工具 Schema (Coding + Office + Terminal)
   */
  private registerBuiltinToolSchemas(): void {
    this.toolDefinitions = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '读取工作区或本地磁盘中的文件完整文本内容。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: '文件相对路径或绝对路径' }
            },
            required: ['filePath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: '向指定路径写入文件。若父目录不存在将自动递归创建。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: '写入文件的目标路径' },
              content: { type: 'string', description: '写入的完整文件内容' }
            },
            required: ['filePath', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'edit_file_chunk',
          description: '对现有文件实施精准的局部代码或文本块替换。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: '目标文件路径' },
              oldChunk: { type: 'string', description: '原文件中必须精确匹配的目标代码块' },
              newChunk: { type: 'string', description: '用于替换的新代码块' }
            },
            required: ['filePath', 'oldChunk', 'newChunk']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_file',
          description: '安全删除指定路径的文件。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: '待删除的文件路径' }
            },
            required: ['filePath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: '列出指定目录下的子文件与子目录结构。',
          parameters: {
            type: 'object',
            properties: {
              dirPath: { type: 'string', description: '目录相对路径或绝对路径，默认当前工作区' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'fast_scanner',
          description: '极速扫描工程目录文件树，支持按扩展名或关键词检索。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '可选的文件名关键词匹配' },
              extensions: { type: 'array', items: { type: 'string' }, description: '过滤的文件后缀列表，如 [".ts", ".docx"]' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_terminal_command',
          description: '在当前工作区宿主终端中执行 Shell / PowerShell 命令。支持实时流式回显。',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: '待执行的终端命令字符串' },
              timeoutMs: { type: 'number', description: '超时时间(毫秒)，默认 60000' }
            },
            required: ['command']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'extract_office_document',
          description: '脱壳解析 Word/PPT/Excel/PDF 文档，原位提取图文、拓扑图资产清单与全景切片复合画幅。',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Office 或 PDF 文件的本地绝对或相对路径' }
            },
            required: ['filePath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'inspect_image_detail',
          description: '【Level 2 视觉探针】调阅指定拓扑图或架构图的超高分辨率原图，用于深度视觉审图。',
          parameters: {
            type: 'object',
            properties: {
              imagePathOrId: { type: 'string', description: '从资产清单中获取的本地路径或图片标识' },
              maxDimension: { type: 'number', description: '限制最大像素边长(默认 2048)' }
            },
            required: ['imagePathOrId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_office_document',
          description: '使用原生无宿主依赖排版引擎生成专业的 Word (.docx) 或 Excel (.xlsx) 交付报告。',
          parameters: {
            type: 'object',
            properties: {
              docType: { type: 'string', enum: ['word', 'excel', 'powerpoint'], description: '生成的文档类型' },
              outputPath: { type: 'string', description: '输出文件保存路径' },
              title: { type: 'string', description: '文档主标题' },
              sections: { type: 'array', items: { type: 'object' }, description: 'Word 章节内容或 Excel Sheet 数据' }
            },
            required: ['docType', 'outputPath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'export_html_to_pdf',
          description: '使用 Chromium 原生无头打印管道将 HTML 报告渲染导出为高精度 PDF 交付件。',
          parameters: {
            type: 'object',
            properties: {
              htmlContent: { type: 'string', description: '包含排版样式的完整 HTML 字符串' },
              outputPath: { type: 'string', description: '保存的目标 PDF 路径' }
            },
            required: ['htmlContent', 'outputPath']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'ask_question',
          description: '在关键决策、架构选型、多轮审讯 (Grill-me) 或需要用户输入确认时，向用户发起结构化交互式单选/多选卡片并暂停等待用户决策提交。严禁在正文中输出一长串纯文本问题让用户打字，必须优先调用本工具！',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: '向用户提问的主标题或总体问题说明' },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: '单问题模式下的供选选项列表'
              },
              multiSelect: { type: 'boolean', description: '是否允许多选，默认为 false' },
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    question: { type: 'string', description: '子问题题目' },
                    options: { type: 'array', items: { type: 'string' }, description: '该子问题的供选选项' },
                    multiSelect: { type: 'boolean', description: '该子问题是否允许多选' }
                  },
                  required: ['question', 'options']
                },
                description: '多问题矩阵模式（如 Grill-me 模式）：包含一组待用户决策的问题列表'
              }
            },
            required: ['question']
          }
        }
      }
    ];
  }

  /**
   * 获取所有注册的工具定义 (用于下发给模型)
   */
  public getToolDefinitions(enabledMcpTools?: string[]): ChatToolDefinition[] {
    const list = [...this.toolDefinitions];
    // 若开启 MCP 工具则合并
    if (enabledMcpTools && enabledMcpTools.length > 0) {
      const mcpDefs = mcpManager.getRegisteredToolSchemas?.() || [];
      list.push(...mcpDefs.filter((d: any) => enabledMcpTools.includes(d.function.name)));
    }
    return list;
  }

  /**
   * 调度并执行单一工具调用
   */
  public async executeToolCall(
    call: ChatToolCall,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const name = call.function.name;
    let args: Record<string, any> = {};

    try {
      if (typeof call.function.arguments === 'string') {
        args = JSON.parse(call.function.arguments || '{}');
      } else {
        args = call.function.arguments || {};
      }
    } catch (e: any) {
      return {
        toolCallId: call.id,
        toolName: name,
        output: `工具调用参数 JSON 解析失败: ${e.message}。原始参数: ${call.function.arguments}`,
        success: false,
        error: e.message
      };
    }

    // 参数别名智能矫正 (filePath/path, command/cmd, dirPath/dir)
    const filePath = args.filePath || args.path || args.file || '';
    const dirPath = args.dirPath || args.dir || args.directory || '';
    const command = args.command || args.cmd || '';

    try {
      let output = '';

      switch (name) {
        case 'read_file': {
          const resolved = this.resolvePath(filePath, context.workspacePath, context.isHostMode);
          if (!fs.existsSync(resolved)) {
            output = `错误: 文件不存在 -> ${filePath}`;
            break;
          }
          output = fs.readFileSync(resolved, 'utf-8');
          break;
        }

        case 'write_file': {
          const resolved = this.resolvePath(filePath, context.workspacePath, context.isHostMode);
          const dir = path.dirname(resolved);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          // 安全围栏前置合规检测
          const fenceResult = securityFenceManager.inspectAndEnforce(args.content || '', false);
          if (fenceResult.blocked) {
            output = `🛡️ [出境安全围栏拦截] 写入被拒绝: 包含未放行的敏感企业信息 (${fenceResult.blockReason})`;
            break;
          }

          const contentToWrite = securityFenceManager.restoreDeliverableText(fenceResult.sanitizedText || args.content || '');
          fs.writeFileSync(resolved, contentToWrite, 'utf-8');
          context.trackedArtifacts?.add(resolved);
          output = `已成功写入文件: ${resolved} (共 ${contentToWrite.length} 字符)`;
          break;
        }

        case 'edit_file_chunk': {
          const resolved = this.resolvePath(filePath, context.workspacePath, context.isHostMode);
          if (!fs.existsSync(resolved)) {
            output = `错误: 文件不存在 -> ${filePath}`;
            break;
          }
          const content = fs.readFileSync(resolved, 'utf-8');
          const oldChunk = args.oldChunk;
          const newChunk = args.newChunk;

          if (!content.includes(oldChunk)) {
            output = `替换失败: 未能在文件中找到完全匹配的 oldChunk 代码块。请先通过 read_file 核验最新内容。`;
            break;
          }

          const updated = content.replace(oldChunk, newChunk);
          fs.writeFileSync(resolved, updated, 'utf-8');
          context.trackedArtifacts?.add(resolved);
          output = `已成功替换并更新文件: ${resolved}`;
          break;
        }

        case 'delete_file': {
          const resolved = this.resolvePath(filePath, context.workspacePath, context.isHostMode);
          if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
            output = `已安全删除文件: ${resolved}`;
          } else {
            output = `文件不存在或已被删除: ${filePath}`;
          }
          break;
        }

        case 'list_directory': {
          const resolved = this.resolvePath(dirPath || '.', context.workspacePath, context.isHostMode);
          if (!fs.existsSync(resolved)) {
            output = `错误: 目录不存在 -> ${dirPath}`;
            break;
          }
          const entries = fs.readdirSync(resolved, { withFileTypes: true });
          const lines = entries.slice(0, 100).map(e => `${e.isDirectory() ? '[DIR] ' : '[FILE]'} ${e.name}`);
          output = lines.join('\n') || '(空目录)';
          break;
        }

        case 'fast_scanner': {
          const targetDir = context.workspacePath || process.cwd();
          const results = await fastScanner.scanDirectory(targetDir, {
            query: args.query,
            extensions: args.extensions,
            maxResults: 60
          });
          output = `扫描到 ${results.length} 项文件:\n` + results.map((r: any) => r.relativePath).join('\n');
          break;
        }

        case 'run_terminal_command': {
          output = await this.executeTerminal(command, context);
          break;
        }

        case 'extract_office_document': {
          const resolved = this.resolvePath(filePath, context.workspacePath, context.isHostMode);
          if (!fs.existsSync(resolved)) {
            output = `错误: 未找到 Office 文档: ${filePath}`;
            break;
          }
          const buf = fs.readFileSync(resolved);
          const res = await extractOfficeDocumentContent(path.basename(resolved), buf);
          output = res.text;
          break;
        }

        case 'inspect_image_detail': {
          const imgResult = await inspectImageDetail(args.imagePathOrId, {
            maxDimension: args.maxDimension
          });
          output = imgResult.message;
          break;
        }

        case 'generate_office_document': {
          const outPath = this.resolvePath(args.outputPath || args.filePath || '交付报告.xlsx', context.workspacePath, context.isHostMode);
          if (args.docType === 'word') {
            await createWordDocx({
              filePath: outPath,
              title: args.title || '企业级技术方案白皮书',
              subtitle: args.subtitle,
              markdownContent: args.markdownContent || args.content,
              sections: args.sections
            });
          } else if (args.docType === 'excel') {
            // 智能适配：若模型传入 sections、rows、data 或 table，自动适配为 sheets
            let sheets = args.sheets;
            if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
              const rows = args.rows || args.data || (Array.isArray(args.sections) ? args.sections : []);
              sheets = [{
                name: args.title ? args.title.slice(0, 30) : 'Sheet1',
                columns: args.columns,
                rows: rows
              }];
            }
            await createExcelXlsx({
              filePath: outPath,
              title: args.title,
              sheets: sheets,
              markdownContent: args.markdownContent || args.content
            });
          } else {
            await createPowerPointPptx({
              filePath: outPath,
              title: args.title || '商业汇报演示',
              subtitle: args.subtitle,
              slides: args.slides || args.sections || []
            });
          }
          context.trackedArtifacts?.add(outPath);
          output = `已成功生成 Office 交付物: ${outPath}`;
          break;
        }

        case 'export_html_to_pdf': {
          const outPath = this.resolvePath(args.outputPath, context.workspacePath, context.isHostMode);
          await exportHtmlToPdf(args.htmlContent, outPath);
          context.trackedArtifacts?.add(outPath);
          output = `已成功生成高精度 PDF 交付物: ${outPath}`;
          break;
        }

        case 'ask_question': {
          if (!context.onQuestion) {
            output = '当前会话未接入交互式问答通道，请在回复正文中直接向用户说明。';
            break;
          }
          const questionId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const parsedOptions = Array.isArray(args.options) ? args.options : undefined;
          const parsedQuestions = Array.isArray(args.questions) ? args.questions : undefined;
          const isMulti = !!args.multiSelect;
          const mainQuestion = args.question || '请根据需求进行下一步确认';

          output = await context.onQuestion({
            questionId,
            question: mainQuestion,
            options: parsedOptions,
            questions: parsedQuestions,
            multiSelect: isMulti
          });
          break;
        }

        default: {
          // 尝试分发至 MCP 工具
          if (mcpManager.isMcpTool(name)) {
            output = await mcpManager.callTool(name, args);
          } else {
            output = `未知工具: ${name}`;
          }
          break;
        }
      }

      return {
        toolCallId: call.id,
        toolName: name,
        output,
        success: true
      };
    } catch (err: any) {
      return {
        toolCallId: call.id,
        toolName: name,
        output: `工具执行异常: ${err?.message || err}`,
        success: false,
        error: err?.message || String(err)
      };
    }
  }

  private resolvePath(relOrAbs: string, workspacePath: string, isHostMode?: boolean): string {
    if (!relOrAbs || relOrAbs.trim() === '') return workspacePath || process.cwd();
    let target = relOrAbs.trim();
    if (path.isAbsolute(target)) return path.normalize(target);
    return path.resolve(workspacePath || process.cwd(), target);
  }

  private async executeTerminal(command: string, context: ToolExecutionContext): Promise<string> {
    if (!command.trim()) return '终端执行错误: 命令不能为空。';
    const { spawn } = await import('node:child_process');
    const { StringDecoder } = await import('node:string_decoder');

    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const shell = isWin ? 'powershell.exe' : '/bin/bash';
      // 关键修复：强制在 Windows PowerShell 下切换 UTF-8 控制台输入/输出编码，彻底根除中文乱码
      const winCmdPrefix = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; `;
      const args = isWin 
        ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `${winCmdPrefix}${command}`] 
        : ['-c', command];

      let output = '';
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');

      const proc = spawn(shell, args, {
        cwd: context.workspacePath || process.cwd(),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          LANG: 'zh_CN.UTF-8',
          LC_ALL: 'zh_CN.UTF-8'
        }
      });

      context.registerProcess?.(proc);

      const cmdStartTime = Date.now();
      let lastActivity = Date.now();

      // 活动保活检测：长任务（如数据转换管线、打流测试）只要有持续日志输出，自动延长保活时间
      let timer: NodeJS.Timeout;
      const MAX_INACTIVITY_MS = 60000; // 单次无响应超时 60s
      const MAX_TOTAL_RUNTIME_MS = 300000; // 最长单命令总超时 5 分钟

      const scheduleTimeoutCheck = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const now = Date.now();
          const totalElapsed = now - cmdStartTime;
          const inactiveElapsed = now - lastActivity;

          if (totalElapsed >= MAX_TOTAL_RUNTIME_MS || inactiveElapsed >= MAX_INACTIVITY_MS) {
            try {
              if (!proc.killed) {
                proc.kill('SIGKILL');
                output += '\n[命令执行超时或无输出响应，已由系统安全终止]';
              }
            } catch {}
          } else {
            scheduleTimeoutCheck();
          }
        }, 10000);
      };

      scheduleTimeoutCheck();

      proc.stdout.on('data', (chunk) => {
        lastActivity = Date.now();
        const str = stdoutDecoder.write(chunk);
        output += str;
        context.onTerminalData?.(str);
      });

      proc.stderr.on('data', (chunk) => {
        lastActivity = Date.now();
        const str = stderrDecoder.write(chunk);
        output += str;
        context.onTerminalData?.(str);
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        output += stdoutDecoder.end() + stderrDecoder.end();

        // 智能探针：自动捕捉终端执行过程中落地生成的目标物理交付物
        try {
          const targetDir = context.workspacePath || process.cwd();
          // A. 从输出文本中正则提取输出文件路径
          const fileRegex = /(?:[a-zA-Z]:[\\/][^\r\n"':<>]+?\.(?:xlsx|xls|txt|cfg|docx|doc|pdf|pptx|zip)|(?:\.?[\/\\])?[a-zA-Z0-9_-]+[\\/][^\r\n"':<>]+?\.(?:xlsx|xls|txt|cfg|docx|doc|pdf|pptx|zip)|[a-zA-Z0-9_\u4e00-\u9fa5-]+?\.(?:xlsx|xls|txt|cfg|docx|doc|pdf|pptx|zip))/gi;
          let match: RegExpExecArray | null;
          while ((match = fileRegex.exec(output)) !== null) {
            const cand = match[0].trim();
            const resolved = path.isAbsolute(cand) ? path.normalize(cand) : path.resolve(targetDir, cand);
            if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
              context.trackedArtifacts?.add(resolved);
            }
          }

          // B. 扫描最近 60 秒内在工作区或子目录下新创建/修改的交付物文件
          const scanNewDeliverables = (dir: string, depth = 0) => {
            if (depth > 2 || !fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const ent of entries) {
              if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === '__pycache__') continue;
              const full = path.join(dir, ent.name);
              if (ent.isDirectory()) {
                scanNewDeliverables(full, depth + 1);
              } else if (ent.isFile() && /\.(xlsx|xls|txt|cfg|docx|pdf|zip)$/i.test(ent.name)) {
                try {
                  const st = fs.statSync(full);
                  if (st.mtimeMs >= cmdStartTime - 2000 && st.size > 0) {
                    context.trackedArtifacts?.add(path.normalize(full));
                  }
                } catch {}
              }
            }
          };
          scanNewDeliverables(targetDir);
        } catch (scanErr) {
          console.warn('[executeTerminal] Artifact tracking error:', scanErr);
        }

        resolve(output.trim() || `(进程退出，退出码: ${code})`);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve(`终端启动失败: ${err.message}`);
      });
    });
  }
}

export const toolScheduler = new ToolScheduler();
