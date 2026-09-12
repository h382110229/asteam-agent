import fs from 'node:fs';
import path from 'node:path';
import { storageHub } from './storage-hub';

export interface MemoryContextResult {
  projectMemory?: string;
  userProfile?: string;
  globalMemory?: string;
  assembledPrompt: string;
}

export class MemoryManager {
  /**
   * 确保全局记忆目录与预设画像模板存在
   */
  private ensureGlobalMemoryFiles(): { userProfilePath: string; globalMemoryPath: string } {
    const memoryDir = storageHub.getMemoryDir();
    if (!fs.existsSync(memoryDir)) {
      try {
        fs.mkdirSync(memoryDir, { recursive: true });
      } catch {}
    }

    const userProfilePath = path.join(memoryDir, 'user_profile.md');
    if (!fs.existsSync(userProfilePath)) {
      const defaultProfile = `# 用户全局偏好画像 (User Profile)
> 此文件由 ASTeam Agent 自动维护与感知，记录您的全局技术栈偏好与开发习惯。

## 技术栈与编码风格
- 语言偏好：TypeScript / JavaScript 优先，强调严谨的类型定义与防御性编程；
- 前端规范：React 18+ 函数式组件，Tailwind CSS 原子化样式，中文注释与详尽错误处理；
- 架构原则：单一职责、模块解耦、小步重构，严禁引入未经论证的笨重第三方依赖；
- 沟通风格：客观严谨，输出方案时自带结构化思维与落地步骤。
`;
      try {
        fs.writeFileSync(userProfilePath, defaultProfile, 'utf-8');
      } catch {}
    }

    const globalMemoryPath = path.join(memoryDir, 'GLOBAL_MEMORY.md');
    if (!fs.existsSync(globalMemoryPath)) {
      const defaultGlobal = `# 全局工程经验与知识沉淀 (Global Knowledge)
> 跨项目的通用避坑经验与最佳实践沉淀库。

## 通用避坑与运维经验
- Windows 控制台执行 PowerShell 脚本时注意 UTF-8 编码与 BOM 头保护；
- 涉及网络调用需具备 524 超时及 429 限流的主备自动容灾意识。
`;
      try {
        fs.writeFileSync(globalMemoryPath, defaultGlobal, 'utf-8');
      } catch {}
    }

    return { userProfilePath, globalMemoryPath };
  }

  /**
   * 获取项目级记忆文件路径（工作区 .asteam/memory/MEMORY.md）
   */
  public getProjectMemoryPath(workspacePath: string | null): string | null {
    if (!workspacePath || !fs.existsSync(workspacePath)) return null;
    return path.join(workspacePath, '.asteam', 'memory', 'MEMORY.md');
  }

  /**
   * 确保项目工作区记忆文件存在
   */
  public ensureProjectMemoryFile(workspacePath: string): string {
    const memDir = path.join(workspacePath, '.asteam', 'memory');
    if (!fs.existsSync(memDir)) {
      try {
        fs.mkdirSync(memDir, { recursive: true });
      } catch {}
    }

    const memPath = path.join(memDir, 'MEMORY.md');
    if (!fs.existsSync(memPath)) {
      const projectName = path.basename(workspacePath);
      const defaultProjectMem = `# 项目专属持久记忆库 (Project Memory) - ${projectName}
> 本文件由 ASTeam Agent 自动维护。所有关于本项目技术架构约定、核心目录定位、避坑经验均沉淀于此，跨会话常驻生效。

## 1. 工程架构约定与技术选型
- 本项目名称：${projectName}
- 核心规范：保持工作区整洁，所有修改需通过构建测试验证；

## 2. 团队规约与技术禁忌
- 暂无特殊禁忌。

## 3. 避坑要点与知识沉淀条目
`;
      try {
        fs.writeFileSync(memPath, defaultProjectMem, 'utf-8');
      } catch {}
    }
    return memPath;
  }

  /**
   * 读取项目级记忆内容
   */
  public readProjectMemory(workspacePath: string | null): string {
    if (!workspacePath) return '';
    const memPath = this.getProjectMemoryPath(workspacePath);
    if (memPath && fs.existsSync(memPath)) {
      try {
        return fs.readFileSync(memPath, 'utf-8');
      } catch {}
    }
    return '';
  }

  /**
   * 读取全局用户画像
   */
  public readUserProfile(): string {
    const { userProfilePath } = this.ensureGlobalMemoryFiles();
    try {
      if (fs.existsSync(userProfilePath)) {
        return fs.readFileSync(userProfilePath, 'utf-8');
      }
    } catch {}
    return '';
  }

  /**
   * 读取全局通用记忆
   */
  public readGlobalMemory(): string {
    const { globalMemoryPath } = this.ensureGlobalMemoryFiles();
    try {
      if (fs.existsSync(globalMemoryPath)) {
        return fs.readFileSync(globalMemoryPath, 'utf-8');
      }
    } catch {}
    return '';
  }

  /**
   * 组装注入系统提示词的长期记忆上下文
   */
  public assembleMemoryContext(workspacePath: string | null): string {
    const userProfile = this.readUserProfile();
    const globalMemory = this.readGlobalMemory();
    const projectMemory = this.readProjectMemory(workspacePath);

    if (!userProfile && !globalMemory && !projectMemory) {
      return '';
    }

    const sections: string[] = ['【ASTeam 长期记忆与知识沉淀库 (Memory Bank) · 跨会话激活】'];

    if (userProfile.trim()) {
      sections.push(`\n--- [全局用户偏好画像 (user_profile.md)] ---\n${userProfile.trim().slice(0, 2000)}`);
    }

    if (projectMemory.trim()) {
      sections.push(`\n--- [当前项目架构记忆 (.asteam/memory/MEMORY.md)] ---\n${projectMemory.trim().slice(0, 3000)}`);
    } else if (globalMemory.trim()) {
      sections.push(`\n--- [全局通用经验沉淀 (GLOBAL_MEMORY.md)] ---\n${globalMemory.trim().slice(0, 2000)}`);
    }

    sections.push('\n- 准则：你必须在所有代码生成、方案撰写与决策中严格遵守上述长期记忆与偏好要求。');

    return '\n\n' + sections.join('\n') + '\n';
  }

  /**
   * 向项目或全局记忆库追加一条知识沉淀
   */
  public addMemoryFact(
    scope: 'project' | 'global',
    fact: string,
    workspacePath: string | null
  ): { success: boolean; targetPath: string; message: string } {
    const cleanFact = fact.trim();
    if (!cleanFact) {
      return { success: false, targetPath: '', message: '记忆内容不能为空' };
    }

    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false });
    const formattedItem = `\n- [${timestamp}] ${cleanFact}`;

    if (scope === 'project' && workspacePath && fs.existsSync(workspacePath)) {
      const targetPath = this.ensureProjectMemoryFile(workspacePath);
      try {
        fs.appendFileSync(targetPath, formattedItem, 'utf-8');
        return {
          success: true,
          targetPath,
          message: `已成功将记忆沉淀至当前项目库 (.asteam/memory/MEMORY.md)`
        };
      } catch (err: any) {
        return { success: false, targetPath, message: `写入项目记忆失败: ${err.message}` };
      }
    } else {
      // 写入全局记忆
      const { globalMemoryPath } = this.ensureGlobalMemoryFiles();
      try {
        fs.appendFileSync(globalMemoryPath, formattedItem, 'utf-8');
        return {
          success: true,
          targetPath: globalMemoryPath,
          message: `已成功将记忆沉淀至全局记忆库 (GLOBAL_MEMORY.md)`
        };
      } catch (err: any) {
        return { success: false, targetPath: globalMemoryPath, message: `写入全局记忆失败: ${err.message}` };
      }
    }
  }

  /**
   * 保存/覆盖编辑后的记忆文件
   */
  public saveMemoryContent(
    type: 'project' | 'profile' | 'global',
    content: string,
    workspacePath: string | null
  ): { success: boolean; message: string } {
    try {
      if (type === 'project') {
        if (!workspacePath) return { success: false, message: '未指定工作区路径' };
        const memPath = this.ensureProjectMemoryFile(workspacePath);
        fs.writeFileSync(memPath, content, 'utf-8');
        return { success: true, message: '项目记忆已保存' };
      } else if (type === 'profile') {
        const { userProfilePath } = this.ensureGlobalMemoryFiles();
        fs.writeFileSync(userProfilePath, content, 'utf-8');
        return { success: true, message: '用户画像已保存' };
      } else {
        const { globalMemoryPath } = this.ensureGlobalMemoryFiles();
        fs.writeFileSync(globalMemoryPath, content, 'utf-8');
        return { success: true, message: '全局记忆已保存' };
      }
    } catch (err: any) {
      return { success: false, message: `保存失败: ${err.message}` };
    }
  }

  /**
   * 检查用户输入是否为 /remember 或 /learn 指令
   */
  public parseExplicitCommand(text: string): { isCommand: boolean; fact?: string } {
    if (!text) return { isCommand: false };
    const trimmed = text.trim();
    const match = trimmed.match(/^\/(?:remember|learn)\s+([\s\S]+)$/i);
    if (match && match[1]?.trim()) {
      return { isCommand: true, fact: match[1].trim() };
    }
    return { isCommand: false };
  }

  /**
   * Hermes 式自主复盘反思引擎 (Post-Task Reflection)
   * 在复合长程任务或多步工具调用完成后，提取关键避坑要点与用户习惯，沉淀至项目/全局记忆
   */
  public autoReflectAndPersist(context: {
    userPrompt: string;
    stepsCount: number;
    toolsUsed: string[];
    artifactsGenerated?: string[];
    recoveredErrors?: string[];
    workspacePath?: string | null;
  }): { reflected: boolean; insights: string[] } {
    const insights: string[] = [];

    // 1. 若使用了原生 Office 生成器并交付了文档
    if (context.toolsUsed.some(t => ['generate_docx', 'generate_excel', 'generate_pptx'].includes(t))) {
      if (context.artifactsGenerated && context.artifactsGenerated.length > 0) {
        const fileExts = context.artifactsGenerated.map(f => path.extname(f).toLowerCase());
        if (fileExts.includes('.docx')) {
          insights.push('办公方案生成偏好：优先调用客户端全量内置的纯 JS 原生 Word 套件 (generate_docx)，支持华为云高标准封面、自动目录与复杂斑马纹表格排版，杜绝外部 Python 依赖。');
        }
        if (fileExts.includes('.xlsx')) {
          insights.push('数据表格处理经验：使用内置 exceljs 原生套件 (generate_excel/read_excel) 读写多 Sheet 与冻结首行，保障零外部黑盒环境依赖。');
        }
      }
    }

    // 2. 若在任务中遭遇了终端环境语法问题并成功自愈
    if (context.recoveredErrors && context.recoveredErrors.some(e => e.includes('&&') || e.includes('powershell'))) {
      insights.push('终端环境避坑经验：Windows 宿主 PowerShell 老版本不支持 && 拼接符，需由内核健壮性沙箱使用分号或临时安全 .ps1 脚本执行。');
    }

    // 3. 针对云迁移与资源盘点的高频业务场景经验
    if (/迁移|华为云|IDC|CBS|ECU|资源盘点/i.test(context.userPrompt)) {
      insights.push('华为云迁移方案工程规范：针对 IDC 与 CBS 系统迁移，需全面盘点各业务云主机 ECU、MySQL/GP/SQL Server 数据库明文配置，并输出标准迁移矩阵与实施排期表。');
    }

    if (insights.length === 0) {
      return { reflected: false, insights: [] };
    }

    // 避免重复追加：读取现有记忆，若已包含则不重复添加
    const existing = this.readProjectMemory(context.workspacePath || null);
    const newInsights = insights.filter(ins => !existing.includes(ins));

    if (newInsights.length > 0) {
      const scope = context.workspacePath ? 'project' : 'global';
      for (const ins of newInsights) {
        this.addMemoryFact(scope, `[自省沉淀] ${ins}`, context.workspacePath || null);
      }
    }

    return { reflected: true, insights };
  }
}

export const memoryManager = new MemoryManager();
