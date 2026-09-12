import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { storageHub } from './storage-hub';
import { enterpriseHubManager } from './enterprise-hub-manager';
import { mcpManager } from './mcp-manager';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  prompt: string;
  category?: 'office' | 'dev' | 'custom' | 'enterprise';
  filePath?: string;
  version?: string;
  triggers?: string[];
  recommendedTools?: string[];
  rawFrontmatter?: Record<string, any>;
}

export function parseSkillMarkdown(rawContent: string): {
  frontmatter: Record<string, any>;
  body: string;
  name?: string;
  description?: string;
  version?: string;
  triggers?: string[];
  recommendedTools?: string[];
} {
  const trimmed = rawContent.trim();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    const titleMatch = trimmed.match(/^#\s+(.+)$/m);
    const descMatch = trimmed.match(/^>\s+(.+)$/m);
    return {
      frontmatter: {},
      body: trimmed,
      name: titleMatch ? titleMatch[1].trim() : undefined,
      description: descMatch ? descMatch[1].trim() : undefined
    };
  }

  const fmText = fmMatch[1];
  const body = fmMatch[2].trim();
  const frontmatter: Record<string, any> = {};

  const lines = fmText.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    if (trimmedLine.startsWith('-') && currentKey) {
      const val = trimmedLine.slice(1).trim().replace(/^['"]|['"]$/g, '');
      if (!currentArray) {
        currentArray = [];
        frontmatter[currentKey] = currentArray;
      }
      currentArray.push(val);
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1].trim();
      currentArray = null;
      const rawVal = kvMatch[2].trim();
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        const items = rawVal.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        frontmatter[currentKey] = items;
      } else if (rawVal !== '') {
        const unquoted = rawVal.replace(/^['"]|['"]$/g, '');
        frontmatter[currentKey] = unquoted;
      }
    }
  }

  const name = frontmatter.name || frontmatter.title;
  const description = frontmatter.description || frontmatter.desc;
  const version = frontmatter.version;
  const rawTriggers = frontmatter.triggers || frontmatter.keywords || frontmatter.trigger;
  const triggers: string[] = Array.isArray(rawTriggers)
    ? rawTriggers
    : (typeof rawTriggers === 'string' ? rawTriggers.split(',').map(s => s.trim()).filter(Boolean) : []);
  const rawTools = frontmatter.recommended_tools || frontmatter.recommendedTools || frontmatter.tools;
  const recommendedTools: string[] = Array.isArray(rawTools)
    ? rawTools
    : (typeof rawTools === 'string' ? rawTools.split(',').map(s => s.trim()).filter(Boolean) : []);

  return {
    frontmatter,
    body,
    name: typeof name === 'string' ? name : undefined,
    description: typeof description === 'string' ? description : undefined,
    version: typeof version === 'string' ? version : undefined,
    triggers: triggers.length > 0 ? triggers : undefined,
    recommendedTools: recommendedTools.length > 0 ? recommendedTools : undefined
  };
}

export function serializeSkillMarkdown(options: {
  name: string;
  description: string;
  version?: string;
  triggers?: string[];
  recommendedTools?: string[];
  body: string;
}): string {
  const version = options.version || '1.0.0';
  const triggers = options.triggers || [];
  const recommendedTools = options.recommendedTools || [];

  const fmParts: string[] = [
    '---',
    `name: ${options.name}`,
    `description: ${options.description}`,
    `version: ${version}`
  ];

  if (triggers.length > 0) {
    fmParts.push('triggers:');
    for (const t of triggers) {
      fmParts.push(`  - ${t}`);
    }
  }

  if (recommendedTools.length > 0) {
    fmParts.push('recommended_tools:');
    for (const tool of recommendedTools) {
      fmParts.push(`  - ${tool}`);
    }
  }

  fmParts.push('---', '');
  return `${fmParts.join('\n')}\n# ${options.name}\n\n${options.body.trim()}\n`;
}

const BUILTIN_SKILLS: SkillItem[] = [
  // 1. Anthropic & MiniMax 官方深度融合 Office 四件套
  {
    id: 'office_word_report',
    name: '公文方案与深度报告专家 (Anthropic & MiniMax 官方融合)',
    description: '融合 Anthropic 深度分析与 MiniMax 权威公文体系，撰写高水准技术方案白皮书、行政公文与深度研究报告',
    isBuiltin: true,
    category: 'office',
    version: '1.8.2',
    triggers: ['公文', '方案', '白皮书', '报告', 'word', 'docx'],
    recommendedTools: ['generate_docx', 'view_file', 'write_file'],
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
    version: '1.8.2',
    triggers: ['表格', 'excel', 'xlsx', '数据建模', '透视表', '公式'],
    recommendedTools: ['generate_excel', 'read_excel'],
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
    version: '1.8.2',
    triggers: ['ppt', 'pptx', '幻灯片', '路演', '商业提案', '演说'],
    recommendedTools: ['generate_pptx'],
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
    version: '1.8.2',
    triggers: ['会议纪要', '行动项', '决议', 'raci', 'meeting'],
    recommendedTools: ['write_file', 'generate_docx'],
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
    version: '1.8.2',
    triggers: ['api', '接口设计', 'restful', 'openapi', '契约'],
    recommendedTools: ['write_file', 'view_file'],
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
    version: '1.8.2',
    triggers: ['review', '代码走查', '审查', '安全走查', 'owasp'],
    recommendedTools: ['view_file', 'code_ast_inspector'],
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
    version: '1.8.2',
    triggers: ['单测', '单元测试', 'unit test', '回归验证', '测试用例'],
    recommendedTools: ['run_terminal_command', 'view_file'],
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
    version: '1.8.2',
    triggers: ['重构', 'clean code', '代码坏味道', 'solid', '解耦'],
    recommendedTools: ['view_file', 'write_file', 'code_ast_inspector'],
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
    version: '1.8.2',
    triggers: ['git commit', '提交规范', 'commit message', 'conventional commits'],
    recommendedTools: ['git_operations', 'run_terminal_command'],
    prompt: `【激活技能：Conventional Commits 规范助手】
- 在完成代码修改或给出提交建议时，使用标准 Conventional Commits 格式：
  <type>(<scope>): <short summary>
  [可选的详细正文描述]
  [可选的 BREAKING CHANGE 或 issue 关联]`
  },
  // 3. 企业级演化与云原生解决方案专家
  {
    id: 'idc_cloud_migration_expert',
    name: 'IDC与数据库向华为云迁移专家 (自主演进技能)',
    description: '针对 IDC 机房老旧数据库、CBS 系统与云主机资源盘点，出具符合华为云技术方案规范的高规格技术迁移白皮书',
    isBuiltin: true,
    category: 'office',
    version: '1.8.2',
    triggers: ['华为云', 'idc迁移', '数据库迁移', '上云', 'cbs', 'ecu'],
    recommendedTools: ['generate_docx', 'generate_excel'],
    prompt: `【激活技能：IDC与数据库向华为云迁移专家 (自主演进技能)】
- 严格遵循华为云与政企级系统上云技术规约：
  1. 资产盘点与量化分析：
     - 精准分析 IDC 存量主机 CPU、内存、存储与 ECU 折算指标；
     - 细分业务系统集群（如 SAP/复星医药 V2V、医联体、CDR数仓、SSO数据库、PACS医疗影像、集成平台、EMR电子病历等）；
     - 梳理数据库实例矩阵（MySQL、Greenplum 分布式数仓、SQL Server、Redis、Oracle RAC）；
  2. 华为云目标态选型与工具链推荐：
     - 计算与容器：弹性云服务器 ECS (C7/C6/M7)、云容器引擎 CCE；
     - 数据库与数仓：云数据库 GaussDB (for MySQL)、DWS (GaussDB for DWS 数仓)、RDS for SQL Server；
     - 迁移利器：数据复制服务 DRS (双向增量同步)、服务器迁移中心 SMS、对象存储迁移 OMS、gpbackup 离线快照；
  3. 交付物排版规范：
     - 调用内置原生 Word (generate_docx) 生成；
     - 必须包含标准封面（华为云蓝色调、版本号、密级）、自动目录、动态页码（第 X 页 / 共 Y 页）；
     - 正文必须包含不少于 10~17 个结构化表格（资产清单、ECU折算对照、迁移风险矩阵、回退演练排期、网络专线与带宽预算）；
     - 表格使用深蓝表头与纯白文字，斑马纹交替底色。`
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
    const dirsToScan = [primaryDir];

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
            const parsed = parseSkillMarkdown(content);
            const name = parsed.name || skillId;
            const description = parsed.description || `全局已安装技能 (${file})`;

            result.push({
              id: `custom:global:${skillId}`,
              name: `[自定义] ${name}`,
              description,
              isBuiltin: false,
              category: 'custom',
              filePath,
              version: parsed.version || '1.0.0',
              triggers: parsed.triggers,
              recommendedTools: parsed.recommendedTools,
              rawFrontmatter: parsed.frontmatter,
              prompt: `【激活全局自定义技能：${name}】\n${parsed.body || content}`
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
          const parsed = parseSkillMarkdown(content);
          const name = parsed.name || skillId;
          const description = parsed.description || `位于工作区 .asteam/skills/${file}`;

          result.push({
            id: `custom:workspace:${skillId}`,
            name: `[项目专属] ${name}`,
            description,
            isBuiltin: false,
            category: 'custom',
            filePath,
            version: parsed.version || '1.0.0',
            triggers: parsed.triggers,
            recommendedTools: parsed.recommendedTools,
            rawFrontmatter: parsed.frontmatter,
            prompt: `【激活工作区专属技能：${name}】\n${parsed.body || content}`
          });
        }
      }
    } catch {}

    return result;
  }

  loadEnterpriseSkills(): SkillItem[] {
    const exts = enterpriseHubManager.getExtensions().filter(e => e.type === 'skill' && e.enabled);
    const result: SkillItem[] = [];

    for (const ext of exts) {
      const skillPath = path.join(ext.installDir, 'SKILL.md');
      let promptContent = ext.manifest.description || '';
      if (fs.existsSync(skillPath)) {
        try {
          promptContent = fs.readFileSync(skillPath, 'utf-8');
        } catch {}
      }

      const parsed = parseSkillMarkdown(promptContent);

      result.push({
        id: `enterprise:${ext.id}`,
        name: `[企业私有] ${parsed.name || ext.name}`,
        description: parsed.description || `${ext.description} (SHA-256: ${ext.security.sha256Hash.slice(0, 8)})`,
        isBuiltin: false,
        category: 'enterprise',
        filePath: skillPath,
        version: parsed.version || ext.manifest.version || '1.0.0',
        triggers: parsed.triggers,
        recommendedTools: parsed.recommendedTools,
        rawFrontmatter: parsed.frontmatter,
        prompt: `【激活企业私有技能：${parsed.name || ext.name}】\n${parsed.body || promptContent}`
      });
    }

    return result;
  }

  getAllAvailableSkills(workspacePath: string | null): SkillItem[] {
    // P3: MCP Prompts 自动投影为 ASTeam 技能
    const mcpPrompts = mcpManager.getAllActiveMcpPrompts();
    const projectedMcpSkills: SkillItem[] = mcpPrompts.map(p => {
      const argsDesc = (p.arguments || []).map(a => `${a.name}${a.required ? '*' : ''}${a.description ? ` (${a.description})` : ''}`).join(', ');
      return {
        id: `mcp_prompt:${p.serverName}:${p.name}`,
        name: `[MCP 投影] ${p.name} (${p.serverName})`,
        description: p.description || `由 MCP 服务 [${p.serverName}] 提供的 Prompt 模板`,
        isBuiltin: false,
        category: 'custom',
        version: '1.8.2',
        triggers: [p.name, p.serverName],
        recommendedTools: [`mcp__${p.serverName}`],
        prompt: `【激活 MCP 投影技能: ${p.name} (源自 ${p.serverName})】\n- 模板描述: ${p.description || '无详细描述'}\n- 模板入参: [${argsDesc || '无参数'}]\n- 调用建议: 本技能模板源自外部 MCP 服务 [${p.serverName}]。执行任务时请遵循该提示词规范并调用对应 MCP 工具。`
      };
    });

    return [
      ...this.getBuiltinSkills(),
      ...this.loadGlobalSkills(),
      ...this.loadEnterpriseSkills(),
      ...this.loadCustomWorkspaceSkills(workspacePath),
      ...projectedMcpSkills
    ];
  }

  findSkill(query: string, workspacePath: string | null): SkillItem | undefined {
    if (!query) return undefined;
    const clean = query.trim().toLowerCase();
    const cleanBase = path.basename(clean, '.md').replace(/^(?:custom_global_|custom:global:|custom_workspace_|custom:workspace:|mcp_prompt:)/i, '');
    const all = this.getAllAvailableSkills(workspacePath);

    return all.find(s => {
      const sId = s.id.toLowerCase();
      const sIdBase = sId.replace(/^(?:custom:global:|custom:workspace:|mcp_prompt:)/i, '');
      const sName = s.name.toLowerCase();
      const sFileName = s.filePath ? path.basename(s.filePath, '.md').toLowerCase() : '';

      const matchTriggers = (s.triggers || []).some(t => clean.includes(t.toLowerCase()) || t.toLowerCase().includes(clean));

      return (
        sId === clean ||
        sIdBase === clean ||
        sIdBase === cleanBase ||
        sFileName === cleanBase ||
        sName === clean ||
        sName.includes(cleanBase) ||
        matchTriggers
      );
    });
  }

  installSkillFromContent(
    id: string,
    name: string,
    description: string,
    promptContent: string,
    options?: { version?: string; triggers?: string[]; recommendedTools?: string[] }
  ): SkillItem {
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const dir = this.getGlobalSkillsDir();
    const filePath = path.join(dir, `${cleanId}.md`);

    const parsed = parseSkillMarkdown(promptContent);
    const finalName = parsed.name || name;
    const finalDesc = parsed.description || description;
    const finalVersion = parsed.version || options?.version || '1.0.0';
    const finalTriggers = parsed.triggers || options?.triggers || [];
    const finalTools = parsed.recommendedTools || options?.recommendedTools || [];

    const fullContent = serializeSkillMarkdown({
      name: finalName,
      description: finalDesc,
      version: finalVersion,
      triggers: finalTriggers,
      recommendedTools: finalTools,
      body: parsed.body || promptContent
    });

    fs.writeFileSync(filePath, fullContent, 'utf-8');

    return {
      id: `custom:global:${cleanId}`,
      name: `[自定义] ${finalName}`,
      description: `全局已安装技能 (${cleanId}.md)`,
      isBuiltin: false,
      category: 'custom',
      filePath,
      version: finalVersion,
      triggers: finalTriggers.length > 0 ? finalTriggers : undefined,
      recommendedTools: finalTools.length > 0 ? finalTools : undefined,
      prompt: `【激活全局自定义技能：${finalName}】\n${fullContent}`
    };
  }

  installSkillFromFile(sourcePath: string): SkillItem {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`文件不存在: ${sourcePath}`);
    }
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const baseName = path.basename(sourcePath, '.md');
    const parsed = parseSkillMarkdown(content);
    const name = parsed.name || baseName;
    const desc = parsed.description || `从本地文件 ${path.basename(sourcePath)} 导入`;

    return this.installSkillFromContent(baseName, name, desc, content, {
      version: parsed.version,
      triggers: parsed.triggers,
      recommendedTools: parsed.recommendedTools
    });
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

  /**
   * P1: 微型技能索引清单 (< 200 Token)
   * 仅向 System Prompt 注入元数据索引，彻底告别全量技能注入导致的 Token 暴涨与指令稀释
   */
  getMicroSkillIndex(enabledSkillIds?: string[], workspacePath: string | null = null): string {
    const all = this.getAllAvailableSkills(workspacePath);
    if (!enabledSkillIds) {
      enabledSkillIds = all.map(s => s.id);
    }
    const normalizedEnabled = enabledSkillIds.map(id => {
      if (id === 'doc_generator') return 'office_word_report';
      if (id === 'data_analysis_excel') return 'office_excel_master';
      if (id === 'ppt_outline_maker') return 'office_ppt_keynote';
      return id;
    });

    const selected = all.filter(s =>
      enabledSkillIds!.includes(s.id) || normalizedEnabled.includes(s.id)
    );
    if (selected.length === 0) return '';

    const lines = selected.map(s => {
      const triggerStr = (s.triggers && s.triggers.length > 0)
        ? ` [触发: ${s.triggers.slice(0, 2).join(',')}]`
        : '';
      const briefDesc = s.description.length > 25 ? s.description.slice(0, 25) + '..' : s.description;
      return `- @${s.id}: ${briefDesc}${triggerStr}`;
    });

    return `【可用技能微型索引 (Micro Index)】\n${lines.join('\n')}`;
  }

  /**
   * 聚合已激活技能的完整 Prompt（含规约与工具联动绑定）
   */
  getAggregatedSkillPrompt(enabledSkillIds?: string[], workspacePath: string | null = null): string {
    const all = this.getAllAvailableSkills(workspacePath);
    if (!enabledSkillIds) {
      enabledSkillIds = all.map(s => s.id);
    }
    const normalizedEnabled = enabledSkillIds.map(id => {
      if (id === 'doc_generator') return 'office_word_report';
      if (id === 'data_analysis_excel') return 'office_excel_master';
      if (id === 'ppt_outline_maker') return 'office_ppt_keynote';
      return id;
    });

    const selected = all.filter(s =>
      enabledSkillIds!.includes(s.id) || normalizedEnabled.includes(s.id)
    );
    if (selected.length === 0) return '';

    return '\n\n' + selected.map(s => {
      let promptText = s.prompt;
      // P2: 规约 + 工具联动绑定 (Tools Binding)
      if (s.recommendedTools && s.recommendedTools.length > 0) {
        promptText += `\n\n【规约 + 工具联动绑定 (Recommended Tools)】\n本技能专属推荐协同调度工具: ${s.recommendedTools.join(', ')}。请在执行中优先调用以保障交付最高质量。`;
      }
      return promptText;
    }).join('\n\n');
  }

  /**
   * 自主提炼新技能 (Hermes 式 Skill 自演进沉淀体系)
   * 支持 Agent 在完成高频复合任务后自动封装沉淀出符合规约的专属技能 (YAML Frontmatter 格式)
   */
  distillSkill(
    id: string,
    name: string,
    description: string,
    prompt: string,
    target: 'workspace' | 'global' = 'global',
    workspacePath?: string | null,
    options?: { version?: string; triggers?: string[]; recommendedTools?: string[] }
  ): SkillItem {
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const parsed = parseSkillMarkdown(prompt);
    const finalName = parsed.name || name;
    const finalDesc = parsed.description || description;
    const finalVersion = parsed.version || options?.version || '1.0.0';
    const finalTriggers = parsed.triggers || options?.triggers || [];
    const finalTools = parsed.recommendedTools || options?.recommendedTools || [];

    const fullContent = serializeSkillMarkdown({
      name: finalName,
      description: finalDesc,
      version: finalVersion,
      triggers: finalTriggers,
      recommendedTools: finalTools,
      body: parsed.body || prompt
    });

    if (target === 'workspace' && workspacePath && fs.existsSync(workspacePath)) {
      const skillsDir = path.join(workspacePath, '.asteam', 'skills');
      if (!fs.existsSync(skillsDir)) {
        try {
          fs.mkdirSync(skillsDir, { recursive: true });
        } catch {}
      }
      const filePath = path.join(skillsDir, `${cleanId}.md`);
      fs.writeFileSync(filePath, fullContent, 'utf-8');
      return {
        id: `custom:workspace:${cleanId}`,
        name: `[项目专属] ${finalName}`,
        description: `位于工作区 .asteam/skills/${cleanId}.md`,
        isBuiltin: false,
        category: 'custom',
        filePath,
        version: finalVersion,
        triggers: finalTriggers.length > 0 ? finalTriggers : undefined,
        recommendedTools: finalTools.length > 0 ? finalTools : undefined,
        prompt: `【激活工作区专属技能：${finalName}】\n${fullContent}`
      };
    } else {
      return this.installSkillFromContent(cleanId, finalName, finalDesc, prompt, options);
    }
  }

  parseSkillMarkdown(rawContent: string, fallbackId?: string) {
    return parseSkillMarkdown(rawContent);
  }

  serializeSkillMarkdown(data: Parameters<typeof serializeSkillMarkdown>[0]): string {
    return serializeSkillMarkdown(data);
  }
}

export const skillManager = new SkillManager();
