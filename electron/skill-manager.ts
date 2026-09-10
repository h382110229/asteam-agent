import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { storageHub } from './storage-hub';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  prompt: string;
  category?: 'office' | 'dev' | 'custom';
  filePath?: string;
}

const BUILTIN_SKILLS: SkillItem[] = [
  // 1. Anthropic & MiniMax 官方深度融合 Office 四件套
  {
    id: 'office_word_report',
    name: '公文方案与深度报告专家 (Anthropic & MiniMax 官方融合)',
    description: '融合 Anthropic 深度分析与 MiniMax 权威公文体系，撰写高水准技术方案白皮书、行政公文与深度研究报告',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：公文方案与深度报告专家 (Anthropic & MiniMax 官方融合)】
- 遵循 Anthropic 深度严谨分析与 MiniMax 权威政企公文规约：
  1. 结构标准：
     - 执行摘要 (Executive Summary / 提要)：三句话高度概括背景、核心结论与拟采取行动；
     - 现状剖析与痛点诊断：使用精准数据与客观事实支撑论点；
     - 方案架构与实施细则：模块化拆解，建议配合 Mermaid 流程图或拓扑图清晰呈现；
     - 资源保障与量化指标 (KPI/OKR)：责任落实、节点排期与交付物验收标准；
     - 风险预案与应对策略：前置识别合规、技术、协同风险并给出兜底措施；
  2. 语言规范：行文客观审慎、严谨得体，结构层层递进，严禁空洞陈词滥调；
  3. 格式美学：标题层级严格规范（一、 (一) 1. (1)），重点数据加粗，善用对比表格与引用标注；
  4. 交付形态：自动按 Markdown/排版规范输出，可直接转为 Word、PDF 或正式汇报报告。`
  },
  {
    id: 'office_excel_master',
    name: '表格与数据建模大师 (Anthropic & MiniMax 官方融合)',
    description: '融合高级财务建模与 MiniMax 现代复杂动态数组公式 (XLOOKUP/LET/LAMBDA)，提供数据清洗与多维透视洞察',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：表格与数据建模大师 (Anthropic & MiniMax 官方融合)】
- 遵循现代数据处理、商业智能与财务分析最高实践：
  1. 高阶现代公式：优先采用健壮易维护的现代公式（XLOOKUP, LET, LAMBDA, FILTER, UNIQUE, SORT, INDEX-MATCH, SUMIFS），杜绝脆弱的嵌套 IF；
  2. 结构化数据输出：生成符合第三范式规范的 CSV 或 Markdown 数据表格，表头清晰，严禁无规则合并单元格；
  3. 智能指标透视：自动核算关键统计量（总量、同比环比、均值、中位数、离散极值），并附带业务归因洞察；
  4. 落地实操指引：针对复杂计算与透视表，提供详尽的操作步骤指导（包括条件格式、切片器配置与数据有效性校验）。`
  },
  {
    id: 'office_ppt_keynote',
    name: '商业提案与演说 PPT 架构师 (Anthropic & MiniMax 官方融合)',
    description: '融合 Anthropic 单页核心论点原则与 MiniMax 企划路演商业逻辑，生成逐页版式建议与讲者演说逐字稿',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：商业提案与演说 PPT 架构师 (Anthropic & MiniMax 官方融合)】
- 遵循路演演说金字塔原理与高冲击力视觉叙事规范：
  1. 商业演说骨架：痛点共鸣 -> 核心突破 -> 解决方案架构 -> 商业回报量化 -> 行动倡议 (Call to Action)；
  2. 逐页标准化输出规范：
     - [幻灯片序号 & 标题]
     - [单页核心金句 (1 Slide 1 Idea: 观众 3 秒即可捕捉的核心论点)]
     - [正文精炼要点 (控制在 3-4 条以内，绝不大段堆砌文字)]
     - [版式与图表视觉建议 (卡片并列、对比布局、环形图/漏斗图等)]
     - [讲者演说逐字稿 (Speaker Notes: 现场口语化讲解词，包含重音与停顿提示)]；
  3. 用数字说话，前后对比鲜明，确保汇报在商业与管理评审中具备极高说服力。`
  },
  {
    id: 'office_meeting_action',
    name: '智能会议纪要与行动清单 (Anthropic & MiniMax 官方融合)',
    description: '从杂乱讨论中快速萃取核心决议 (Decisions)、分歧争议与 RACI 敏捷行动项追踪矩阵',
    isBuiltin: true,
    category: 'office',
    prompt: `【激活技能：智能会议纪要与行动清单 (Anthropic & MiniMax 官方融合)】
- 遵循敏捷推进与高效企业协作标准：
  1. 会议核心摘要：主题、时间、关键决策者与各方角色；
  2. 核心决议萃取 (Key Decisions)：精炼提炼会议已拍板定案的结论，过滤无价值闲聊与发散；
  3. 争议焦点与后续调研 (Open Issues & Discussion Points)：客观如实记录暂未达成一致的议题及负责调研人；
  4. 标准 RACI 交付任务矩阵 (Action Items)：
     | 序号 | 行动项内容 (What) | 责任人 (Owner/Who) | 交付物标准 (Deliverable) | 截止时间 (When) | 依赖项 |
  5. 重点突出“谁在什么时间交付什么结果”，确保后续有迹可循、推进闭环。`
  },
  {
    id: 'api_architect',
    name: 'API 架构与前后端契约设计',
    description: '设计符合 OpenAPI 3.0 / RESTful 最佳实践的高可用前后端接口契约与统一错误包装',
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
    const dir = storageHub.getSkillsDir();
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
    const primaryDir = this.getGlobalSkillsDir();
    const legacyDir = path.join(os.homedir(), '.asteam', 'skills');
    const dirsToScan = [primaryDir];
    if (primaryDir !== legacyDir && fs.existsSync(legacyDir)) {
      dirsToScan.push(legacyDir);
    }

    const result: SkillItem[] = [];
    const seenIds = new Set<string>();

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const skillId = file.replace(/\.md$/, '');
            if (seenIds.has(skillId)) continue;
            seenIds.add(skillId);

            const filePath = path.join(dir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const name = titleMatch ? titleMatch[1].trim() : skillId;

            result.push({
              id: `custom:global:${skillId}`,
              name: `[自定义] ${name}`,
              description: `全局已安装技能 (${file})`,
              isBuiltin: false,
              category: 'custom',
              filePath,
              prompt: `【激活全局自定义技能：${name}】\n${content}`
            });
          }
        }
      } catch {}
    }
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
            filePath,
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

  findSkill(query: string, workspacePath: string | null): SkillItem | undefined {
    if (!query) return undefined;
    const clean = query.trim().toLowerCase();
    const cleanBase = path.basename(clean, '.md').replace(/^(?:custom_global_|custom:global:|custom_workspace_|custom:workspace:)/i, '');
    const all = this.getAllAvailableSkills(workspacePath);

    return all.find(s => {
      const sId = s.id.toLowerCase();
      const sIdBase = sId.replace(/^(?:custom:global:|custom:workspace:)/i, '');
      const sName = s.name.toLowerCase();
      const sFileName = s.filePath ? path.basename(s.filePath, '.md').toLowerCase() : '';

      return (
        sId === clean ||
        sIdBase === clean ||
        sIdBase === cleanBase ||
        sFileName === cleanBase ||
        sName === clean ||
        sName.includes(cleanBase)
      );
    });
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
      filePath,
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
    // Support aliases
    const normalizedEnabled = enabledSkillIds.map(id => {
      if (id === 'doc_generator') return 'office_word_report';
      if (id === 'data_analysis_excel') return 'office_excel_master';
      if (id === 'ppt_outline_maker') return 'office_ppt_keynote';
      return id;
    });

    const selected = all.filter(s =>
      enabledSkillIds.includes(s.id) || normalizedEnabled.includes(s.id)
    );
    if (selected.length === 0) return '';

    return '\n\n' + selected.map(s => s.prompt).join('\n\n');
  }
}

export const skillManager = new SkillManager();
