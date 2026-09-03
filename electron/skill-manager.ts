import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  prompt: string;
  category?: 'office' | 'dev' | 'custom';
}

const BUILTIN_SKILLS: SkillItem[] = [
  // 1. Office & 文档类热门技能
  {
    id: 'doc_generator',
    name: 'Office 方案与技术文档撰写',
    description: '撰写严谨规范的技术方案、PRD 需求白皮书、架构报告、操作手册与会议纪要',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：Office 方案与专业技术文档撰写】
- 撰写企业级高水准文档（Markdown / Word 风格），遵循清晰的层级目录结构：
  1. 引言与项目背景（Executive Summary）；
  2. 核心架构设计与流程图（建议使用 Mermaid 代码块直观呈现）；
  3. 关键业务规约、接口参数与数据字典；
  4. 风险评估、灰度演进方案与应急回滚策略；
- 语言精炼准确，排版规范（多级标题、表格对比、高亮重点），并在结尾附录关键术语解释。`
  },
  {
    id: 'ppt_outline_maker',
    name: 'PPT 演示与汇报大纲生成',
    description: '生成结构化、视觉导向的演讲汇报 Slide 大纲、逐页要点与讲者演讲逐字稿',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：PPT 汇报演说大纲生成】
- 针对用户的主题需求，生成结构化 Slide 大纲：
  - 每页 Slide 包含：[页码] [幻灯片标题] [核心结论金句] [内容要点列表] [视觉版式/图表建议] [讲者演讲逐字稿 (Speaker Notes)]；
  - 遵循金字塔原理与商业演说逻辑：现状痛点 -> 核心突破 -> 方案架构 -> 收益量化 -> 行动倡议；
  - 重点突出，避免大段冗长叙述，善于使用数字量化支撑。`
  },
  {
    id: 'data_analysis_excel',
    name: '表格与数据分析助手',
    description: '自动化生成 CSV/Excel 数据格式、设计数据字典、复杂透视公式与多维汇总报表',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：Excel 表格与数据分析助手】
- 帮助用户设计规范的表格数据结构与数据分析方案：
  - 输出规范合规的 CSV 或 Markdown 数据表格；
  - 提供精准的 Excel 高级公式（VLOOKUP, XLOOKUP, INDEX-MATCH, SUMIFS）；
  - 输出数据概览、极值、均值与趋势透视建议；
  - 指导用户在宿主环境中导出或批量处理表格文件。`
  },
  {
    id: 'api_architect',
    name: 'API 架构与契约规范设计',
    description: '设计符合 OpenAPI 3.0 / RESTful 最佳实践的高可用前后端接口契约',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：API 架构与契约设计】
- 针对业务需求设计清晰规范的 API 接口契约：
  - 遵循 RESTful 规范（名词复数、精准 HTTP 状态码、统一错误包装）；
  - 给出完整的 Request/Response JSON Schema 结构示例；
  - 明确标注入参校验规则（非空、长度、类型）与安全认证方式（Bearer Token 等）。`
  },

  // 2. 研发与代码专家技能
  {
    id: 'code_review',
    name: 'Code Review 专家',
    description: '严格按企业级标准（OWASP 安全基线、防御性编程、空指针防护、内存泄漏与性能）走查代码',
    isBuiltin: true,
    category: 'dev',
    prompt: `【激活技能：Code Review 专家】
- 对检视或编写的代码进行深度安全与健壮性审查：
  1. OWASP Top 10 安全漏洞（SQL/命令注入、XSS、敏感信息硬编码等）；
  2. 边界保护与防御性编程（Null/Undefined 检查、资源泄露检测）；
  3. 异常捕获与日志记录规范；
  4. 审查意见必须给出具体位置、风险评级（高/中/低）及修复前后对比示例。`
  },
  {
    id: 'unit_test',
    name: '单测与回归验证助手',
    description: '自动分析被测函数边界，生成高覆盖率的单元测试并执行验证',
    isBuiltin: true,
    category: 'dev',
    prompt: `【激活技能：单元测试与回归验证】
- 针对修改的代码或业务模块，自动寻找适用的测试框架（Vitest / Jest / Pytest / Go test 等）；
- 优先覆盖异常分支、边界值、并发争用条件；
- 若条件允许，主动通过终端工具执行测试，验证测试全部通过后再提交结论。`
  },
  {
    id: 'refactor_clean',
    name: 'Clean Code 架构重构',
    description: '遵循 SOLID 原则、设计模式与坏味道清理，提升代码可读性与模块解耦',
    isBuiltin: true,
    category: 'dev',
    prompt: `【激活技能：Clean Code 架构重构】
- 遵循 SOLID 原则与单一职责设计；
- 消除代码坏味道（如超长函数、上帝对象、重复逻辑、硬编码魔法值）；
- 确保重构过程小步快跑，不破坏原有公共接口行为与语义。`
  },
  {
    id: 'git_commit_helper',
    name: 'Conventional Commits 助手',
    description: '依据代码变更 Diff 自动归纳清晰规范的 Git 提交消息',
    isBuiltin: true,
    category: 'dev',
    prompt: `【激活技能：Conventional Commits 规范助手】
- 在完成代码修改或给出提交建议时，使用标准 Conventional Commits 格式：
  <type>(<scope>): <short summary>
  [可选的详细正文描述]
  [可选的 BREAKING CHANGE 或 issue 关联]`
  }
];

export class SkillManager {
  private getGlobalSkillsDir(): string {
    const dir = path.join(os.homedir(), '.asteam', 'skills');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  }

  getBuiltinSkills(): SkillItem[] {
    return BUILTIN_SKILLS;
  }

  loadGlobalSkills(): SkillItem[] {
    const dir = this.getGlobalSkillsDir();
    if (!fs.existsSync(dir)) return [];

    const result: SkillItem[] = [];
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const skillId = file.replace(/\.md$/, '');

          const titleMatch = content.match(/^#\s+(.+)$/m);
          const name = titleMatch ? titleMatch[1].trim() : skillId;

          result.push({
            id: `custom:global:${skillId}`,
            name: `[自定义] ${name}`,
            description: `全局已安装技能 (${file})`,
            isBuiltin: false,
            category: 'custom',
            prompt: `【激活全局自定义技能：${name}】\n${content}`
          });
        }
      }
    } catch {}
    return result;
  }

  loadCustomWorkspaceSkills(workspacePath: string | null): SkillItem[] {
    if (!workspacePath || !fs.existsSync(workspacePath)) return [];

    const skillsDir = path.join(workspacePath, '.asteam', 'skills');
    if (!fs.existsSync(skillsDir)) return [];

    const result: SkillItem[] = [];
    try {
      const files = fs.readdirSync(skillsDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(skillsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const skillId = file.replace(/\.md$/, '');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const name = titleMatch ? titleMatch[1].trim() : skillId;

          result.push({
            id: `custom:workspace:${skillId}`,
            name: `[项目专属] ${name}`,
            description: `位于工作区 .asteam/skills/${file}`,
            isBuiltin: false,
            category: 'custom',
            prompt: `【激活工作区专属技能：${name}】\n${content}`
          });
        }
      }
    } catch {}

    return result;
  }

  getAllAvailableSkills(workspacePath: string | null): SkillItem[] {
    return [
      ...this.getBuiltinSkills(),
      ...this.loadGlobalSkills(),
      ...this.loadCustomWorkspaceSkills(workspacePath)
    ];
  }

  installSkillFromContent(id: string, name: string, description: string, promptContent: string): SkillItem {
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const dir = this.getGlobalSkillsDir();
    const filePath = path.join(dir, `${cleanId}.md`);

    const fullContent = `# ${name}\n> ${description}\n\n${promptContent}`;
    fs.writeFileSync(filePath, fullContent, 'utf-8');

    return {
      id: `custom:global:${cleanId}`,
      name: `[自定义] ${name}`,
      description: `全局已安装技能 (${cleanId}.md)`,
      isBuiltin: false,
      category: 'custom',
      prompt: `【激活全局自定义技能：${name}】\n${fullContent}`
    };
  }

  installSkillFromFile(sourcePath: string): SkillItem {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`文件不存在: ${sourcePath}`);
    }
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const baseName = path.basename(sourcePath, '.md');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const name = titleMatch ? titleMatch[1].trim() : baseName;

    return this.installSkillFromContent(baseName, name, `从本地文件 ${path.basename(sourcePath)} 导入`, content);
  }

  deleteCustomSkill(skillId: string): boolean {
    const dir = this.getGlobalSkillsDir();
    const cleanId = skillId.replace(/^custom:(global|workspace):/, '');
    const targetFile = path.join(dir, `${cleanId}.md`);
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
      return true;
    }
    return false;
  }

  getAggregatedSkillPrompt(enabledSkillIds: string[], workspacePath: string | null): string {
    const all = this.getAllAvailableSkills(workspacePath);
    const selected = all.filter(s => enabledSkillIds.includes(s.id));
    if (selected.length === 0) return '';

    return '\n\n' + selected.map(s => s.prompt).join('\n\n');
  }
}

export const skillManager = new SkillManager();
