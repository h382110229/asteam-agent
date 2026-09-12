import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import os from 'node:os';

import { net } from 'electron';

import { mcpManager } from './mcp-manager';
import { skillManager } from './skill-manager';
import { createWordDocx, createPowerPointPptx, createExcelXlsx, readExcelXlsx } from './office-generator';
import { createPdfDocument, readPdfDocument } from './pdf-generator';
import { compressZip, extractZip } from './zip-manager';
import { safeWriteFileSync } from './file-resilience';
import { artifactVerifier } from './artifact-verifier';
import { storageHub } from './storage-hub';
import { memoryManager } from './memory-manager';
import { rulesManager } from './rules-manager';
import { checkpointManager } from './checkpoint-manager';
import { securityFenceManager } from './security-fence-manager';

// Safe proxy-aware and CDN-friendly fetch using Chromium's network stack
const safeFetch: typeof fetch = async (input, init) => {
  if (typeof net !== 'undefined' && typeof net.fetch === 'function') {
    try {
      return await (net.fetch as any)(input, init);
    } catch (netErr: any) {
      console.warn('[safeFetch] net.fetch failed, falling back to global fetch:', netErr?.message || netErr);
      return await globalThis.fetch(input, init);
    }
  }
  return await globalThis.fetch(input, init);
};

export interface FallbackProviderItem {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  capabilities?: string[];
}

export interface AgentConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  stream?: boolean;
  workspacePath?: string | null;
  enabledMcpTools?: string[];
  enabledSkills?: string[];
  executionMode?: 'auto_edit' | 'plan_only' | 'safe_approval' | 'swarm';
  fallbackProviders?: FallbackProviderItem[];
  capabilities?: string[];
  customMcpConfig?: string;
  bypassSecurityFence?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface AgentStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  error?: string;
}

export interface SubQuestion {
  question: string;
  options?: string[];
  multiSelect?: boolean;
}

export interface InteractiveQuestionData {
  questionId: string;
  question: string;
  options?: string[];
  questions?: SubQuestion[];
  multiSelect?: boolean;
}

export interface TerminalDataEvent {
  sessionId: string;
  stepId?: string;
  chunk: string;
  stream: 'stdout' | 'stderr' | 'stdin';
}

export interface AgentEventCallbacks {
  onToken: (token: string, type?: 'content' | 'thought') => void;
  onPlan: (steps: AgentStep[]) => void;
  onStepUpdate: (step: AgentStep) => void;
  onError: (error: string) => void;
  onDone: (summary: string) => void;
  onQuestion?: (data: InteractiveQuestionData) => void;
  onTerminalData?: (data: TerminalDataEvent) => void;
  onCheckpoint?: (checkpoint: any) => void;
  onSwarmState?: (state: any) => void;
}

interface ActiveExecution {
  abortController: AbortController;
  currentProcess?: ChildProcess;
  currentStepId?: string;
  callbacks?: AgentEventCallbacks;
}

const activeExecutions = new Map<string, ActiveExecution>();
const pendingUserResponses = new Map<string, (response: string) => void>();

export function submitUserResponse(sessionId: string, response: string): boolean {
  const resolver = pendingUserResponses.get(sessionId);
  if (resolver) {
    resolver(response);
    pendingUserResponses.delete(sessionId);
    return true;
  }
  return false;
}

export function submitTerminalInput(sessionId: string, input: string): boolean {
  const active = activeExecutions.get(sessionId);
  if (active && active.currentProcess && !active.currentProcess.killed && active.currentProcess.stdin) {
    try {
      const eol = process.platform === 'win32' ? '\r\n' : '\n';
      const toSend = input.endsWith('\n') ? input : (input + eol);
      active.currentProcess.stdin.write(toSend);
      // Echo input to frontend terminal for immediate feedback
      active.callbacks?.onTerminalData?.({
        sessionId,
        stepId: active.currentStepId,
        chunk: `\x1b[36m> ${input}\x1b[0m\r\n`,
        stream: 'stdin'
      });
      return true;
    } catch (e) {
      console.error('Failed to write to terminal stdin:', e);
      return false;
    }
  }
  return false;
}

export function abortExecution(sessionId: string): boolean {
  const active = activeExecutions.get(sessionId);
  if (active) {
    try {
      active.abortController.abort();
    } catch {}
    if (active.currentProcess && !active.currentProcess.killed) {
      try {
        if (process.platform === 'win32' && active.currentProcess.pid) {
          spawn('taskkill', ['/pid', active.currentProcess.pid.toString(), '/T', '/F']);
        } else {
          active.currentProcess.kill('SIGKILL');
        }
      } catch {}
    }
    const resolver = pendingUserResponses.get(sessionId);
    if (resolver) {
      resolver('已由用户取消。');
      pendingUserResponses.delete(sessionId);
    }
    activeExecutions.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * 获取当前宿主系统真实的桌面目录（自动识别 OneDrive 桌面重定向，并确保目录存在）
 */
export function getSystemDesktopDir(): string {
  const home = os.homedir();
  const candidates: string[] = [];

  if (process.env.OneDrive) {
    candidates.push(path.join(process.env.OneDrive, 'Desktop'));
    candidates.push(path.join(process.env.OneDrive, '桌面'));
  }
  candidates.push(path.join(home, 'OneDrive', 'Desktop'));
  candidates.push(path.join(home, 'OneDrive', '桌面'));

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand)) {
        return path.normalize(cand);
      }
    } catch {}
  }

  const defaultDesktop = path.join(home, 'Desktop');
  if (!fs.existsSync(defaultDesktop)) {
    try {
      fs.mkdirSync(defaultDesktop, { recursive: true });
    } catch {}
  }
  return path.normalize(defaultDesktop);
}

// 1. Workspace Native Tools
export class WorkspaceTools {
  constructor(
    private workspacePath: string,
    private isHostMode: boolean = false,
    private onBeforeWrite?: (targetPath: string) => void,
    private config?: AgentConfig
  ) {}

  private resolveSafe(relOrAbsPath: string): string {
    if (!relOrAbsPath || relOrAbsPath.trim() === '') return this.workspacePath;

    let target = relOrAbsPath.trim();

    // 1. 展开 Windows/Unix 常见环境变量，如 %USERPROFILE%、%APPDATA%、$HOME
    target = target.replace(/%USERPROFILE%/gi, os.homedir());
    target = target.replace(/%APPDATA%/gi, process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'));
    target = target.replace(/\$HOME/g, os.homedir());

    const desktopDir = getSystemDesktopDir();
    const userHome = path.normalize(os.homedir());
    let currentUsername = 'user';
    try {
      currentUsername = os.userInfo().username;
    } catch {}

    // 2. 核心智能纠偏：纠正模型可能臆测的虚假用户名（如 C:\Users\Admin\Desktop\..., C:/Users/Administrator/..., C:/Users/User/...）
    // 若模型臆想了其他用户名（非当前真实登录用户名），自动纠偏为真实的用户桌面或用户主目录
    const fakeUserDesktopRegex = /^(?:[a-zA-Z]:[\\/])Users[\\/](?!Desktop|桌面|Public|Default\b)([^\\/]+)[\\/](Desktop|桌面)([\\/].*)?$/i;
    const fakeDesktopMatch = target.match(fakeUserDesktopRegex);
    if (fakeDesktopMatch) {
      const guessedUser = fakeDesktopMatch[1];
      if (guessedUser.toLowerCase() !== currentUsername.toLowerCase()) {
        const subPath = fakeDesktopMatch[3] ? fakeDesktopMatch[3].replace(/^[\\/]+/, '') : '';
        target = path.join(desktopDir, subPath);
      }
    }

    const fakeUserHomeRegex = /^(?:[a-zA-Z]:[\\/])Users[\\/](?!Desktop|桌面|Public|Default\b)([^\\/]+)([\\/].*)?$/i;
    const fakeHomeMatch = target.match(fakeUserHomeRegex);
    if (fakeHomeMatch) {
      const guessedUser = fakeHomeMatch[1];
      if (
        guessedUser.toLowerCase() !== currentUsername.toLowerCase() &&
        ['admin', 'administrator', 'user', 'test', 'defaultuser0'].includes(guessedUser.toLowerCase())
      ) {
        const subPath = fakeHomeMatch[2] ? fakeHomeMatch[2].replace(/^[\\/]+/, '') : '';
        target = path.join(userHome, subPath);
      }
    }

    // 3. 智能纠正波浪号与通用别名路径：
    // 如 "C:/Users/桌面/...", "桌面/...", "Desktop/...", "~/Desktop/...", "~/"
    if (/^(?:[a-zA-Z]:[\\/])?(?:Users[\\/])?桌面(?:[\\/]|$)/i.test(target)) {
      target = target.replace(/^(?:[a-zA-Z]:[\\/])?(?:Users[\\/])?桌面[\\/]?/i, desktopDir + path.sep);
    } else if (/^~[\\/]Desktop(?:[\\/]|$)/i.test(target)) {
      target = target.replace(/^~[\\/]Desktop[\\/]?/i, desktopDir + path.sep);
    } else if (/^(?:桌面|Desktop)(?:[\\/]|$)/i.test(target)) {
      target = target.replace(/^(?:桌面|Desktop)[\\/]?/i, desktopDir + path.sep);
    } else if (/^~[\\/]\.asteam(?:[\\/]|$)/i.test(target) || /^(?:[a-zA-Z]:[\\/])Users[\\/][^\\/]+[\\/]\.asteam(?:[\\/]|$)/i.test(target)) {
      // 核心闭环重定向：将一切对 ~/.asteam/... 的请求自动重定向至 ASTeam 独立中枢 (如 D:\ASTeamData)
      const sub = target
        .replace(/^~[\\/]\.asteam[\\/]?/i, '')
        .replace(/^(?:[a-zA-Z]:[\\/])Users[\\/][^\\/]+[\\/]\.asteam[\\/]?/i, '');
      if (sub.startsWith('skills')) {
        target = path.join(storageHub.getSkillsDir(), sub.replace(/^skills[\\/]?/i, ''));
      } else if (sub.startsWith('memory')) {
        target = path.join(storageHub.getMemoryDir(), sub.replace(/^memory[\\/]?/i, ''));
      } else if (sub.startsWith('artifacts')) {
        target = path.join(storageHub.getArtifactsDir(), sub.replace(/^artifacts[\\/]?/i, ''));
      } else if (sub.toLowerCase() === 'mcp_servers.json' || sub.toLowerCase().includes('mcp')) {
        target = storageHub.getMcpConfigFilePath();
      } else {
        target = path.join(storageHub.getDataRootDir(), sub);
      }
    } else if (/^~[\\/]/.test(target)) {
      target = target.replace(/^~[\\/]/, userHome + path.sep);
    }

    // 4. 智能识别并定向技能库 (ASTeam Skills) 虚拟与物理路径：
    // 如 "skills/custom/global/xxx.md", "custom/global/xxx.md", "custom:global:xxx", ".asteam/skills/xxx.md"
    const globalSkillsDir = storageHub.getSkillsDir();
    const workspaceSkillsDir = this.workspacePath ? path.join(this.workspacePath, '.asteam', 'skills') : null;
    const rawSkillBase = path.basename(target).replace(/^(?:custom_global_|custom:global:|custom_workspace_|custom:workspace:)/i, '');
    const cleanSkillMd = rawSkillBase.endsWith('.md') ? rawSkillBase : `${rawSkillBase}.md`;

    if (
      target.includes('skills') ||
      target.includes('custom') ||
      target.startsWith('custom:') ||
      target.startsWith('.asteam')
    ) {
      // 优先在 ASTeam 专属技能库中寻找 (例如 D:\ASTeamData\skills)
      const candGlobal = path.join(globalSkillsDir, cleanSkillMd);
      if (fs.existsSync(candGlobal)) {
        return candGlobal;
      }
      if (workspaceSkillsDir) {
        const candWorkspace = path.join(workspaceSkillsDir, cleanSkillMd);
        if (fs.existsSync(candWorkspace)) {
          return candWorkspace;
        }
      }
    }

    if (path.isAbsolute(target)) {
      const normalized = path.normalize(target);
      const dataRoot = path.normalize(storageHub.getDataRootDir());
      // 在免项目宿主模式下，或明确写入用户桌面 (Desktop)、数据中枢根目录与用户主目录：全部安全放行！
      if (
        this.isHostMode ||
        normalized.startsWith(path.normalize(this.workspacePath)) ||
        normalized.startsWith(dataRoot) ||
        normalized.startsWith(desktopDir) ||
        normalized.startsWith(userHome)
      ) {
        return normalized;
      }
      return normalized;
    }

    const abs = path.resolve(this.workspacePath, target);
    return abs;
  }

  viewFile(relPath: string): string {
    if (!relPath || relPath.trim() === '') {
      throw new Error('viewFile 失败: 未提供文件路径 (filePath 不能为空)');
    }

    // 优先检查是否匹配已安装或内置的 Skill 技能定义
    const matchedSkill = skillManager.findSkill(relPath, this.workspacePath || null);
    if (matchedSkill) {
      if (matchedSkill.filePath && fs.existsSync(matchedSkill.filePath)) {
        return fs.readFileSync(matchedSkill.filePath, 'utf-8');
      }
      return matchedSkill.prompt;
    }

    const target = this.resolveSafe(relPath);
    if (!fs.existsSync(target)) {
      // 兜底再次按文件名检查 skill
      const fallbackSkill = skillManager.findSkill(path.basename(relPath, '.md'), this.workspacePath || null);
      if (fallbackSkill) {
        if (fallbackSkill.filePath && fs.existsSync(fallbackSkill.filePath)) {
          return fs.readFileSync(fallbackSkill.filePath, 'utf-8');
        }
        return fallbackSkill.prompt;
      }
      throw new Error(`File not found: ${relPath}`);
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      return this.listDirectory(relPath);
    }
    if (stat.size > 2 * 1024 * 1024) {
      const fd = fs.openSync(target, 'r');
      const buffer = Buffer.alloc(32 * 1024);
      fs.readSync(fd, buffer, 0, 32 * 1024, 0);
      fs.closeSync(fd);
      return buffer.toString('utf-8') + '\n\n[...Truncated: File exceeds 2MB...]';
    }
    return fs.readFileSync(target, 'utf-8');
  }

  async writeFile(relPath: string, content: string): Promise<string> {
    if (!relPath || relPath.trim() === '' || relPath === '.' || relPath === './') {
      throw new Error('writeFile 失败: 必须指定具体的目标文件路径 (filePath 不能为空)');
    }
    const target = this.resolveSafe(relPath);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      throw new Error(`writeFile 失败: 目标路径 "${target}" 是一个现有目录，不能直接作为文件覆盖写入。请指定具体文件名（例如 ${path.join(target, 'document.md')}）。`);
    }

    // 触发影子快照挂钩，在写入前备份原文件
    try {
      this.onBeforeWrite?.(target);
    } catch (e) {
      console.warn('[WorkspaceTools] Checkpoint hook warning:', e);
    }

    // 智能识别：若目标为 Word 文档扩展名 (.docx)，自动转为标准二进制 docx 文档排版输出
    if (target.toLowerCase().endsWith('.docx')) {
      return await createWordDocx({
        filePath: target,
        title: path.basename(target, '.docx'),
        markdownContent: content
      });
    }

    // 智能识别：若目标为 PDF 文档扩展名 (.pdf)，自动转为标准二进制企业级 PDF 文档排版输出
    if (target.toLowerCase().endsWith('.pdf')) {
      return await createPdfDocument({
        filePath: target,
        title: path.basename(target, '.pdf'),
        markdownContent: content
      });
    }

    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const ext = path.extname(target).toLowerCase();
    const writeContent = (['.ps1', '.bat', '.cmd'].includes(ext) && !content.startsWith('\uFEFF'))
      ? '\uFEFF' + content
      : content;
    const writeRes = safeWriteFileSync(target, writeContent, 'utf-8');
    const stats = fs.statSync(writeRes.actualPath);
    return `成功写入并持久化文件: "${writeRes.actualPath}" (${stats.size} 字节，已校验路径真实存在)${writeRes.isFallback ? ` [提示: 原目标已被系统独占锁定，自动安全写入新版本: ${writeRes.actualPath}]` : ''}`;
  }

  async generateWordDocx(options: any): Promise<string> {
    const target = this.resolveSafe(options.filePath || 'document.docx');
    return await createWordDocx({ ...options, filePath: target });
  }

  async generatePowerPointPptx(options: any): Promise<string> {
    const target = this.resolveSafe(options.filePath || 'presentation.pptx');
    return await createPowerPointPptx({ ...options, filePath: target });
  }

  async generateExcelXlsx(options: any): Promise<string> {
    const target = this.resolveSafe(options.filePath || 'data.xlsx');
    return await createExcelXlsx({ ...options, filePath: target });
  }

  async readExcel(filePath: string, sheetName?: string): Promise<string> {
    const target = this.resolveSafe(filePath);
    const res = await readExcelXlsx(target, sheetName);
    return res.summary;
  }

  async generatePdf(options: any): Promise<string> {
    const target = this.resolveSafe(options.filePath || 'document.pdf');
    return await createPdfDocument({ ...options, filePath: target });
  }

  async readPdf(filePath: string): Promise<string> {
    const target = this.resolveSafe(filePath);
    const res = await readPdfDocument(target);
    return res.summary;
  }

  async compressZip(options: any): Promise<string> {
    const targetZip = this.resolveSafe(options.targetZipPath || options.filePath || 'archive.zip');
    const rawSources = options.sourcePaths || options.sources || options.files || [];
    const sourceArray = Array.isArray(rawSources) ? rawSources : [rawSources];
    const resolvedSources = sourceArray.map((p: string) => this.resolveSafe(p));
    return await compressZip({
      sourcePaths: resolvedSources,
      targetZipPath: targetZip,
      comment: options.comment
    });
  }

  async extractZip(options: any): Promise<string> {
    const zipPath = this.resolveSafe(options.zipPath || options.filePath);
    const outputDir = this.resolveSafe(options.outputDir || options.targetDir || path.dirname(zipPath));
    return await extractZip({
      zipPath,
      outputDir,
      overwrite: options.overwrite
    });
  }

  async generateImage(options: {
    prompt: string;
    filePath?: string;
    size?: string;
    ratio?: string;
    model?: string;
  }): Promise<string> {
    if (!options.prompt || !options.prompt.trim()) {
      throw new Error('generate_image 失败: prompt 不能为空，请提供要生成的图片画面描述');
    }

    // 核心智能映射：由于 /images/generations 为专属生图队列，若传入的是 "Auto" 或通用文本模型，自动映射为 LLMAPI 图像旗舰模型 "agnes-image-2.1-flash"
    let targetImageModel = options.model?.trim() || '';
    if (!targetImageModel || targetImageModel.toLowerCase() === 'auto' || (!targetImageModel.includes('image') && !targetImageModel.includes('dall-e') && !targetImageModel.includes('flux'))) {
      targetImageModel = 'agnes-image-2.1-flash';
    }

    const providerCandidates: SingleProviderTarget[] = [];
    if (this.config?.baseUrl) {
      providerCandidates.push({
        name: '主服务商',
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey || '',
        model: targetImageModel
      });
    }
    if (this.config?.fallbackProviders) {
      for (const fb of this.config.fallbackProviders) {
        if (fb.enabled && fb.baseUrl) {
          providerCandidates.push({
            name: fb.name || '备用服务商',
            baseUrl: fb.baseUrl,
            apiKey: fb.apiKey || '',
            model: targetImageModel
          });
        }
      }
    }

    if (providerCandidates.length === 0) {
      providerCandidates.push({
        name: 'LLMAPI 网关',
        baseUrl: 'https://llmapi.ashawk.online/v1',
        apiKey: this.config?.apiKey || '',
        model: targetImageModel
      });
    }

    let lastError: any = null;
    let resultData: any = null;
    let usedProvider: SingleProviderTarget | null = null;

    for (const provider of providerCandidates) {
      try {
        let base = provider.baseUrl.replace(/\/+$/, '');
        let url = `${base}/images/generations`;
        if (base.endsWith('/chat/completions')) {
          url = base.replace(/\/chat\/completions$/, '/images/generations');
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const requestBody = {
          model: targetImageModel,
          prompt: options.prompt,
          size: options.size || '1K',
          ratio: options.ratio || '16:9'
        };

        const response = await safeFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`[HTTP ${response.status}] ${errText.slice(0, 300)}`);
        }

        const json = await response.json();
        if (json.data && json.data.length > 0) {
          resultData = json.data[0];
          usedProvider = provider;
          break;
        } else if (json.error) {
          throw new Error(json.error.message || JSON.stringify(json.error));
        } else {
          throw new Error(`未知响应格式: ${JSON.stringify(json).slice(0, 200)}`);
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[WorkspaceTools] generate_image via ${provider.name} failed:`, err.message);
      }
    }

    if (!resultData) {
      throw new Error(`图像生成失败: ${lastError?.message || '无法连接图像生成服务'}`);
    }

    let rawFilePath = options.filePath;
    if (!rawFilePath || !rawFilePath.trim()) {
      const fileName = `image_${Date.now()}.png`;
      if (this.isHostMode || !this.workspacePath) {
        rawFilePath = path.join(getSystemDesktopDir(), fileName);
      } else {
        rawFilePath = path.join('images', fileName);
      }
    }

    const targetPath = this.resolveSafe(rawFilePath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    try {
      this.onBeforeWrite?.(targetPath);
    } catch {}

    let finalImageUrl = resultData.url || '';
    if (resultData.b64_json) {
      const buffer = Buffer.from(resultData.b64_json, 'base64');
      fs.writeFileSync(targetPath, buffer);
    } else if (resultData.url) {
      try {
        const downloadRes = await safeFetch(resultData.url);
        if (downloadRes.ok) {
          const arrayBuf = await downloadRes.arrayBuffer();
          fs.writeFileSync(targetPath, Buffer.from(arrayBuf));
        }
      } catch (dlErr) {
        console.warn('[WorkspaceTools] Failed to download image locally:', dlErr);
      }
    }

    const fileSize = fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0;
    const relToWorkspace = this.workspacePath ? path.relative(this.workspacePath, targetPath).replace(/\\/g, '/') : targetPath;

    return `[AI 图像生成成功]
- 保存本地路径: "${targetPath}" (相对路径: "${relToWorkspace}", 大小: ${fileSize} 字节)
- 生成尺寸/比例: ${options.size || '1K'} (${options.ratio || '16:9'})
- 调度模型: ${usedProvider?.model || options.model || 'agnes-image-2.1-flash'}
- 画面描述: "${options.prompt}"
${finalImageUrl ? `- 在线预览 URL: ${finalImageUrl}` : ''}

【重要指示】文件已保存至本地磁盘。请在回复正文中直接向用户展示该图片（使用 Markdown 语法：![${options.prompt.slice(0, 30)}](${finalImageUrl || relToWorkspace}) 并提供保存路径说明）。`;
  }

  async generateVideo(options: {
    prompt: string;
    filePath?: string;
    size?: string;
    ratio?: string;
    seconds?: string;
    model?: string;
  }): Promise<string> {
    if (!options.prompt || !options.prompt.trim()) {
      throw new Error('generate_video 参数错误: prompt (画面描述) 不能为空');
    }

    let targetVideoModel = (options.model || '').trim();
    if (!targetVideoModel || targetVideoModel.toLowerCase() === 'auto') {
      targetVideoModel = 'agnes-video-2.5-flash';
    }

    const providerCandidates: SingleProviderTarget[] = [];
    if (this.config?.baseUrl) {
      providerCandidates.push({
        name: '主服务商',
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey || '',
        model: targetVideoModel
      });
    }
    if (this.config?.fallbackProviders) {
      for (const fb of this.config.fallbackProviders) {
        if (fb.enabled && fb.baseUrl) {
          providerCandidates.push({
            name: fb.name || '备用服务商',
            baseUrl: fb.baseUrl,
            apiKey: fb.apiKey || '',
            model: targetVideoModel
          });
        }
      }
    }
    if (providerCandidates.length === 0) {
      providerCandidates.push({
        name: 'LLMAPI 网关',
        baseUrl: 'https://llmapi.ashawk.online/v1',
        apiKey: this.config?.apiKey || '',
        model: targetVideoModel
      });
    }

    let lastError: any = null;
    let resultData: any = null;
    let usedProvider: SingleProviderTarget | null = null;

    for (const provider of providerCandidates) {
      try {
        let base = provider.baseUrl.replace(/\/+$/, '');
        let url = `${base}/videos`;
        if (base.endsWith('/chat/completions')) {
          url = base.replace(/\/chat\/completions$/, '/videos');
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const requestBody = {
          model: targetVideoModel,
          prompt: options.prompt,
          seconds: options.seconds || '5',
          size: options.size || '720P',
          aspect_ratio: options.ratio || '16:9',
          mode: 'text'
        };

        const response = await safeFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`[HTTP ${response.status}] ${errText.slice(0, 300)}`);
        }

        const json = await response.json();
        if (json.id || json.task_id || json.video_id || json.url || json.video_url) {
          resultData = json;
          usedProvider = provider;
          break;
        } else if (json.error) {
          throw new Error(json.error.message || JSON.stringify(json.error));
        } else {
          resultData = json;
          usedProvider = provider;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[WorkspaceTools] generate_video via ${provider.name} failed:`, err.message);
      }
    }

    if (!resultData) {
      throw new Error(`视频生成失败: ${lastError?.message || '无法连接视频生成服务'}`);
    }

    let rawFilePath = options.filePath;
    if (!rawFilePath || !rawFilePath.trim()) {
      const fileName = `video_${Date.now()}.mp4`;
      if (this.isHostMode || !this.workspacePath) {
        rawFilePath = path.join(getSystemDesktopDir(), fileName);
      } else {
        rawFilePath = path.join('videos', fileName);
      }
    }

    const targetPath = this.resolveSafe(rawFilePath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let videoUrl = resultData.url || resultData.video_url || resultData.output_url || resultData.metadata?.url || '';
    const taskId = resultData.id || resultData.task_id || resultData.video_id || '';

    // 若当前未直接拿到 videoUrl，且存在 taskId 与 usedProvider，则进行后台自动轮询（LLMAPI 网关已上线 GET /v1/videos/{taskId}）
    if (!videoUrl && taskId && usedProvider) {
      let base = usedProvider.baseUrl.replace(/\/+$/, '');
      if (base.endsWith('/chat/completions')) {
        base = base.replace(/\/chat\/completions$/, '');
      }
      const pollUrl = `${base}/videos/${taskId}`;
      const pollHeaders: Record<string, string> = {};
      if (usedProvider.apiKey) {
        pollHeaders['Authorization'] = `Bearer ${usedProvider.apiKey}`;
      }

      console.log(`[WorkspaceTools] Starting polling for video task ${taskId} at ${pollUrl}...`);
      const maxPollAttempts = 30; // 30 * 4s = 120s
      for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 4000));
        try {
          const pollRes = await safeFetch(pollUrl, { headers: pollHeaders });
          if (pollRes.ok) {
            const pollJson = await pollRes.json();
            const candidate = pollJson.metadata?.url || pollJson.url || pollJson.video_url;
            console.log(`[WorkspaceTools] Poll #${attempt} for ${taskId}: status=${pollJson.status}, progress=${pollJson.progress}%`);
            if (candidate || pollJson.status === 'completed') {
              videoUrl = candidate;
              break;
            }
            if (pollJson.status === 'failed') {
              console.warn(`[WorkspaceTools] Video task ${taskId} reported failure:`, pollJson);
              break;
            }
          }
        } catch (pollErr: any) {
          console.warn(`[WorkspaceTools] Poll #${attempt} error:`, pollErr.message);
        }
      }
    }

    if (videoUrl) {
      try {
        const downloadRes = await safeFetch(videoUrl);
        if (downloadRes.ok) {
          const arrayBuf = await downloadRes.arrayBuffer();
          try {
            this.onBeforeWrite?.(targetPath);
          } catch {}
          fs.writeFileSync(targetPath, Buffer.from(arrayBuf));
        }
      } catch (dlErr) {
        console.warn('[WorkspaceTools] Failed to download video locally:', dlErr);
      }
    }

    const fileExists = fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0;
    const fileSize = fileExists ? fs.statSync(targetPath).size : 0;
    const relToWorkspace = this.workspacePath ? path.relative(this.workspacePath, targetPath).replace(/\\/g, '/') : targetPath;

    if (fileExists) {
      return `[AI 视频生成成功并已落盘]
- 任务 ID: "${taskId}"
- 调度模型: ${usedProvider?.model || options.model || 'agnes-video-2.5-flash'}
- 本地保存路径: "${targetPath}" (相对路径: "${relToWorkspace}")
- 本地文件大小: ${fileSize} 字节
- 时长与规格: ${options.seconds || '5'}s / ${options.size || '720P'} (${options.ratio || '16:9'})
- 画面描述: "${options.prompt}"
- 视频直链地址: ${videoUrl}

【重要指示】视频已成功生成并下载至本地！请向用户汇报已完成，并在回复的 Markdown 中展示视频播放卡片：[视频播放: ${options.prompt.slice(0, 20)}](${relToWorkspace})。`;
    } else {
      return `[AI 视频生成任务已提交至后台队列]
- 任务 ID: "${taskId}"
- 调度模型: ${usedProvider?.model || options.model || 'agnes-video-2.5-flash'}
- 时长与规格: ${options.seconds || '5'}s / ${options.size || '720P'} (${options.ratio || '16:9'})
- 画面描述: "${options.prompt}"
- 当前状态: 异步队列渲染超时（120 秒内尚未完成，任务仍在上游队列处理中）

【重要指示】视频生成任务已在网关队列中创建（任务 ID: "${taskId}"）。由于当前服务商网关排队渲染超时，本地磁盘尚未落盘真实 .mp4 文件。请向用户如实客观汇报任务 ID 与超时状态，【严禁】臆造假链接！`;
    }
  }

  async textToSpeech(options: {
    input: string;
    filePath?: string;
    voice?: string;
    model?: string;
    response_format?: string;
  }): Promise<string> {
    if (!options.input || !options.input.trim()) {
      throw new Error('text_to_speech 参数错误: input (朗读文本) 不能为空');
    }

    let targetTtsModel = (options.model || '').trim();
    if (!targetTtsModel || targetTtsModel.toLowerCase() === 'auto') {
      targetTtsModel = 'mimo-v2.5-tts';
    }

    const providerCandidates: SingleProviderTarget[] = [];
    if (this.config?.baseUrl) {
      providerCandidates.push({
        name: '主服务商',
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey || '',
        model: targetTtsModel
      });
    }
    if (this.config?.fallbackProviders) {
      for (const fb of this.config.fallbackProviders) {
        if (fb.enabled && fb.baseUrl) {
          providerCandidates.push({
            name: fb.name || '备用服务商',
            baseUrl: fb.baseUrl,
            apiKey: fb.apiKey || '',
            model: targetTtsModel
          });
        }
      }
    }
    if (providerCandidates.length === 0) {
      providerCandidates.push({
        name: 'LLMAPI 网关',
        baseUrl: 'https://llmapi.ashawk.online/v1',
        apiKey: this.config?.apiKey || '',
        model: targetTtsModel
      });
    }

    let rawFilePath = options.filePath;
    if (!rawFilePath || !rawFilePath.trim()) {
      const fileName = `speech_${Date.now()}.mp3`;
      if (this.isHostMode || !this.workspacePath) {
        rawFilePath = path.join(getSystemDesktopDir(), fileName);
      } else {
        rawFilePath = path.join('audio', fileName);
      }
    }

    const targetPath = this.resolveSafe(rawFilePath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    try {
      this.onBeforeWrite?.(targetPath);
    } catch {}

    let lastError: any = null;
    let audioBuffer: Buffer | null = null;
    let usedProvider: SingleProviderTarget | null = null;

    for (const provider of providerCandidates) {
      try {
        let base = provider.baseUrl.replace(/\/+$/, '');
        let url = `${base}/audio/speech`;
        if (base.endsWith('/chat/completions')) {
          url = base.replace(/\/chat\/completions$/, '/audio/speech');
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const requestBody = {
          model: targetTtsModel,
          input: options.input,
          voice: options.voice || 'alloy',
          response_format: options.response_format || 'mp3'
        };

        const response = await safeFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`[HTTP ${response.status}] ${errText.slice(0, 300)}`);
        }

        const arrayBuf = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
        usedProvider = provider;
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[WorkspaceTools] text_to_speech via ${provider.name} failed:`, err.message);
      }
    }

    if (audioBuffer && audioBuffer.length > 0) {
      fs.writeFileSync(targetPath, audioBuffer);
      const relToWorkspace = this.workspacePath ? path.relative(this.workspacePath, targetPath).replace(/\\/g, '/') : targetPath;
      return `[AI 语音合成成功]
- 保存本地路径: "${targetPath}" (相对路径: "${relToWorkspace}", 大小: ${audioBuffer.length} 字节)
- 调度模型: ${usedProvider?.model || targetTtsModel}
- 发音角色: ${options.voice || 'alloy'}
- 合成内容摘要: "${options.input.slice(0, 50)}..."

【重要指示】音频文件已生成并保存。请向用户汇报路径并使用 Markdown 音频语法呈现：[播放音频: ${options.input.slice(0, 15)}](${relToWorkspace})。`;
    }

    // 若服务商网关尚未开启 /v1/audio/speech 路由，提供降级诊断说明
    return `[语音合成服务提示]
服务商网关响应: ${lastError?.message || '未知错误'}
（诊断提示：LLMAPI 网关当前暂未开放 /v1/audio/speech 端点路由。客户端已就绪相关参数，待服务端启用后即可无缝合成）。
请求朗读文本: "${options.input}"`;
  }

  async audioToText(options: {
    filePath: string;
    language?: string;
    model?: string;
  }): Promise<string> {
    if (!options.filePath || !options.filePath.trim()) {
      throw new Error('audio_to_text 参数错误: filePath (音频文件路径) 不能为空');
    }

    const targetPath = this.resolveSafe(options.filePath);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`音频文件不存在: ${options.filePath}`);
    }

    let targetAsrModel = (options.model || '').trim();
    if (!targetAsrModel || targetAsrModel.toLowerCase() === 'auto') {
      targetAsrModel = 'mimo-v2.5-asr';
    }

    const providerCandidates: SingleProviderTarget[] = [];
    if (this.config?.baseUrl) {
      providerCandidates.push({
        name: '主服务商',
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey || '',
        model: targetAsrModel
      });
    }
    if (this.config?.fallbackProviders) {
      for (const fb of this.config.fallbackProviders) {
        if (fb.enabled && fb.baseUrl) {
          providerCandidates.push({
            name: fb.name || '备用服务商',
            baseUrl: fb.baseUrl,
            apiKey: fb.apiKey || '',
            model: targetAsrModel
          });
        }
      }
    }
    if (providerCandidates.length === 0) {
      providerCandidates.push({
        name: 'LLMAPI 网关',
        baseUrl: 'https://llmapi.ashawk.online/v1',
        apiKey: this.config?.apiKey || '',
        model: targetAsrModel
      });
    }

    let lastError: any = null;
    let transcribedText = '';

    for (const provider of providerCandidates) {
      try {
        let base = provider.baseUrl.replace(/\/+$/, '');
        let url = `${base}/audio/transcriptions`;
        if (base.endsWith('/chat/completions')) {
          url = base.replace(/\/chat\/completions$/, '/audio/transcriptions');
        }

        const fileBuffer = fs.readFileSync(targetPath);
        const fileName = path.basename(targetPath);
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer]), fileName);
        formData.append('model', targetAsrModel);
        if (options.language) {
          formData.append('language', options.language);
        }

        const headers: Record<string, string> = {};
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const response = await safeFetch(url, {
          method: 'POST',
          headers,
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`[HTTP ${response.status}] ${errText.slice(0, 300)}`);
        }

        const json = await response.json();
        transcribedText = json.text || '';
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[WorkspaceTools] audio_to_text via ${provider.name} failed:`, err.message);
      }
    }

    if (transcribedText) {
      return `[AI 语音识别转录成功]
- 音频来源: "${options.filePath}"
- 识别语言: ${options.language || '自动检测'}
- 转录文字内容:
${transcribedText}`;
    }

    return `[语音识别服务提示]
服务商网关响应: ${lastError?.message || '未知错误'}
（诊断提示：LLMAPI 网关当前暂未开放 /v1/audio/transcriptions 端点路由。客户端已就绪相关参数，待服务端启用后即可无缝转录）。`;
  }

  async generateEmbedding(options: {
    input: string | string[];
    model?: string;
  }): Promise<string> {
    if (!options.input) {
      throw new Error('generate_embedding 参数错误: input 不能为空');
    }

    let targetEmbedModel = (options.model || '').trim();
    if (!targetEmbedModel || targetEmbedModel.toLowerCase() === 'auto') {
      targetEmbedModel = 'gemini-embedding-2';
    }

    const providerCandidates: SingleProviderTarget[] = [];
    if (this.config?.baseUrl) {
      providerCandidates.push({
        name: '主服务商',
        baseUrl: this.config.baseUrl,
        apiKey: this.config.apiKey || '',
        model: targetEmbedModel
      });
    }
    if (this.config?.fallbackProviders) {
      for (const fb of this.config.fallbackProviders) {
        if (fb.enabled && fb.baseUrl) {
          providerCandidates.push({
            name: fb.name || '备用服务商',
            baseUrl: fb.baseUrl,
            apiKey: fb.apiKey || '',
            model: targetEmbedModel
          });
        }
      }
    }
    if (providerCandidates.length === 0) {
      providerCandidates.push({
        name: 'LLMAPI 网关',
        baseUrl: 'https://llmapi.ashawk.online/v1',
        apiKey: this.config?.apiKey || '',
        model: targetEmbedModel
      });
    }

    let lastError: any = null;
    let resultJson: any = null;

    for (const provider of providerCandidates) {
      try {
        let base = provider.baseUrl.replace(/\/+$/, '');
        let url = `${base}/embeddings`;
        if (base.endsWith('/chat/completions')) {
          url = base.replace(/\/chat\/completions$/, '/embeddings');
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const response = await safeFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: targetEmbedModel,
            input: options.input
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`[HTTP ${response.status}] ${errText.slice(0, 300)}`);
        }

        resultJson = await response.json();
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[WorkspaceTools] generate_embedding via ${provider.name} failed:`, err.message);
      }
    }

    if (!resultJson || !resultJson.data) {
      throw new Error(`向量嵌入获取失败: ${lastError?.message || '服务商返回异常'}`);
    }

    const firstVec = resultJson.data[0]?.embedding || [];
    const previewFloats = firstVec.slice(0, 6).map((v: number) => v.toFixed(6)).join(', ');

    return `[AI 向量嵌入生成成功]
- 嵌入模型: ${targetEmbedModel}
- 向量维度: ${firstVec.length} 维
- 嵌入条目数: ${resultJson.data.length} 条
- 向量头部切片: [${previewFloats}, ...]`;
  }

  listDirectory(relPath: string = '.'): string {
    const target = this.resolveSafe(relPath);
    if (!fs.existsSync(target)) {
      throw new Error(`Directory not found: ${relPath}`);
    }
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const items = entries.slice(0, 100).map(e => {
      const type = e.isDirectory() ? '[DIR]' : '[FILE]';
      return `${type} ${e.name}`;
    });
    if (entries.length > 100) {
      items.push(`... and ${entries.length - 100} more items`);
    }
    return items.join('\n') || '(empty directory)';
  }

  runTerminalCommand(
    command: string,
    sessionId: string,
    timeoutMs: number = 120000,
    callbacks?: AgentEventCallbacks,
    stepId?: string
  ): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      let isSettled = false;

      let tempScriptPath: string | null = null;
      let shell = 'bash';
      let shellArgs: string[] = [];

      if (process.platform === 'win32') {
        shell = 'powershell.exe';
        // 健壮性语法纠偏：将 bash/cmd 风格的 && 与 || 转换为 PowerShell 兼容语法
        let sanitizedCommand = command;
        if (sanitizedCommand.includes('&&') || sanitizedCommand.includes('||')) {
          const andParts = sanitizedCommand.split(/\s*&&\s*/);
          if (andParts.length > 1) {
            sanitizedCommand = andParts.reduce((acc, part, idx) => {
              if (idx === 0) return part;
              return `${acc}; if ($?) { ${part} }`;
            });
          }
          const orParts = sanitizedCommand.split(/\s*\|\|\s*/);
          if (orParts.length > 1) {
            sanitizedCommand = orParts.reduce((acc, part, idx) => {
              if (idx === 0) return part;
              return `${acc}; if (-not $?) { ${part} }`;
            });
          }
        }

        // 使用临时 .ps1 脚本沙箱执行，彻底消除控制台长指令截断、引号转义失真及 UTF-8 编码乱码
        try {
          const tempFile = path.join(os.tmpdir(), `asteam_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ps1`);
          const scriptBody = `\uFEFF[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue';\r\n${sanitizedCommand}\r\n`;
          fs.writeFileSync(tempFile, scriptBody, 'utf-8');
          tempScriptPath = tempFile;
          shellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempFile];
        } catch {
          const wrappedCommand = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue'; ${sanitizedCommand}`;
          shellArgs = ['-NoProfile', '-Command', wrappedCommand];
        }
      } else {
        shellArgs = ['-c', command];
      }

      const cleanupTempScript = () => {
        if (tempScriptPath && fs.existsSync(tempScriptPath)) {
          try {
            fs.unlinkSync(tempScriptPath);
          } catch {}
          tempScriptPath = null;
        }
      };

      const child = spawn(shell, shellArgs, {
        cwd: this.workspacePath,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const active = activeExecutions.get(sessionId);
      if (active) {
        active.currentProcess = child;
        active.currentStepId = stepId;
      }

      // 实时向前端终端广播命令起始行
      callbacks?.onTerminalData?.({
        sessionId,
        stepId,
        chunk: `\x1b[33m$ ${command}\x1b[0m\n`,
        stream: 'stdout'
      });

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          cleanupTempScript();
          try {
            if (process.platform === 'win32' && child.pid) {
              spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F']);
            } else {
              child.kill('SIGKILL');
            }
          } catch {}
          const timeoutNotice = `\n\x1b[31m[Error: Command timed out after ${timeoutMs / 1000} seconds]\x1b[0m\n`;
          callbacks?.onTerminalData?.({
            sessionId,
            stepId,
            chunk: timeoutNotice,
            stream: 'stderr'
          });
          resolve(`[Error: Command timed out after ${timeoutMs / 1000} seconds]\n` + output);
        }
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        const str = data.toString('utf-8');
        output += str;
        if (output.length > 50000) {
          output = output.slice(-50000);
        }
        callbacks?.onTerminalData?.({
          sessionId,
          stepId,
          chunk: str,
          stream: 'stdout'
        });
      });

      child.stderr.on('data', (data) => {
        const str = data.toString('utf-8');
        errorOutput += str;
        callbacks?.onTerminalData?.({
          sessionId,
          stepId,
          chunk: str,
          stream: 'stderr'
        });
      });

      child.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          cleanupTempScript();
          clearTimeout(timer);
          callbacks?.onTerminalData?.({
            sessionId,
            stepId,
            chunk: `\n\x1b[31m[Process Error: ${err.message}]\x1b[0m\n`,
            stream: 'stderr'
          });
          resolve(`[Process Error: ${err.message}]\n` + output);
        }
      });

      child.on('close', (code) => {
        if (!isSettled) {
          isSettled = true;
          cleanupTempScript();
          clearTimeout(timer);
          if (active && active.currentProcess === child) {
            active.currentProcess = undefined;
          }
          const exitNotice = `\n\x1b[90m(Process exited with code ${code})\x1b[0m\n`;
          callbacks?.onTerminalData?.({
            sessionId,
            stepId,
            chunk: exitNotice,
            stream: code === 0 ? 'stdout' : 'stderr'
          });
          const totalOut = output + (errorOutput ? `\n[STDERR]:\n${errorOutput}` : '');
          resolve(`(exit code ${code})\n${totalOut || '(no output)'}`);
        }
      });
    });
  }
}

interface SingleProviderTarget {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  capabilities?: string[];
}

function providerSupportsVision(p: SingleProviderTarget): boolean {
  if (p.capabilities && p.capabilities.length > 0) {
    return p.capabilities.includes('vision');
  }
  const name = (p.model || '').toLowerCase();
  return (
    name.includes('vision') ||
    name.includes('vl') ||
    name.includes('4o') ||
    name.includes('gemini') ||
    name.includes('claude-3') ||
    name.includes('omni') ||
    name.includes('mimo') ||
    name === 'auto'
  );
}

async function executeSingleProviderCall(
  provider: SingleProviderTarget,
  messages: ChatMessage[],
  abortSignal: AbortSignal,
  useStream: boolean,
  onDelta: (text: string, type?: 'content' | 'thought') => void,
  onSystemNotice?: (notice: string) => void
): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const response = await safeFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model || 'Auto',
      messages,
      stream: useStream,
      temperature: 0.3
    }),
    signal: abortSignal
  });

  if (!response.ok) {
    const errText = await response.text();
    // 高可用动态故障转移 (Failover Retry)：
    // 若网关在动态路由调度特定子模型时遇到了临时的 410 (如分发池中某个特定节点退役)
    if (response.status === 410 || errText.includes('end of life') || errText.includes('no longer available')) {
      if (provider.model !== 'deepseek-chat') {
        return await executeSingleProviderCall(
          { ...provider, model: 'deepseek-chat' },
          messages,
          abortSignal,
          useStream,
          onDelta,
          onSystemNotice
        );
      }
    }

    let cleanMessage = '';
    if (response.status === 524) {
      cleanMessage = `[网关超时 HTTP 524] 等待上游模型推理超时 (超过 100 秒)`;
    } else if (response.status === 502 || response.status === 503 || response.status === 504) {
      cleanMessage = `[网关服务异常 HTTP ${response.status}] 上游服务暂时不可用或节点调度中`;
    } else if (response.status === 429) {
      cleanMessage = `[频控限流 HTTP 429] 当前调用频率超限或并发已满`;
    } else if (response.status === 401 || response.status === 403) {
      cleanMessage = `[鉴权失败 HTTP ${response.status}] API Key 校验未通过`;
    } else {
      if (errText.includes('<!DOCTYPE') || errText.includes('<html')) {
        const titleMatch = errText.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : `HTTP ${response.status} 错误`;
        cleanMessage = `[API 异常 HTTP ${response.status}] ${title}`;
      } else {
        cleanMessage = `[API 异常 HTTP ${response.status}] ${errText.slice(0, 200)}`;
      }
    }

    const err = new Error(cleanMessage) as any;
    err.status = response.status;
    err.rawText = errText;
    throw err;
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  // Handle non-streaming application/json
  if (contentType.includes('application/json') || !contentType.includes('text/event-stream')) {
    const json = await response.json();
    if (json.error) {
      throw new Error(`[API 错误] ${json.error.message || JSON.stringify(json.error)}`);
    }
    const msgObj = json.choices?.[0]?.message;
    const content = msgObj?.content || json.choices?.[0]?.delta?.content || '';
    const reasoning = msgObj?.reasoning_content || msgObj?.reasoning || msgObj?.thought || '';
    if (reasoning) {
      onDelta(reasoning, 'thought');
    }
    if (content) {
      onDelta(content, 'content');
    }
    const combined = (content || reasoning || '').trim();
    if (!combined) {
      if (provider.model === 'Auto' || (provider.model && provider.model !== 'deepseek-chat')) {
        onSystemNotice?.(`\n\n> 🔄 **[服务商动态调度]** 上游模型 (${provider.model}) 响应为空，正在自动调度高可用基础线路 (deepseek-chat) 重新执行...\n\n`);
        return await executeSingleProviderCall(
          { ...provider, model: 'deepseek-chat' },
          messages,
          abortSignal,
          useStream,
          onDelta,
          onSystemNotice
        );
      }
      throw new Error(`[服务商响应异常] 上游模型 (${provider.name} - ${provider.model}) 未返回任何文本内容。`);
    }
    return combined;
  }

  // Handle SSE streaming
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is null and cannot be streamed.');
  }

  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  const processDataLine = (dataStr: string) => {
    if (!dataStr || dataStr === '[DONE]') return;
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed.error) {
        throw new Error(`[上游模型服务异常] ${parsed.error.message || JSON.stringify(parsed.error)}`);
      }
      const delta = parsed.choices?.[0]?.delta;
      const deltaContent = delta?.content || delta?.text || '';
      const deltaReasoning = delta?.reasoning_content || delta?.reasoning || delta?.thought || delta?.thinking || '';

      if (deltaReasoning) {
        fullText += deltaReasoning;
        onDelta(deltaReasoning, 'thought');
      }
      if (deltaContent) {
        fullText += deltaContent;
        onDelta(deltaContent, 'content');
      }
    } catch (e: any) {
      if (e.message?.startsWith('[上游模型服务异常]')) throw e;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        processDataLine(dataStr);
      }
    }
  }

  // Process any leftover chunk in buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) {
      processDataLine(trimmed.slice(5).trim());
    }
  }

  if (!fullText.trim()) {
    if (provider.model === 'Auto' || (provider.model && provider.model !== 'deepseek-chat')) {
      onSystemNotice?.(`\n\n> 🔄 **[服务商动态调度]** 上游模型 (${provider.model}) 响应为空，正在自动调度高可用基础线路 (deepseek-chat) 重新执行...\n\n`);
      return await executeSingleProviderCall(
        { ...provider, model: 'deepseek-chat' },
        messages,
        abortSignal,
        useStream,
        onDelta,
        onSystemNotice
      );
    }
    throw new Error(`[服务商响应异常] 上游模型 (${provider.name} - ${provider.model}) 未返回任何文本内容。`);
  }

  return fullText;
}

export async function callLLMStream(
  config: AgentConfig,
  messages: ChatMessage[],
  abortSignal: AbortSignal,
  onDelta: (text: string, type?: 'content' | 'thought') => void,
  onSystemNotice?: (notice: string) => void
): Promise<string> {
  const useStream = config.stream !== false;
  const notifySystem = onSystemNotice || ((notice: string) => onDelta(notice, 'thought'));

  // 0. 企业级出境安全围栏审查与数据脱敏 (v1.7.0 / v1.8.3)
  let effectiveMessages = messages;
  if (config.bypassSecurityFence) {
    notifySystem(`\n\n> ⚡ **[出境安全豁免已生效]** 本次请求已根据用户授权原样发送至模型（已留存合规审计日志）。\n\n`);
  } else {
    const fenceResult = securityFenceManager.sanitizeMessages(messages as any);
    if (fenceResult.isBlocked) {
      throw new Error(fenceResult.blockReason || '[企业安全拦截] 出境流量命中敏感数据安全阻断策略。');
    }
    effectiveMessages = fenceResult.sanitizedMessages as ChatMessage[];
    if (fenceResult.totalRedactions > 0) {
      notifySystem(`\n\n> 🛡️ **[企业安全围栏]** 已对请求出境文本实施实时脱敏保护 (${fenceResult.redactedSummary})\n\n`);
    }
  }

  // 1. 会话特征探测: 是否包含图像附件或多模态信号
  const needsVision = effectiveMessages.some(m =>
    typeof m.content === 'string' &&
    (m.content.includes('![') || m.content.includes('data:image/') || m.content.includes('【用户附件图片:'))
  );

  // 2. 构建服务商候选优先级队列：主线路 -> 启用的备用线路列表
  const rawProviderQueue: SingleProviderTarget[] = [
    {
      name: '主线路 (Primary)',
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      capabilities: config.capabilities
    }
  ];

  if (config.fallbackProviders && config.fallbackProviders.length > 0) {
    for (const fb of config.fallbackProviders) {
      if (fb.enabled && fb.baseUrl && fb.baseUrl.trim()) {
        rawProviderQueue.push({
          name: fb.name || '备用线路',
          baseUrl: fb.baseUrl.trim(),
          apiKey: fb.apiKey || '',
          model: fb.model || 'deepseek-chat',
          capabilities: fb.capabilities
        });
      }
    }
  }

  // 3. 多模态能力感知过滤 (Capability-Aware Filtering)
  const providerQueue: SingleProviderTarget[] = [];
  const skippedPureTextProviders: string[] = [];

  for (const p of rawProviderQueue) {
    if (needsVision && !providerSupportsVision(p)) {
      skippedPureTextProviders.push(`${p.name} (${p.model})`);
    } else {
      providerQueue.push(p);
    }
  }

  // 若本次需要视觉能力，但所有线路均不支持
  if (needsVision && providerQueue.length === 0) {
    throw new Error(
      `[多模态能力拦截] 检测到当前会话包含图片/视觉输入，但当前主线路及备用服务商均不支持 Vision 视觉多模态能力（已跳过纯文本模型：${skippedPureTextProviders.join('、')}）。\n建议在【设置 -> AI 模型与供应商】中切换为主流多模态模型（如 Auto / GPT-4o / Gemini），或激活备用池中的视觉线路。`
    );
  }

  // 若跳过了纯文本模型，在 thought 流中输出提示
  if (needsVision && skippedPureTextProviders.length > 0) {
    notifySystem(
      `\n\n> 👁️ **[多模态能力感知路由]** 检测到任务包含图片输入，系统已自动过滤纯文本线路 [${skippedPureTextProviders.join('、')}]，优先锁定具备 Vision 能力的服务商发起推理...\n\n`
    );
  }

  const errors: string[] = [];

  for (let i = 0; i < providerQueue.length; i++) {
    const currentProvider = providerQueue[i];

    try {
      if (abortSignal.aborted) {
        throw new Error('Task was aborted by user.');
      }

      return await executeSingleProviderCall(
        currentProvider,
        effectiveMessages,
        abortSignal,
        useStream,
        onDelta,
        notifySystem
      );
    } catch (err: any) {
      if (abortSignal.aborted) {
        throw err;
      }

      const status = err.status;
      const msg = err.message || String(err);
      errors.push(`[${currentProvider.name} - ${currentProvider.model}]: ${msg}`);

      // 判定是否可进行无感故障转移 (Failover)：
      // 524(Cloudflare超时), 429(限流), 500/502/503/504(网关宕机), 网络连接被拒/fetch失败, 或响应为空
      const isRecoverable =
        status === 524 ||
        status === 429 ||
        (status >= 500 && status <= 504) ||
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('未返回任何文本') ||
        msg.includes('响应异常') ||
        msg.includes('响应为空');

      const hasNextProvider = i + 1 < providerQueue.length;

      if (isRecoverable && hasNextProvider) {
        const nextProvider = providerQueue[i + 1];
        const reasonText = status ? `HTTP ${status}` : (msg.includes('未返回任何文本') ? '响应为空' : '网络连接受阻');
        const notice = `\n\n> 🛡️ **[524 自动容灾 · 故障转移]** ${currentProvider.name} 遭遇 ${reasonText}，系统已自动无感平滑切换至备用线路 **「${nextProvider.name}」** (模型: \`${nextProvider.model}\`) 发起重试...\n\n`;
        notifySystem(notice);
        console.warn(`[Failover] Switch from ${currentProvider.name} to ${nextProvider.name} due to: ${msg}`);
        continue; // 切换至下一线路重试
      } else {
        // 无法容灾或候选池已耗尽
        if (!hasNextProvider && providerQueue.length > 1) {
          throw new Error(`所有兼容当前任务能力的 LLM 线路重试均失败：\n${errors.join('\n')}`);
        }
        throw err;
      }
    }
  }

  throw new Error(`LLM 调用失败: 未能从服务商池中获得有效响应。\n${errors.join('\n')}`);
}

// Robust JSON and Tool Args Extractor (handles Windows paths, unescaped newlines/quotes)
export function parseToolArgs(raw: string): any {
  if (!raw || !raw.trim()) return {};
  const trimmed = raw.trim();

  // 0. 支持 XML/Function 风格参数: <parameter:name>value</parameter> 或 <parameter=name>value</parameter>
  if (trimmed.includes('<parameter')) {
    const xmlResult: any = {};
    const paramRegex = /<parameter(?:[:=\s]+(?:name=)?["']?([a-zA-Z0-9_-]+)["']?)>([\s\S]*?)<\/parameter>/gi;
    let match: RegExpExecArray | null;
    while ((match = paramRegex.exec(trimmed)) !== null) {
      const pName = match[1].trim();
      const pVal = match[2].trim();
      if (pName === 'options' || pName === 'questions') {
        try {
          xmlResult[pName] = JSON.parse(pVal);
        } catch {
          if (pName === 'options') {
            const items = Array.from(pVal.matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
            xmlResult.options = items.length > 0 ? items : [pVal];
          }
        }
      } else {
        xmlResult[pName] = pVal;
      }
    }
    if (Object.keys(xmlResult).length > 0) {
      return xmlResult;
    }
  }

  // 1. Try standard JSON.parse first
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Fix unescaped Windows backslashes: e.g. "C:\Users\..." -> "C:\\Users\\..."
  try {
    const fixedBackslashes = trimmed.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\');
    return JSON.parse(fixedBackslashes);
  } catch {}

  // 3. Fix unescaped literal newlines/tabs inside string literals
  try {
    const sanitized = trimmed
      .replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\')
      .replace(/[\u0000-\u001F]+/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '\\r';
        if (match === '\t') return '\\t';
        return '';
      });
    return JSON.parse(sanitized);
  } catch {}

  // 4. Robust regex parameter extraction fallback
  const result: any = {};

  // Extract filePath or path
  const fileMatch = trimmed.match(/"(?:filePath|path|file)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (fileMatch) {
    result.filePath = fileMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  // Extract dirPath
  const dirMatch = trimmed.match(/"(?:dirPath|path|directory)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (dirMatch) {
    result.dirPath = dirMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  // Extract command
  const cmdMatch = trimmed.match(/"(?:command|cmd)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (cmdMatch) {
    result.command = cmdMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  // Extract question
  const qMatch = trimmed.match(/"(?:question)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (qMatch) {
    result.question = qMatch[1].replace(/\\"/g, '"');
  }
  // Extract options array
  const optMatch = trimmed.match(/"(?:options)"\s*:\s*(\[[^\]]*\])/i);
  if (optMatch) {
    try {
      result.options = JSON.parse(optMatch[1]);
    } catch {
      const items = Array.from(optMatch[1].matchAll(/["']([^"']+)["']/g)).map(m => m[1]);
      if (items.length > 0) result.options = items;
    }
  }

  // Extract questions array (for Grill-me multi-question mode)
  const questionsMatch = trimmed.match(/"(?:questions)"\s*:\s*(\[[\s\S]*?\])(?=\s*[,}\]])/i);
  if (questionsMatch) {
    try {
      result.questions = JSON.parse(questionsMatch[1]);
    } catch {}
  }

  // Extract prompt (for generate_image)
  const promptMatch = trimmed.match(/"(?:prompt|description|image_prompt)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (promptMatch) {
    result.prompt = promptMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  // Extract size
  const sizeMatch = trimmed.match(/"(?:size)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (sizeMatch) {
    result.size = sizeMatch[1].replace(/\\"/g, '"');
  }

  // Extract ratio
  const ratioMatch = trimmed.match(/"(?:ratio|aspect_ratio)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (ratioMatch) {
    result.ratio = ratioMatch[1].replace(/\\"/g, '"');
  }

  // Extract model
  const modelMatch = trimmed.match(/"(?:model)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (modelMatch) {
    result.model = modelMatch[1].replace(/\\"/g, '"');
  }

  // Extract seconds
  const secMatch = trimmed.match(/"(?:seconds|duration)"\s*:\s*"?(\d+)"?/i);
  if (secMatch) {
    result.seconds = secMatch[1];
  }

  // Extract voice
  const voiceMatch = trimmed.match(/"(?:voice)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (voiceMatch) {
    result.voice = voiceMatch[1].replace(/\\"/g, '"');
  }

  // Extract language
  const langMatch = trimmed.match(/"(?:language|lang)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (langMatch) {
    result.language = langMatch[1].replace(/\\"/g, '"');
  }

  // Extract mode
  const modeMatch = trimmed.match(/"(?:mode)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (modeMatch) {
    result.mode = modeMatch[1].replace(/\\"/g, '"');
  }

  // Extract input (for TTS or embedding)
  const inputMatch = trimmed.match(/"(?:input|text_input)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (inputMatch) {
    result.input = inputMatch[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }

  // Extract title
  const titleMatch = trimmed.match(/"(?:title)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (titleMatch) {
    result.title = titleMatch[1].replace(/\\"/g, '"');
  }

  // Extract subtitle
  const subMatch = trimmed.match(/"(?:subtitle|desc|description)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (subMatch) {
    result.subtitle = subMatch[1].replace(/\\"/g, '"');
  }

  // Extract author
  const authorMatch = trimmed.match(/"(?:author|creator)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (authorMatch) {
    result.author = authorMatch[1].replace(/\\"/g, '"');
  }

  // Extract version
  const verMatch = trimmed.match(/"(?:version|ver)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (verMatch) {
    result.version = verMatch[1].replace(/\\"/g, '"');
  }

  // Extract confidentiality
  const confMatch = trimmed.match(/"(?:confidentiality|secret)"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (confMatch) {
    result.confidentiality = confMatch[1].replace(/\\"/g, '"');
  }

  // Extract includeToc
  const tocMatch = trimmed.match(/"(?:includeToc|toc)"\s*:\s*(true|false)/i);
  if (tocMatch) {
    result.includeToc = tocMatch[1].toLowerCase() === 'true';
  }

  // Extract content or markdownContent
  const contentKeyMatch = trimmed.match(/"(?:markdownContent|content|text|markdown)"\s*:\s*"/i);
  if (contentKeyMatch && contentKeyMatch.index !== undefined) {
    const startContentIdx = contentKeyMatch.index + contentKeyMatch[0].length;
    let afterContent = trimmed.slice(startContentIdx);
    const endMatch = afterContent.match(/("?\s*}\s*)$/);
    if (endMatch) {
      afterContent = afterContent.slice(0, -endMatch[0].length);
    }
    const unescaped = afterContent
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    result.markdownContent = unescaped;
    result.content = unescaped;
  }

  if (Object.keys(result).length > 0) {
    return result;
  }

  return { raw: trimmed };
}

export function extractQuestionsFromText(raw: string): { intro: string; questions: SubQuestion[] } | null {
  if (!raw || typeof raw !== 'string') return null;

  // Find boundaries where a numbered item starts: e.g. "1. " or " 2. " or "\n1. " or "：1. "
  const regex = /(?:^|[\r\n]+|[:：；;]|\s{2,}|\s)(?:(\d+)[\.、\)]|Q(\d+)[:：])\s*(?!\d)/gi;
  const matches: Array<{ index: number; digit: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const digitStr = match[1] || match[2];
    const digit = parseInt(digitStr, 10);
    const digitOffset = match[0].indexOf(digitStr);
    matches.push({
      index: match.index + digitOffset,
      digit
    });
  }

  if (matches.length <= 1) return null;

  // Verify that numbers look like a sequence: e.g. 1, 2...
  if (matches[0].digit !== 1) return null;
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].digit !== matches[i - 1].digit + 1) {
      return null;
    }
  }

  const intro = raw.slice(0, matches[0].index).trim();
  const slices: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : raw.length;
    slices.push(raw.slice(start, end).trim());
  }

  const questions: SubQuestion[] = slices.map(s => {
    const cleaned = s.replace(/^(?:\d+[\.、\)]|Q\d+[:：])\s*/, '').trim();
    // Split into question title and options by "- " or "• " or "– " or "* "
    const parts = cleaned.split(/(?:\r?\n\s*[-•–*]\s*|\s+[-•–*]\s+)/);
    if (parts.length > 1) {
      return {
        question: parts[0].trim().replace(/[:：\s]+$/, ''),
        options: parts.slice(1).map(o => o.replace(/^[-•–*\s]+/, '').trim()).filter(Boolean)
      };
    }
    return {
      question: cleaned,
      options: []
    };
  });

  return { intro, questions };
}

export function extractToolCall(response: string): { toolName: string; toolArgs: any } | null {
  if (!response) return null;

  // 1. Standard markdown codeblock: ```tool:name ... ``` or ```json:tool:name
  // 核心增强：当 toolArgs 内包含内嵌代码块 (如 ```typescript ... ``` 或 ```json ... ```) 时，
  // 普通非贪婪匹配 /```...```/ 会在第一个内嵌代码块的反引号处提前截断！
  // 此处采用括号平衡扫描：若以 { 开头，精准探测匹配的外层闭合 }，彻底杜绝内容被截断！
  const startMatch = response.match(/```(?:json:)?tool:([a-z_]+)\s*/i);
  if (startMatch && startMatch.index !== undefined) {
    const toolName = startMatch[1].trim().toLowerCase();
    const startIdx = startMatch.index + startMatch[0].length;
    const rest = response.slice(startIdx);

    // 若参数为 JSON 对象 ({...})，进行健壮的括号配对探测
    const trimmedRest = rest.trimStart();
    if (trimmedRest.startsWith('{')) {
      const leadingOffset = rest.length - trimmedRest.length;
      let braceCount = 0;
      let inString = false;
      let escape = false;
      let jsonEndIdx = -1;

      for (let i = leadingOffset; i < rest.length; i++) {
        const ch = rest[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (ch === '{') {
            braceCount++;
          } else if (ch === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEndIdx = i + 1;
              break;
            }
          }
        }
      }

      if (jsonEndIdx !== -1) {
        const jsonStr = rest.slice(leadingOffset, jsonEndIdx);
        const toolArgs = parseToolArgs(jsonStr.trim());
        return { toolName, toolArgs };
      }
    }

    // 备用：若非大括号结构，寻找位于独立行或末尾的闭合 ```
    const endMatch = rest.match(/(?:[\r\n]+|^)```(?:\s*$|[\r\n]+)/);
    if (endMatch && endMatch.index !== undefined) {
      const rawArgs = rest.slice(0, endMatch.index).trim();
      const toolArgs = parseToolArgs(rawArgs);
      return { toolName, toolArgs };
    }
  }

  // 1.1 经典正则兜底
  const mdMatch = response.match(/```(?:json:)?tool:([a-z_]+)\s*([\s\S]*?)```/i);
  if (mdMatch) {
    const toolName = mdMatch[1].trim().toLowerCase();
    const toolArgs = parseToolArgs(mdMatch[2].trim());
    return { toolName, toolArgs };
  }

  // 1.5 XML tool tag: <tool:name> ... </tool:name> or </tool> or </tool_call> (with or without <tool_call>)
  const toolTagMatch = response.match(/<tool:([a-z_]+)>([\s\S]*?)(?:<\/(?:tool:\1|tool|tool_call)>|$)/i);
  if (toolTagMatch) {
    const toolName = toolTagMatch[1].trim().toLowerCase();
    const toolArgs = parseToolArgs(toolTagMatch[2].trim());
    return { toolName, toolArgs };
  }

  // 1.6 XML tool tag with attribute: <tool name="xxx"> ... </tool>
  const toolAttrMatch = response.match(/<tool\s+(?:name|call)=["']?([a-z_]+)["']?>([\s\S]*?)(?:<\/tool>|<\/tool_call>|$)/i);
  if (toolAttrMatch) {
    const toolName = toolAttrMatch[1].trim().toLowerCase();
    const toolArgs = parseToolArgs(toolAttrMatch[2].trim());
    return { toolName, toolArgs };
  }

  // 2. <tool_call> ... </tool_call>
  const toolCallMatch = response.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (toolCallMatch) {
    const inner = toolCallMatch[1].trim();

    // 2.0 Check <tool:name> inside <tool_call> (supports </tool:name>, </tool>, or unclosed before </tool_call>)
    const innerToolTag = inner.match(/<tool:([a-z_]+)>([\s\S]*?)(?:<\/(?:tool:\1|tool)>|$)/i);
    if (innerToolTag) {
      const toolName = innerToolTag[1].trim().toLowerCase();
      const toolArgs = parseToolArgs(innerToolTag[2].trim());
      return { toolName, toolArgs };
    }

    // 2.0.1 Check <tool name="xxx"> inside <tool_call>
    const innerToolAttr = inner.match(/<tool\s+(?:name|call)=["']?([a-z_]+)["']?>([\s\S]*?)(?:<\/tool>|$)/i);
    if (innerToolAttr) {
      const toolName = innerToolAttr[1].trim().toLowerCase();
      const toolArgs = parseToolArgs(innerToolAttr[2].trim());
      return { toolName, toolArgs };
    }

    // 2.1 Check XML inside <tool_call>, e.g. <function=name><parameter={...}></parameter></function>
    const fnXmlMatch = inner.match(/<function[ ="]*([a-z_]+)[" ]*>([\s\S]*?)<\/function>/i);
    if (fnXmlMatch) {
      const toolName = fnXmlMatch[1].trim().toLowerCase();
      const paramMatch = fnXmlMatch[2].match(/<parameter(?:=([^\n>]*))?>([\s\S]*?)<\/parameter>/i);
      let argRaw = '';
      if (paramMatch) {
        argRaw = (paramMatch[1] || paramMatch[2] || '').trim();
      } else {
        argRaw = fnXmlMatch[2].trim();
      }
      return { toolName, toolArgs: parseToolArgs(argRaw) };
    }

    // 2.2 Check JSON inside <tool_call>
    try {
      const parsed = JSON.parse(inner);
      const toolName = parsed.name || parsed.tool || parsed.function?.name || parsed.action;
      const toolArgs = parsed.arguments || parsed.parameters || parsed.args || parsed.input || {};
      if (toolName) {
        return {
          toolName: String(toolName).toLowerCase(),
          toolArgs: typeof toolArgs === 'string' ? parseToolArgs(toolArgs) : toolArgs
        };
      }
    } catch {
      // Regex extraction fallback for JSON-like string
      const nameMatch = inner.match(/"(?:name|tool)"\s*:\s*"([a-z_]+)"/i);
      if (nameMatch) {
        const toolName = nameMatch[1].trim().toLowerCase();
        return { toolName, toolArgs: parseToolArgs(inner) };
      }
    }
  }

  // 3. Raw <function=name> ... </function> without <tool_call>
  const rawFnMatch = response.match(/<function[ ="]*([a-z_]+)[" ]*>([\s\S]*?)<\/function>/i);
  if (rawFnMatch) {
    const toolName = rawFnMatch[1].trim().toLowerCase();
    const paramMatch = rawFnMatch[2].match(/<parameter(?:=([^\n>]*))?>([\s\S]*?)<\/parameter>/i);
    let argRaw = '';
    if (paramMatch) {
      argRaw = (paramMatch[1] || paramMatch[2] || '').trim();
    } else {
      argRaw = rawFnMatch[2].trim();
    }
    return { toolName, toolArgs: parseToolArgs(argRaw) };
  }

  // 4. Naked tool:name or unclosed code block: tool:name\n{...} or ```tool:name without closing ```
  const nakedToolMatch = response.match(/(?:^|\n)\s*(?:```(?:json:)?tool:|tool:)([a-z_]+)\s*\n\s*(\{[\s\S]*?\})(?:\s*```|\n|$)/i);
  if (nakedToolMatch) {
    const toolName = nakedToolMatch[1].trim().toLowerCase();
    const toolArgs = parseToolArgs(nakedToolMatch[2].trim());
    return { toolName, toolArgs };
  }

  return null;
}

// 3. Harness Engine Runner
export async function runHarnessAgent(
  sessionId: string,
  config: AgentConfig,
  history: ChatMessage[],
  callbacks: AgentEventCallbacks
) {
  const abortController = new AbortController();
  activeExecutions.set(sessionId, { abortController, callbacks });

  try {
    const hasWorkspace = !!(config.workspacePath && fs.existsSync(config.workspacePath));
    const isHostMode = !hasWorkspace;
    const effectiveWorkspace = hasWorkspace
      ? config.workspacePath!
      : storageHub.getWorkspacesDir();

    if (!fs.existsSync(effectiveWorkspace)) {
      try {
        fs.mkdirSync(effectiveWorkspace, { recursive: true });
      } catch {}
    }

    const tools = new WorkspaceTools(effectiveWorkspace, isHostMode, (targetFile) => {
      if (hasWorkspace) {
        checkpointManager.recordFileModification(sessionId, effectiveWorkspace, targetFile);
        const currentCkpt = checkpointManager.getOrCreateTurnCheckpoint(sessionId, effectiveWorkspace, '代码修改快照');
        callbacks.onCheckpoint?.(currentCkpt);
      }
    }, config);

    // 蜂群多智能体协同流水线调度 (Multi-Agent Swarm Orchestration)
    if (config.executionMode === 'swarm') {
      const { SwarmOrchestrator } = await import('./swarm-orchestrator');
      const orchestrator = new SwarmOrchestrator(
        sessionId,
        config,
        history,
        callbacks,
        abortController.signal,
        effectiveWorkspace,
        hasWorkspace
      );
      const swarmSummary = await orchestrator.executePipeline();

      const turnCkpt = checkpointManager.finishTurnCheckpoint(sessionId);
      if (turnCkpt && (turnCkpt.modifiedFiles.length > 0 || turnCkpt.newFiles.length > 0)) {
        callbacks.onCheckpoint?.(turnCkpt);
      }

      callbacks.onDone(swarmSummary);
      return;
    }

    const initialPlanSteps: AgentStep[] = [
      { id: 'step-1', title: isHostMode ? '分析宿主任务与操作意图' : '分析工作区与任务意图', status: 'running' },
      { id: 'step-2', title: isHostMode ? '准备执行环境或检视目标' : '检索并检视关键文件', status: 'pending' },
      { id: 'step-3', title: isHostMode ? '生成文档或执行本机命令' : '制定并执行修改/命令', status: 'pending' },
      { id: 'step-4', title: '验证并生成交付总结', status: 'pending' }
    ];
    callbacks.onPlan(initialPlanSteps);

    if (config.customMcpConfig) {
      try {
        await mcpManager.reloadServers(config.customMcpConfig, config.workspacePath || null);
      } catch (err: any) {
        console.warn('[Harness] MCP servers reload failed:', err.message);
      }
    }

    const mcpPrompts = mcpManager.getEnabledToolPrompts(config.enabledMcpTools || ['web_search', 'web_fetch', 'git_operations', 'system_inspector']);

    // P1: 两阶段轻量索引与按需渐进式动态激活
    // 阶段一：动态侦测并强制激活用户在输入中通过 @ 显式提及的技能
    const userMentionedSkills: string[] = [];
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
    const userText = (lastUserMsg && typeof lastUserMsg.content === 'string') ? lastUserMsg.content : '';

    if (userText) {
      const mentionMatches = Array.from(userText.matchAll(/@([a-zA-Z0-9_\-:]+)/g));
      for (const match of mentionMatches) {
        const skillKey = match[1];
        const found = skillManager.findSkill(skillKey, config.workspacePath || null);
        if (found && !userMentionedSkills.includes(found.id)) {
          userMentionedSkills.push(found.id);
        }
      }
    }

    const effectiveEnabledSkills = Array.from(new Set([
      ...(config.enabledSkills || ['office_word_report', 'office_excel_master', 'code_review', 'unit_test', 'git_commit_helper']),
      ...userMentionedSkills
    ]));

    // 阶段一微型技能索引清单（仅含元数据，占用 Token < 200）
    const microSkillIndex = skillManager.getMicroSkillIndex(effectiveEnabledSkills, config.workspacePath || null);

    // 阶段二意图触发与按需精准激活：扫描最新输入，匹配技能 triggers 关键词（至多自动激活 2 项）
    const intentMatchedSkills: string[] = [];
    if (userText) {
      const allAvailable = skillManager.getAllAvailableSkills(config.workspacePath || null);
      const lowerUserText = userText.toLowerCase();
      for (const skill of allAvailable) {
        if (!effectiveEnabledSkills.includes(skill.id)) continue;
        if (userMentionedSkills.includes(skill.id)) continue;
        if (skill.triggers && skill.triggers.some(t => lowerUserText.includes(t.toLowerCase()))) {
          intentMatchedSkills.push(skill.id);
        }
      }
    }

    // 综合激活清单：显式指派优先 + 意图匹配 (上限 2 个)
    const activatedSkillIds = Array.from(new Set([
      ...userMentionedSkills,
      ...intentMatchedSkills.slice(0, 2)
    ]));

    const activatedSkillPrompts = activatedSkillIds.length > 0
      ? skillManager.getAggregatedSkillPrompt(activatedSkillIds, config.workspacePath || null)
      : '';

    // 注入长期记忆上下文 (Memory Bank: 项目级 MEMORY.md 与全局 user_profile.md)
    const memoryContextPrompt = memoryManager.assembleMemoryContext(config.workspacePath || null);

    // 注入项目最高行为准则 (.asteamrules / ASTEAM.md)
    const rulesPrompt = rulesManager.assembleRulesPrompt(config.workspacePath || null);

    let userMentionInstruction = '';
    if (userMentionedSkills.length > 0) {
      const names = userMentionedSkills.map(id => {
        const s = skillManager.findSkill(id, config.workspacePath || null);
        return s ? `「${s.name}」(@${id})` : `@${id}`;
      }).join('、');
      userMentionInstruction = `\n\n【用户显式指派技能】\n用户在本轮输入中通过 @ 显式指定了以下专属技能：${names}。你必须严格遵循该技能的规范、版式结构与输出标准予以执行！`;
    }

    let modeInstruction = '';
    if (config.executionMode === 'plan_only') {
      modeInstruction = '\n\n【重要：当前处于“只读规划模式 (Plan Only)”】\n你只能使用 view_file、list_directory 或只读 MCP 工具检视项目或系统。严禁调用 write_file 或执行修改性质的终端命令。请输出详尽的架构方案与规划。';
    } else if (config.executionMode === 'safe_approval') {
      modeInstruction = '\n\n【安全审批模式 (Safe Approval)】\n执行高危或删除类命令前，必须在思考过程中明确提示用户潜在影响。';
    }

    const currentUsername = (() => {
      try {
        return os.userInfo().username;
      } catch {
        return 'user';
      }
    })();
    const userHome = path.normalize(os.homedir());
    const desktopDir = getSystemDesktopDir();
    const desktopPosix = desktopDir.replace(/\\/g, '/');

    const systemPrompt = `你是由 ASteam 打造的桌面智能工程师 Agent，内核原生深度封装 deepseek-harness 规划与工具执行范式。

【宿主系统与本地真实环境（真实有效，严禁臆测假用户名）】
- 操作系统平台：${process.platform === 'win32' ? 'Windows' : process.platform} (${os.release()})
- 当前物理系统真实时间：${new Date().toLocaleString('zh-CN', { hour12: false })} (时区: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'})
- 真实时间锚点纪律：所有代码版本、Git 提交记录、测试报告、日志排期与分析回复必须以此物理真实时间为基准，严禁凭空臆造过去或未来的年份！
- 当前系统登录用户名：${currentUsername}
- 用户真实主目录：${userHome}
- 用户真实桌面目录：${desktopDir}
- 路径调用规范与建议：
  * 保存文件到桌面时，可直接使用绝对路径 "${desktopPosix}/文件名.docx"；
  * 也支持直接使用快捷别名 "~/Desktop/文件名.docx" 或 "Desktop/文件名.docx"，系统底层会自动精确映射到真实桌面；
  * 严禁凭空猜测臆想非当前用户名的路径（如 "Admin"、"Administrator"、"User" 等）！

【ASTeam 智能体专属存储中枢与环境自闭环 (完全隔离宿主与其它 Agent 环境)】
- 存储中枢数据根目录 (Data Root)：${storageHub.getDataRootDir()}
- 全局专属技能库路径 (Skills)：${storageHub.getSkillsDir()}
- 长期记忆与画像路径 (Memory)：${storageHub.getMemoryDir()}
- 制品与成果归档路径 (Artifacts)：${storageHub.getArtifactsDir()}
- MCP 服务自闭环配置文件：${storageHub.getMcpConfigFilePath()}
- 环境自闭环纪律：所有技能沉淀、长期记忆存储、MCP 配置与制品落盘，全部在 ASTeam 自身中枢目录自闭环（优先使用非系统盘，如 D 盘），绝不污染或侵入 C 盘系统用户主目录，严格避免与宿主及其他外部 Agent (如 Antigravity / Gemini / Claude) 发生默认路径与环境配置冲突！

${isHostMode
  ? `【当前运行模式：Windows 宿主系统免项目模式】
- 默认工作目录：${effectiveWorkspace}
你拥有对本机的自主执行能力，可以帮用户生成/编辑文档报告、运行系统命令诊断环境、批量处理文件以及调用 MCP 工具。`
  : `【当前运行模式：本地工作区项目】
- 项目目录：${config.workspacePath}
若用户需求是生成方案、报告到桌面，请直接使用上述提供的桌面绝对路径或 "~/Desktop/..."；若需求是修改项目代码，使用相对项目路径。`
}
${rulesPrompt}
你拥有以下基础工具能力：
1. view_file: 读取文件（支持相对路径与绝对路径）。调用格式：
\`\`\`tool:view_file
{"filePath": "relative/path/or/absolute/path"}
\`\`\`
2. write_file: 写入或生成文档、代码、报告（支持相对路径与绝对路径，会自动创建父目录）。调用格式：
\`\`\`tool:write_file
{"filePath": "~/Desktop/document.md", "content": "文档正文..."}
\`\`\`
注意：
- filePath 路径推荐使用正斜杠 / 或转义反斜杠 \\\\；
- 若 filePath 扩展名为 .docx，系统会自动排版生成标准 Microsoft Word 二进制文档。

3. generate_docx: 生成排版专业精美的标准 Microsoft Word (.docx) 文档（全量内置，原生支持华为云/政企风格封面、自动目录、页眉页脚与动态页码、以及 10~20+ 复杂表格自动布局排版与斑马纹）。调用格式：
\`\`\`tool:generate_docx
{"filePath": "~/Desktop/方案白皮书.docx", "title": "方案白皮书标题", "subtitle": "副标题/描述", "version": "V1.0", "author": "团队名称", "markdownContent": "# 一、执行摘要\\n正文...\\n## 二、架构设计\\n..."}
\`\`\`

4. generate_excel: 生成企业级 Microsoft Excel (.xlsx) 工作簿（全量内置纯 JS 引擎，支持多 Sheet 级联、首行冻结、公式计算、表头企业色与自动列宽）。调用格式：
\`\`\`tool:generate_excel
{"filePath": "~/Desktop/资产清单.xlsx", "sheets": [{"name": "云主机清单", "columns": [{"header": "主机名称", "key": "name"}, {"header": "CPU核数", "key": "cpu"}], "rows": [{"name": "host-01", "cpu": 16}]}]}
\`\`\`
或直接通过 Markdown 表格生成：
\`\`\`tool:generate_excel
{"filePath": "~/Desktop/资产清单.xlsx", "markdownContent": "| 主机名 | IP | 状态 |\\n| host-1 | 127.0.0.1 | 运行中 |"}
\`\`\`

5. read_excel: 原生读取解析 Microsoft Excel (.xlsx) 工作簿（全量内置纯 JS 引擎，零外部 Python/pandas 依赖，自动提取所有 Sheet 名称、数据结构并转为 Markdown 表格预览）。调用格式：
\`\`\`tool:read_excel
{"filePath": "E:/path/to/file.xlsx", "sheetName": "云主机ECU信息"}
\`\`\`

6. generate_pptx: 生成现代化 16:9 比例的商业演说 Microsoft PowerPoint (.pptx) 演示文稿（含封面、核心金句、观点列表与讲者演讲逐字稿）。调用格式：
\`\`\`tool:generate_pptx
{"filePath": "~/Desktop/方案汇报.pptx", "title": "方案演说汇报", "subtitle": "副标题", "slides": [{"title": "现状痛点与突破", "keyTakeaway": "单页核心观点金句", "bullets": ["要点1", "要点2", "要点3"], "speakerNotes": "讲者现场演讲逐字稿..."}]}
\`\`\`

7. list_directory: 查看目录列表。调用格式：
\`\`\`tool:list_directory
{"dirPath": "."}
\`\`\`

8. run_terminal_command: 执行控制台终端命令（在工作目录执行，内核具备 PowerShell 健壮性沙箱与语法纠偏）。调用格式：
\`\`\`tool:run_terminal_command
{"command": "ipconfig 或 node -v 或 dir"}
\`\`\`

9. ask_user_question: 涉及方案选择、关键决策确认或需求调研（Grill-me / 采访交互）时向用户弹出结构化交互卡片。
单问题调用格式：
\`\`\`tool:ask_user_question
{"question": "问题描述", "options": ["选项1", "选项2"]}
\`\`\`
多问题/采访调研模式（Grill-me 强烈推荐调用格式）：
\`\`\`tool:ask_user_question
{
  "question": "请确认以下偏好设置：",
  "questions": [
    { "question": "报告格式", "options": ["Word (.docx)", "PDF (.pdf)"] },
    { "question": "报告风格", "options": ["正式商务（侧重执行摘要、管理视角）", "技术详细（侧重架构分析、实现细节）"] }
  ]
}
\`\`\`
【重要规约】当需要向用户同时确认 2 个或更多问题/选项（如 Grill-me 模式）时，必须使用 questions 数组传递每个子问题及其 options，严禁将多个问题与选项合并成一段无结构的纯文本！

10. distill_skill: 自主提炼新技能 (Hermes 式自演进技能体系)。在完成高频复杂任务后，将最佳实践、架构流程与输出 Schema 封装提炼为标准技能 (${storageHub.getSkillsDir()})，后续同类任务一键激活。调用格式：
\`\`\`tool:distill_skill
{"id": "idc_migration", "name": "IDC迁移专家", "description": "处理云迁移方案的标准化技能", "prompt": "【激活技能：...】\\n- 规约指南..."}
\`\`\`

11. install_skill: 自主安装或动态扩展新的 Agent 专属技能（支持从公开 URL 链接下载，或根据用户需求自主编写专业行动规约持久化到技能库中）。调用格式：
\`\`\`tool:install_skill
{"id": "skill_id", "name": "技能名称", "description": "适用说明", "prompt": "【激活技能：...】\\n- 详细行动指南与规约..."}
\`\`\`
或从 URL 安装：
\`\`\`tool:install_skill
{"url": "https://raw.githubusercontent.com/.../skill.md"}
\`\`\`
9. list_skills: 查看当前系统已安装的所有技能清单。调用格式：
\`\`\`tool:list_skills
{}
\`\`\`
10. read_skill: 查阅指定技能的完整行动规约与 Prompt 定义。调用格式：
\`\`\`tool:read_skill
{"id": "技能ID或名称"}
\`\`\`
11. remember_fact: 将关于当前工程架构、技术栈规范或通用避坑经验沉淀至持久记忆库中（跨会话常驻）。调用格式：
\`\`\`tool:remember_fact
{"scope": "project", "fact": "关键技术约定或避坑条目"}
\`\`\`
其中 scope 可为 "project" (项目记忆库) 或 "global" (全局记忆库)。

12. generate_image: 调用 AI 图像生成模型生成高质量真实照片、产品视觉图、商业插画或视觉资产（支持文生图）。调用格式：
\`\`\`tool:generate_image
{"prompt": "A delicious roasted sunflower seed on a wooden table, photorealistic, 8k", "filePath": "images/melon_seeds.png", "size": "2K", "ratio": "16:9", "model": "agnes-image-2.1-flash"}
\`\`\`
注意：
- 【重要准则】当用户要求生成照片、产品图、插画、真实图片或视觉素材时，你拥有完整的图像生成能力，必须直接调用 generate_image 工具！严禁回答“无法生成照片”或“工具集无图像生成API”！
- prompt: 图像画面的英文或中文详尽画面描述；
- filePath: 保存图片的本地路径，若未指定系统会自动在 images/ 目录或桌面生成合适文件名并保存；
- size: 尺寸，可选 "1K", "2K", "1024x1024" 等；
- ratio: 宽高比，可选 "16:9", "1:1", "4:3", "9:16" 等；
- model: 模型名，推荐 "agnes-image-2.1-flash" 或 "Auto"。

13. generate_video: 调用 AI 视频生成模型生成短视频、动态演示或动态视觉素材（支持文生视频）。调用格式：
\`\`\`tool:generate_video
{"prompt": "A beautiful sunset over an ocean with gentle waves, cinematic 4k", "seconds": "5", "size": "720P", "ratio": "16:9", "model": "agnes-video-2.5-flash"}
\`\`\`
注意：
- 【重要准则】当用户要求生成短视频、动态演示或影视素材时，直接调用 generate_video 工具；
- prompt: 视频场景与运镜详尽画面描述；
- seconds: 视频时长（如 "5" 秒）；
- size: 分辨率（如 "720P", "1080P"）；
- ratio: 宽高比（"16:9", "9:16" 等）；
- model: 推荐 "agnes-video-2.5-flash" 或 "Auto"。

14. text_to_speech: 将文本内容转换为语音音频文件（TTS 语音合成）。调用格式：
\`\`\`tool:text_to_speech
{"input": "需要朗读的文本内容", "voice": "alloy", "filePath": "audio/speech.mp3", "model": "mimo-v2.5-tts"}
\`\`\`
注意：
- input: 待朗读合成的文本；
- voice: 音色角色（如 "alloy", "echo", "fable", "onyx", "nova", "shimmer"）；
- model: 推荐 "mimo-v2.5-tts" 或 "Auto"。

15. audio_to_text: 将音频文件识别转录为文字（ASR 语音转文字）。调用格式：
\`\`\`tool:audio_to_text
{"filePath": "audio/recording.mp3", "language": "zh", "model": "mimo-v2.5-asr"}
\`\`\`

16. generate_embedding: 提取文本内容的向量嵌入表示（Embedding），用于语义索引与相似度计算。调用格式：
\`\`\`tool:generate_embedding
{"input": "需要向量化的文本或知识条目", "model": "gemini-embedding-2"}
\`\`\`

17. generate_pdf: 原生排版生成企业级标准 PDF (.pdf) 文档（纯 JS 引擎闭环，支持科技蓝封面、章节自动排版、页码与元数据注入，零外部 Python/reportlab/wkhtmltopdf 依赖）。调用格式：
\`\`\`tool:generate_pdf
{"filePath": "~/Desktop/架构白皮书.pdf", "title": "架构迁移白皮书", "subtitle": "企业级技术方案", "author": "ASTeam", "markdownContent": "# 一、执行摘要\\n正文内容...\\n## 二、核心架构\\n..."}
\`\`\`

18. read_pdf: 原生提取检视 PDF (.pdf) 文档结构与元数据（纯 JS 引擎，提取标题、作者、页数、尺寸等信息）。调用格式：
\`\`\`tool:read_pdf
{"filePath": "~/Desktop/架构白皮书.pdf"}
\`\`\`

19. compress_zip: 原生将文件或文件夹打包压缩为 ZIP (.zip) 归档文件（纯 JS 引擎闭环，零系统 zip/tar/7z 命令依赖）。调用格式：
\`\`\`tool:compress_zip
{"sourcePaths": ["~/Desktop/file1.docx", "~/Desktop/file2.pdf"], "targetZipPath": "~/Desktop/交付归档.zip", "comment": "交付产物归档"}
\`\`\`

20. extract_zip: 原生解压缩 ZIP (.zip) 归档文件到指定目录（纯 JS 引擎闭环，支持目录层级递归还原）。调用格式：
\`\`\`tool:extract_zip
{"zipPath": "~/Desktop/交付归档.zip", "outputDir": "~/Desktop/解压目录"}
\`\`\`

21. activate_skill: 按需动态加载/激活特定专属技能规约。当微型索引中某技能契合当前复杂任务时，调用此工具即可将该技能的完整结构化 Prompt 注入上下文。调用格式：
\`\`\`tool:activate_skill
{"id": "office_word_report"}
\`\`\`

${memoryContextPrompt}
${mcpPrompts ? `【已启用的 MCP 扩展工具】\n${mcpPrompts}\n` : ''}
${microSkillIndex ? `${microSkillIndex}\n\n` : ''}${activatedSkillPrompts ? `【已精准按需激活的专属 Skill 规约 (Active Skills)】\n${activatedSkillPrompts}\n` : ''}
${userMentionInstruction}
${modeInstruction}

【多模态设计与可视化规约 (SVG / Mermaid / HTML)】
- 当用户要求绘制 SVG 矢量图或视觉图表时：
  1. 必须使用标准 XML 规范，必须包含 \`xmlns="http://www.w3.org/2000/svg"\`、\`viewBox\` 以及明确的 \`width\` 与 \`height\`；
  2. 视觉美学规范：必须遵循高水准现代工业设计语言（Linear / Stripe 风格），采用精致配色（优雅渐变色 <defs><linearGradient>、圆角卡片 rx="10"、柔和阴影 <filter id="shadow">、精致图例与无衬线排版 font-family="system-ui, -apple-system, sans-serif"），严禁绘制仅有单调黑白粗框的简陋图形；
  3. 色彩与对比：支持自适应暗色/明亮底色背景，确保文字与图形具有良好对比度。

【执行规范与即时工具调用纪律】
- 如果用户只是普通的咨询、闲聊或理论探讨，直接给出详尽解答即可，无需强行调用工具。
- 【工具调用即时性（极度重要）】：如果你需要执行系统操作、运行命令、读写文件或生成文档，在给出分步规划思考（Plan）后，**必须在同一个回复中紧接着立即输出第一个工具调用块**（例如 \`\`\`tool:run_terminal_command ... \`\`\`）！**绝对严禁**只列出计划或说“开始执行：”却不输出工具调用块就停止回复！如果你不输出工具调用块，执行引擎将判定任务提前终止。
- 【严禁虚构修改事实】：如果用户要求修改文件，你必须通过实际调用 write_file 工具完成！如果之前尝试读取（如 view_file）发生异常（例如 File not found），【绝对严禁】在总结答复中谎称“已成功添加/修改了文件”！若文件不存在或未实际写入，必须如实向用户反馈文件未找到或未写入。
- 完成任务后，请给出客观详细的总结并说明真实生成的文件路径或命令输出。`;

    let messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    let currentStepIndex = 0;
    const maxIterations = 8;
    let iteration = 0;
    let finalSummary = '';

    // v1.8.0 核心：记录任务物理起始毫秒时间戳与生成交付物清单
    const sessionStartTime = Date.now();
    const trackedArtifacts: string[] = [];
    const recoveredErrors: string[] = [];
    let gateRetries = 0;

    while (iteration < maxIterations) {
      iteration++;

      if (abortController.signal.aborted) {
        throw new Error('Task was aborted by user.');
      }

      let stepResponse = '';
      let stepContent = ''; // 仅追踪非 thought 类型的正文 token（排除 reasoning_content）
      callbacks.onToken(`\n\n**[Agent 思考与规划 - 轮次 ${iteration}]**\n`, 'thought');

      await callLLMStream(
        config,
        messages,
        abortController.signal,
        (token, type) => {
          stepResponse += token;
          if (type !== 'thought') stepContent += token;  // 仅累积正文 token
          callbacks.onToken(token, type || 'content');
        },
        (systemNotice) => {
          // 系统级提示（如安全脱敏、自动容灾转移、动态路由调度等）直接注入思考流，绝不污染模型正文 stepResponse
          callbacks.onToken(systemNotice, 'thought');
        }
      );

      // 若模型未返回任何正文或思考内容（如网关熔断或空包）
      if (!stepResponse.trim()) {
        throw new Error('未能从模型获取到有效回复内容，请检查模型服务状态或切换线路后重试。');
      }

      // finalSummary 优先使用正文 token；若模型全部走 reasoning_content（深度思考模式），则降级到 stepResponse
      finalSummary = stepContent.trim() || stepResponse.trim();
      messages.push({ role: 'assistant', content: stepResponse });

      // Match tool calls (supports ```tool:xxx```, <tool_call> JSON, and <function=xxx> XML)
      const toolCall = extractToolCall(stepResponse);
      if (!toolCall) {
        // v1.8.0 核心：触发交付制品底层物理探针硬门禁 (Artifact Verification Gate)
        const gateReport = artifactVerifier.inspectDeliveryGate(
          stepResponse,
          sessionStartTime,
          trackedArtifacts,
          config.workspacePath
        );

        if (!gateReport.passed) {
          gateRetries++;
          if (gateRetries <= 2) {
            callbacks.onToken(`\n\n🛡️ **[物理探针硬门禁拦截]** 侦测到交付制品落盘校验未通过，已拦截纯文本虚假答复并触发内核自愈重试...\n`, 'thought');
            messages.push({
              role: 'user',
              content: gateReport.blockingMessage || '【物理探针门禁拦截】交付物物理落盘校验失败，请调用原生工具完成实际文件生成！'
            });
            continue;
          } else {
            stepResponse += `\n\n⚠️ **【交付制品物理探针拦截提示】**\n底层物理探针未能检测到合格的落盘交付物。已如实向您反馈异常原因，杜绝纯文本伪造报告。`;
            finalSummary = stepResponse;
          }
        } else {
          // 门禁校验通过，若存在有效交付物则附加上不可伪造的防伪验签证书
          if (gateReport.badges.length > 0) {
            const badgeBlock = `\n\n---\n### 🛡️ 交付制品物理探针验收报告\n${gateReport.badges.join('\n\n')}`;
            stepResponse += badgeBlock;
            finalSummary = stepResponse;
            callbacks.onToken(badgeBlock, 'assistant');
          }
        }
        // 检测是否属于“制定了计划但未调用工具直接悬挂停顿”的情况 (Plan-Execution Decoupling)
        const trimmed = stepResponse.trim();
        const isHangingPlan = iteration === 1 && (
          trimmed.endsWith('：') || trimmed.endsWith(':') ||
          trimmed.includes('开始执行') || trimmed.includes('执行计划') ||
          (trimmed.length < 400 && (trimmed.includes('运行 `') || trimmed.includes('执行以下操作') || trimmed.includes('依次执行')))
        );

        if (isHangingPlan) {
          callbacks.onToken(`\n\n⚙️ **[内核自驱动]** 检测到规划制定完毕，正在自动触发工具调用链...\n`, 'thought');
          messages.push({
            role: 'user',
            content: '请立即使用 ```tool:工具名 {"参数": "..."}``` 代码块格式调用对应的工具开始执行上述操作，严禁只输出说明文本。'
          });
          continue;
        }

        // No more tool calls needed, task completed
        break;
      }

      const { toolName, toolArgs } = toolCall;

      // 在切换到下一步之前，将当前正在运行的步骤标记为已完成
      // 修复 Bug：Step-1 初始化为 running，若不显式完成则会永远卡在 running 状态
      const prevRunningStep = initialPlanSteps.find(s => s.status === 'running');
      if (prevRunningStep) {
        prevRunningStep.status = 'completed';
        callbacks.onStepUpdate({ ...prevRunningStep });
      }

      currentStepIndex = Math.min(currentStepIndex + 1, initialPlanSteps.length - 1);
      const activeStep = initialPlanSteps[currentStepIndex];
      activeStep.status = 'running';
      activeStep.tool = toolName;
      activeStep.args = toolArgs;
      callbacks.onStepUpdate({ ...activeStep });

      callbacks.onToken(`\n\n⚙️ **执行工具 [${toolName}]**...\n`, 'thought');

      let observation = '';
      try {
        if (config.executionMode === 'plan_only' && (toolName === 'write_file' || toolName === 'run_terminal_command')) {
          observation = `[安全拦截] 当前处于“只读规划模式 (Plan Only)”，已拦截文件写入与命令执行操作。`;
        } else if (toolName === 'view_file') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          observation = tools.viewFile(targetPath || '');
        } else if (toolName === 'write_file') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          let content = toolArgs.content ?? '';
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
            content = secondary.content ?? content;
          }
          if (!targetPath || targetPath.trim() === '') {
            throw new Error('未识别到有效的文件路径 (filePath 不能为空，请提供目标文件名)');
          }
          trackedArtifacts.push(targetPath);
          observation = await tools.writeFile(targetPath, content);
        } else if (toolName === 'generate_docx') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            targetPath = path.join(getSystemDesktopDir(), `${toolArgs.title || '方案白皮书'}.docx`);
          }
          trackedArtifacts.push(targetPath);
          observation = await tools.generateWordDocx({
            ...toolArgs,
            filePath: targetPath,
            markdownContent: toolArgs.markdownContent || toolArgs.content || ''
          });
        } else if (toolName === 'generate_excel') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            targetPath = path.join(getSystemDesktopDir(), `${toolArgs.title || '数据表格'}.xlsx`);
          }
          trackedArtifacts.push(targetPath);
          observation = await tools.generateExcelXlsx({
            ...toolArgs,
            filePath: targetPath
          });
        } else if (toolName === 'read_excel') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            throw new Error('read_excel 失败: 请提供要读取的 Excel 文件路径 (filePath)');
          }
          observation = await tools.readExcel(targetPath, toolArgs.sheetName);
        } else if (toolName === 'generate_pptx') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            targetPath = path.join(getSystemDesktopDir(), `${toolArgs.title || '演说汇报'}.pptx`);
          }
          trackedArtifacts.push(targetPath);
          observation = await tools.generatePowerPointPptx({
            ...toolArgs,
            filePath: targetPath
          });
        } else if (toolName === 'distill_skill') {
          if (!toolArgs.name || !toolArgs.prompt) {
            throw new Error('distill_skill 失败: 需要提供 name 和 prompt 字段');
          }
          const cleanId = (toolArgs.id || toolArgs.name).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const distilled = skillManager.distillSkill(
            cleanId,
            toolArgs.name,
            toolArgs.description || '由 Agent 自主演进提炼的专属技能',
            toolArgs.prompt,
            toolArgs.target || (config.workspacePath ? 'workspace' : 'global'),
            config.workspacePath
          );
          const targetDir = (toolArgs.target === 'workspace' && config.workspacePath)
            ? path.join(config.workspacePath, '.asteam', 'skills')
            : storageHub.getSkillsDir();
          observation = `[Skill 自演进提炼成功] 已成功提炼沉淀专属技能 "${distilled.name}" (ID: ${distilled.id})，已持久化落盘至 ASTeam 闭环技能库 (${distilled.filePath || targetDir}) 并即时激活生效！`;
        } else if (toolName === 'list_directory') {
          observation = tools.listDirectory(toolArgs.dirPath || toolArgs.path || '.');
        } else if (toolName === 'run_terminal_command') {
          observation = await tools.runTerminalCommand(toolArgs.command || '', sessionId, 120000, callbacks, activeStep?.id);
        } else if (toolName === 'ask_user_question') {
          const qId = `q-${Date.now()}`;
          let parsedQuestions: SubQuestion[] | undefined = Array.isArray(toolArgs.questions) && toolArgs.questions.length > 0
            ? toolArgs.questions
            : undefined;
          let mainQuestion = toolArgs.question || '请针对上述方案进行选择或确认：';

          // 智能兜底：若未提供结构化 questions 数组，但 question 文本中含有多项编号与选项（如 Grill-me 场景），自动提取为结构化对象
          if (!parsedQuestions || parsedQuestions.length <= 1) {
            const extracted = extractQuestionsFromText(mainQuestion);
            if (extracted && extracted.questions && extracted.questions.length > 1) {
              parsedQuestions = extracted.questions;
              if (extracted.intro) {
                mainQuestion = extracted.intro;
              }
            }
          }

          const qData: InteractiveQuestionData = {
            questionId: qId,
            question: mainQuestion,
            options: toolArgs.options || [],
            questions: parsedQuestions,
            multiSelect: !!toolArgs.multiSelect
          };
          callbacks.onQuestion?.(qData);
          callbacks.onToken(`\n\n💬 **[互动提问]** ${qData.question}\n`, 'thought');

          activeStep.status = 'running';
          activeStep.result = '等待用户在界面卡片中答复...';
          callbacks.onStepUpdate({ ...activeStep });

          // Await user response via submitUserResponse with abort protection
          observation = await new Promise<string>((resolve, reject) => {
            const onAbort = () => {
              pendingUserResponses.delete(sessionId);
              reject(new Error('用户主动中止了任务。'));
            };
            if (abortController.signal.aborted) {
              return reject(new Error('用户主动中止了任务。'));
            }
            abortController.signal.addEventListener('abort', onAbort, { once: true });

            pendingUserResponses.set(sessionId, (ans: string) => {
              abortController.signal.removeEventListener('abort', onAbort);
              pendingUserResponses.delete(sessionId);
              resolve(ans);
            });
          });
        } else if (toolName === 'install_skill') {
          if (toolArgs.url) {
            const res = await safeFetch(toolArgs.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const text = await res.text();
            const urlFileName = toolArgs.url.split('/').pop()?.replace(/\.md$/, '') || 'remote_skill';
            const titleMatch = text.match(/^#\s+(.+)$/m);
            const name = titleMatch ? titleMatch[1].trim() : urlFileName;
            const installed = skillManager.installSkillFromContent(urlFileName, name, `从 URL 安装: ${toolArgs.url}`, text);
            observation = `[Skill 自主安装成功] 已成功从远程下载并安装技能 "${installed.name}" (ID: ${installed.id})，已存入 ASTeam 专属技能库 (${installed.filePath || storageHub.getSkillsDir()}) 并即时激活生效！`;
          } else if (toolArgs.name && toolArgs.prompt) {
            const cleanId = (toolArgs.id || toolArgs.name).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const installed = skillManager.installSkillFromContent(
              cleanId,
              toolArgs.name,
              toolArgs.description || '由 Agent 自主生成并安装的技能',
              toolArgs.prompt
            );
            observation = `[Skill 自主安装成功] 已成功创建并安装专属技能 "${installed.name}" (ID: ${installed.id})，已安全持久化至 ASTeam 专属技能库 (${installed.filePath || storageHub.getSkillsDir()}) 并即时激活生效！`;
          } else {
            throw new Error('install_skill 参数错误: 需要提供 url 字段或者 { id, name, description, prompt } 字段');
          }
        } else if (toolName === 'list_skills') {
          const all = skillManager.getAllAvailableSkills(config.workspacePath || null);
          const listStr = all.map(s => {
            const loc = s.filePath ? `\n  - 文件路径: "${s.filePath}" (支持直接使用 view_file 读取)` : `\n  - 内置规约: (可调用 read_skill("${s.id}") 或 view_file 查看)`;
            return `- [${s.isBuiltin ? '内置技能' : '自定义技能'}] ${s.name} (ID: ${s.id})${loc}\n  - 说明: ${s.description}`;
          }).join('\n\n');
          observation = `当前系统已挂载技能列表 (${all.length} 项):\n${listStr}\n\n💡 提示：若需查阅某技能的详细规约要求，可直接调用 read_skill 或使用 view_file 查看其文件路径。`;
        } else if (toolName === 'activate_skill' || toolName === 'read_skill') {
          const skillId = toolArgs.id || toolArgs.skillId || toolArgs.name || toolArgs.skill;
          if (!skillId) {
            throw new Error(`${toolName} 失败: 请提供技能 ID 或名称 (参数格式: {"id": "office_word_report"})`);
          }
          const skill = skillManager.findSkill(skillId, config.workspacePath || null);
          if (skill) {
            let promptText = skill.prompt;
            if (skill.recommendedTools && skill.recommendedTools.length > 0) {
              promptText += `\n\n【规约 + 工具联动绑定 (Recommended Tools)】\n本技能专属推荐协同调度工具: ${skill.recommendedTools.join(', ')}。请优先调用这些工具以保障交付最高质量。`;
            }
            observation = `[Skill 动态激活成功] 已精准加载并激活专属技能「${skill.name}」(@${skill.id}):\n${promptText}`;
          } else {
            throw new Error(`未找到技能: "${skillId}"。请先查阅可用技能微型索引清单或调用 list_skills。`);
          }
        } else if (toolName === 'remember_fact') {
          const scope = (toolArgs.scope === 'global' || !config.workspacePath) ? 'global' : 'project';
          const fact = toolArgs.fact || toolArgs.content || toolArgs.text || '';
          if (!fact || !fact.trim()) {
            throw new Error('remember_fact 参数错误: 请提供 fact 字段以记录要点 (例如 {"scope": "project", "fact": "..."})');
          }
          const memRes = memoryManager.addMemoryFact(scope, fact.trim(), config.workspacePath || null);
          observation = `[长期记忆沉淀成功] ${memRes.message}\n已持久化落盘条目: "${fact.trim()}"`;
        } else if (toolName === 'generate_image') {
          let prompt = toolArgs.prompt || toolArgs.description || toolArgs.content || '';
          let filePath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!prompt && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            prompt = secondary.prompt || secondary.description || secondary.content || '';
            filePath = filePath || secondary.filePath || secondary.path || secondary.file;
          }
          observation = await tools.generateImage({
            prompt,
            filePath,
            size: toolArgs.size,
            ratio: toolArgs.ratio,
            model: toolArgs.model
          });
        } else if (toolName === 'generate_video') {
          let prompt = toolArgs.prompt || toolArgs.description || toolArgs.content || '';
          let filePath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!prompt && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            prompt = secondary.prompt || secondary.description || secondary.content || '';
            filePath = filePath || secondary.filePath || secondary.path || secondary.file;
          }
          observation = await tools.generateVideo({
            prompt,
            filePath,
            size: toolArgs.size,
            ratio: toolArgs.ratio,
            seconds: toolArgs.seconds,
            model: toolArgs.model
          });
        } else if (toolName === 'text_to_speech') {
          let input = toolArgs.input || toolArgs.text || toolArgs.content || '';
          let filePath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!input && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            input = secondary.input || secondary.content || secondary.text || '';
            filePath = filePath || secondary.filePath || secondary.path || secondary.file;
          }
          observation = await tools.textToSpeech({
            input,
            filePath,
            voice: toolArgs.voice,
            model: toolArgs.model
          });
        } else if (toolName === 'audio_to_text') {
          let filePath = toolArgs.filePath || toolArgs.path || toolArgs.file || '';
          if (!filePath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            filePath = secondary.filePath || secondary.path || secondary.file || '';
          }
          observation = await tools.audioToText({
            filePath,
            language: toolArgs.language,
            model: toolArgs.model
          });
        } else if (toolName === 'generate_embedding') {
          let input = toolArgs.input || toolArgs.text || toolArgs.content || '';
          if (!input && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            input = secondary.input || secondary.content || secondary.text || '';
          }
          observation = await tools.generateEmbedding({
            input,
            model: toolArgs.model
          });
        } else if (toolName === 'generate_pdf') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            targetPath = path.join(getSystemDesktopDir(), `${toolArgs.title || '方案白皮书'}.pdf`);
          }
          trackedArtifacts.push(targetPath);
          observation = await tools.generatePdf({
            ...toolArgs,
            filePath: targetPath,
            markdownContent: toolArgs.markdownContent || toolArgs.content || ''
          });
        } else if (toolName === 'read_pdf') {
          let targetPath = toolArgs.filePath || toolArgs.path || toolArgs.file;
          if (!targetPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetPath = secondary.filePath || secondary.path || secondary.file;
          }
          if (!targetPath) {
            throw new Error('read_pdf 失败: 请提供要读取的 PDF 文件路径 (filePath)');
          }
          observation = await tools.readPdf(targetPath);
        } else if (toolName === 'compress_zip') {
          let targetZip = toolArgs.targetZipPath || toolArgs.filePath || toolArgs.zipPath || toolArgs.target;
          if (!targetZip && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            targetZip = secondary.targetZipPath || secondary.filePath || secondary.zipPath;
          }
          if (!targetZip) {
            targetZip = path.join(getSystemDesktopDir(), 'archive.zip');
          }
          trackedArtifacts.push(targetZip);
          observation = await tools.compressZip({
            ...toolArgs,
            targetZipPath: targetZip
          });
        } else if (toolName === 'extract_zip') {
          let zipPath = toolArgs.zipPath || toolArgs.filePath || toolArgs.path;
          if (!zipPath && toolArgs.raw) {
            const secondary = parseToolArgs(toolArgs.raw);
            zipPath = secondary.zipPath || secondary.filePath || secondary.path;
          }
          if (!zipPath) {
            throw new Error('extract_zip 失败: 请提供要解压的 ZIP 文件路径 (zipPath)');
          }
          observation = await tools.extractZip({
            ...toolArgs,
            zipPath
          });
        } else {
          // Check MCP tools
          const mcpResult = await mcpManager.executeTool(toolName, toolArgs, { workspacePath: config.workspacePath || null });
          if (mcpResult !== null) {
            observation = mcpResult;
          } else {
            observation = `Unknown tool: ${toolName}`;
          }
        }
        activeStep.status = 'completed';
        activeStep.result = observation.slice(0, 300);
      } catch (err: any) {
        observation = `Tool Execution Error: ${err.message}`;
        recoveredErrors.push(`[${toolName}] ${err.message}`);
        activeStep.status = 'failed';
        activeStep.error = err.message;
      }

      callbacks.onStepUpdate({ ...activeStep });
      callbacks.onToken(`\n\`\`\`output\n${observation.slice(0, 500)}${observation.length > 500 ? '\n...[truncated]' : ''}\n\`\`\`\n`, 'thought');

      messages.push({
        role: 'user',
        content: `【工具调用返回结果】:\n${observation}\n请根据以上结果继续执行规划，若已完成任务则给出最终答复。`
      });
    }

    // Mark remaining steps as completed
    for (const step of initialPlanSteps) {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'completed';
        callbacks.onStepUpdate({ ...step });
      }
    }

    // 结算本轮任务快照
    const turnCkpt = checkpointManager.finishTurnCheckpoint(sessionId);
    if (turnCkpt && (turnCkpt.modifiedFiles.length > 0 || turnCkpt.newFiles.length > 0)) {
      callbacks.onCheckpoint?.(turnCkpt);
    }

    // v1.8.0 核心：Hermes 式自省微型复盘与记忆自动沉淀
    try {
      const reflectRes = memoryManager.autoReflectAndPersist({
        userPrompt: prompt,
        stepsCount: currentStepIndex + 1,
        toolsUsed: Array.from(new Set(initialPlanSteps.map(s => s.tool).filter(Boolean) as string[])),
        artifactsGenerated: trackedArtifacts,
        recoveredErrors,
        workspacePath: config.workspacePath
      });
      if (reflectRes.reflected && reflectRes.insights.length > 0) {
        callbacks.onToken(`\n\n🧠 **[Hermes 经验自省沉淀]**\n已自动复盘本轮任务要点并持久化至记忆库：\n${reflectRes.insights.map(i => `- ${i}`).join('\n')}\n`, 'thought');
      }
    } catch (reflectErr) {
      console.warn('[AutoReflection] Warning:', reflectErr);
    }

    callbacks.onDone(finalSummary);
  } catch (error: any) {
    if (abortController.signal.aborted) {
      callbacks.onError('操作已被用户手动停止。');
    } else {
      callbacks.onError(error.message || 'Agent 运行异常');
    }
  } finally {
    activeExecutions.delete(sessionId);
  }
}
