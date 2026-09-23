import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
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
  // 复合型与资源扩展属性 (v1.11.0 / v2.0.2)
  isFolderSkill?: boolean;
  skillDir?: string;
  scriptsDir?: string;
  assetsDir?: string;
  referencesDir?: string;
  examplesDir?: string;
  isZipExtracted?: boolean;
  requirementsPath?: string;
  requirements?: string[];
  mtimeMs?: number;
}

export function compareSemver(v1?: string, v2?: string): number {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = v1.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
    version: '2.0.1',
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
  },
  // 4. 技能架构与记忆固化专家 (Skill Generator & Memory Distiller)
  {
    id: 'skill_generator',
    name: '技能架构师与自动生成专家 (Skill Generator & Memory Distiller)',
    description: '根据用户使用习惯、工作流沉淀与上下文需求，自动生成标准化 Skill (含 Frontmatter、执行规约、物理路径规划并可一键写入生效)',
    isBuiltin: true,
    category: 'custom',
    version: '2.0.1',
    triggers: [
      '创建技能',
      '生成技能',
      '新建技能',
      '制作skill',
      '制作技能',
      'skill generator',
      '编写技能',
      '习惯固化',
      '工作流固化',
      '生成skill'
    ],
    recommendedTools: ['write_file', 'view_file', 'read_directory', 'run_terminal_command'],
    prompt: `【激活官方技能：技能架构师与自动生成专家 (Skill Generator & Memory Distiller)】
你是 ASTeam Agent 的高级技能架构师。你的核心职责是：根据用户的明确指令、当前对话的工作流成果、或用户的使用偏好习惯，自动设计并生成符合 ASTeam / Antigravity 工业级规范的 Skill（技能）。

### 一、标准技能规范要求
每个技能必须包含标准 YAML Frontmatter 与规范正文：
\`\`\`markdown
---
name: 技能显示名称 (精准传达定位，如：华讯运营周报自动生成专家)
description: 一句话核心作用说明 (包含触发场景、输入前提与最终产出)
version: 1.0.0
triggers:
  - 核心关键词1
  - 触发词2
  - 英文关键词
recommendedTools:
  - write_file
  - generate_docx
---

# 技能标题

## 角色定位与设计目标
[说明该技能的专业领域与预期解决的核心痛点]

## 调度执行硬规约 (Execution Contract)
1. 前置检查与输入解析：明确需要用户提供的数据、文件或参数；
2. 核心工作流与分步指引：步骤清晰，逻辑闭环；
3. 输出与交付物规范：明确格式、美学要求或表格规范；
4. 容错与兜底机制：遇到异常时的处理方式。
\`\`\`

### 二、支持的技能形态与生成策略
1. **单文件技能 (Single-file Markdown Skill)**:
   - 适用于纯 Prompt 引导、格式转换、规范约束、报告撰写类任务；
   - 生成后，主动指导或直接调用 \`write_file\` 工具将其写入用户技能库：
     路径例如：\`D:\\\\ASTeamData\\\\skills\\\\<skill_id>.md\`。写入后系统会自动热加载，用户即可通过 \`@技能名称\` 唤起使用。
2. **复合型资源技能 (Folder Skill)**:
   - 适用于需要配合 Python 执行脚本、Excel/Word 模板文件的场景；
   - 规划标准目录结构：
     - \`<skill_id>/SKILL.md\` (核心描述与契约)
     - \`<skill_id>/scripts/\` (存放具体的执行脚本，如数据处理、API 调用脚本)
     - \`<skill_id>/assets/\` (存放模板、图标等资源)
     - \`<skill_id>/references/\` (参考规范与文档)
   - 在 \`SKILL.md\` 中遵循 ASTeam 物理路径约定，使用提供的绝对路径占位符进行调用。

### 三、基于习惯与记忆的自动提炼流程
1. **需求诊断与习惯洞察**：
   - 若用户表示“把我们刚刚做的工作流变成一个技能”或“记住我的这个偏好生成技能”，回顾上下文中的输入格式、处理逻辑、输出文件排版样式及特定约束；
   - 提取出用户偏好的语言风格、数据校验规则或固定模板。
2. **自动起草与优化**：
   - 命名力求直观专业；
   - 挑选 5~8 个最常用、不易与系统其他技能冲突的精准 \`triggers\`；
   - 推荐最精准的 \`recommendedTools\`。
3. **落地交付与确认**：
   - 完整展示生成的 Markdown 内容；
   - 询问或主动使用文件写入工具将其持久化至 \`skills/\` 目录，并告知用户“已成功生成并安装，现在你可以在输入框输入 @ 或在技能面板中直接勾选它”。`
  },
  // 5. 华讯（ECCOM）标准化交付与设计套件 (v2.0.1 内置官方技能)
  {
    id: 'huaxun_word_generator',
    name: '华讯交付文档与Word/PDF方案专家 (huaxun-word-generator)',
    description: '按华讯（ECCOM）知识模板格式规范 v2.3 生成高规格交付 Word（.docx）与 PDF，支持自动大纲与元数据收集、表头居中数据左对齐、版本控制、原模板品牌图文保持',
    isBuiltin: true,
    category: 'office',
    version: '2.0.1',
    triggers: [
      '华讯word',
      '华讯模板',
      '华讯文档',
      'huaxun-word',
      'huaxun_word',
      '华讯方案',
      '华讯交付',
      'eccom docx',
      'word交付',
      'pdf方案',
      '知识模板'
    ],
    recommendedTools: ['run_terminal_command', 'write_file', 'generate_docx'],
    prompt: `【激活官方内置技能：华讯交付文档与Word/PDF方案专家 (huaxun-word-generator)】
- 按华讯（ECCOM）知识模板格式规范 v2.3，生成符合规范的 Word (.docx) + PDF 交付文档：
  1. 初始化引导（前置问询与元数据收集）：
     在生成前，可先向用户确认以下核心元数据（或使用默认值）：
     - doc_title (文档标题)、doc_version (如 V1.0)、doc_date (日期)、project_name (项目名)、customer_name (客户名)、author (作者)、doc_type (通用知识/项目方案设计/实施验收/培训手册)；
     - 默认值：company_name="上海华讯网络系统有限公司"，logo=技能内 assets/logo_eccom_cn.png；
  2. 结构标准与骨架：
     - 通用知识：背景 -> 概念/架构 -> 实施要点 -> 总结
     - 项目方案/设计：项目概述（含项目概况表）-> 需求分析 -> 总体设计 -> 详细设计（含拓扑/配置）-> 实施计划
     - 实施/验收报告：项目信息 -> 实施范围与记录 -> 问题与处理 -> 验收结论 -> 签字盖章
     - 培训/操作手册：适用范围 -> 环境准备 -> 操作步骤（分步+小心/警告）-> 常见问题
     - 必须包含标准封面横幅、版本控制历史表、自动目录 (TOC)、表头居中且数据左对齐的标准表格；
  3. 执行方式：
     - 若宿主具备 Python 环境，可通过调用技能脚本一键生成：
       python "<skill_dir>/scripts/generate_huaxun_doc.py" --meta meta.json --content content.json --out <outDir> [--pdf]
     - 也可直接结合系统内置纯 JS 原生 Word 套件 (generate_docx) 生成符合同样华讯视觉规约的交付文档。`
  },
  {
    id: 'huaxun_excel_generator',
    name: '华讯交付表格与Excel建模专家 (huaxun-excel-generator)',
    description: '按公司《Excel模板（暂定）》生成标准化 Excel 交付文件，内置项目人员通讯录、设备清单、IP地址规划、验收检查表等标准 Sheet，自动环境预检与公式保护',
    isBuiltin: true,
    category: 'office',
    version: '2.0.1',
    triggers: [
      '华讯excel',
      '华讯表格',
      'huaxun-excel',
      'huaxun_excel',
      '华讯模板excel',
      'excel交付',
      '设备清单表格',
      'ip规划表',
      '人员通讯录表格'
    ],
    recommendedTools: ['run_terminal_command', 'write_file', 'generate_excel'],
    prompt: `【激活官方内置技能：华讯交付表格与Excel建模专家 (huaxun-excel-generator)】
- 遵循华讯（ECCOM）标准化项目交付表格规范与企业级多 Sheet 数据建模标准：
  1. 标准化工作表 (Sheets) 矩阵：
     - 【版本控制】：文档版本、更新时间、修订人、修订要点；
     - 【关于】：项目概述、客户信息、服务范围、编制依据；
     - 【人员通讯录】：姓名、单位、职务/角色、联系方式、职责分工；
     - 【设备清单】：设备名称、型号规格、序列号、安装位置、维保状态、责任人；
     - 【IP地址规划】：网段、IP 地址、子网掩码、网关、VLAN、连接设备/端口、用途；
     - 【验收检查表】：检查项、验收标准、测试方法、验收结果、确认人签字；
  2. 排版与视觉设计：
     - 表头采用深绿/华讯品牌色底色与纯白文字，冻结首行 (Freeze Panes)；
     - 数据行斑马纹交替，单元格对齐（文本居左、数值与状态居中、金额与量化右对齐）；
  3. 执行方式：
     - 可直接通过技能脚本批量生成：
       python "<skill_dir>/scripts/generate_huaxun_excel.py" --meta meta.json --content content.json --out <outDir>
     - 也可直接调用内置原生 Excel 套件 (generate_excel) 写入多 Sheet 与格式化数据。`
  },
  {
    id: 'asteam_ui_design',
    name: 'ASTeam UI 视觉与前端设计系统规范 (ASTeam Design System)',
    description: 'ASTeam 官方 UI 设计系统与视觉规范：松石绿 (#006857) 品牌主色、强调红 (#D31245)、语义状态色板、圆角/阴影/微动效规范与现代化组件排版准则',
    isBuiltin: true,
    category: 'dev',
    version: '2.0.1',
    triggers: [
      'asteam ui',
      'asteam ui 设计',
      'asteam-ui',
      'asteam 设计',
      'asteam规范',
      'ui规范',
      '设计系统',
      '前端规范',
      'tailwind规范',
      '品牌色'
    ],
    recommendedTools: ['write_file', 'view_file'],
    prompt: `【激活官方内置技能：ASTeam UI 视觉与前端设计系统规范 (ASTeam Design System)】
- 遵循 ASTeam 官方 UI 设计系统与现代企业级视觉设计规范：
  1. 品牌官方色板 (严格遵守，严禁臆测):
     - 主绿 (Pine Green): #006857 (--asteam-brand-primary)
     - 强调红 (Accent Red): #D31245 (--asteam-brand-accent，仅用于品牌/高光徽标，【严禁】用于系统错误或警报提示！)
     - 语义错误色 (Error Red): #B42318 (Light 模式) / #F87171 (Dark 模式)
     - 语义成功色: #15803D (--asteam-success)
     - 语义警告色: #B45309 (--asteam-warning)
     - 语义信息色: #0369A1 (--asteam-info)
     - 辅助松石浅绿: #3EB39C, #6BC39C (Dark 模式主色), #AAE4B4
  2. 主题与背景层次:
     - Light 模式: 背景 #F7F9F8, 卡片底色 #FFFFFF, 边框 #DDDDDD, 文本 #18181B
     - Dark 模式: 背景 #0A0A0B, 卡片底色 #141716, 边框 #303735, 文本 #F5F7F6
  3. 尺寸与微动效规范:
     - 圆角: 微型组件 6px (rounded-md), 卡片/面板 12px (rounded-xl), 状态胶囊 999px (rounded-full)
     - 阴影: 柔和精致 shadow-xs 或 shadow-sm，杜绝生硬浓黑重阴影
     - 动效: 快速响应 120ms，抽屉过渡 180ms，曲线 cubic-bezier(0.16, 1, 0.3, 1)
  4. 交付大屏与 HTML 生成规约:
     - 独立 HTML 页面必须在 <style> 内联注入完整的上述 CSS 变量及 Inter / Noto Sans SC 字体栈；
     - 数据表格必须包含横向滚动容器 (overflow-x: auto) 与最小宽度保障 (min-width: 600px)。`
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
    const candidateSkillsDirs = [
      path.join(process.cwd(), 'skills'),
      path.resolve('skills'),
      'D:\\ASTeamAIProject\\Skills',
      'D:\\AIProject\\asteam-agent\\skills'
    ];

    return BUILTIN_SKILLS
      .filter(skill => !storageHub.isSkillUninstalled(skill.id))
      .map(skill => {
      if (skill.id === 'huaxun_word_generator' || skill.id === 'huaxun_excel_generator' || skill.id === 'asteam_ui_design') {
        const folderName = skill.id === 'huaxun_word_generator' 
          ? 'huaxun-word-generator' 
          : skill.id === 'huaxun_excel_generator' 
          ? 'huaxun-excel-generator' 
          : 'asteam-ui-design';
        
        let foundDir = '';
        for (const base of candidateSkillsDirs) {
          const cand = path.join(base, folderName);
          if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) {
            foundDir = cand;
            break;
          }
        }

        if (foundDir) {
          const scriptsDir = path.join(foundDir, 'scripts');
          const assetsDir = path.join(foundDir, 'assets');
          const referencesDir = path.join(foundDir, 'references');
          const examplesDir = path.join(foundDir, 'examples');
          const entryFile = path.join(foundDir, 'SKILL.md');

          return {
            ...skill,
            isFolderSkill: true,
            filePath: fs.existsSync(entryFile) ? entryFile : skill.filePath,
            skillDir: foundDir,
            scriptsDir: fs.existsSync(scriptsDir) ? scriptsDir : undefined,
            assetsDir: fs.existsSync(assetsDir) ? assetsDir : undefined,
            referencesDir: fs.existsSync(referencesDir) ? referencesDir : undefined,
            examplesDir: fs.existsSync(examplesDir) ? examplesDir : undefined
          };
        }
      }
      return skill;
    });
  }

  /**
   * 将一个复合型技能目录 (包含 SKILL.md 或 skill.md) 解析为 SkillItem
   */
  private buildSkillFromFolder(
    folderPath: string,
    scope: 'global' | 'workspace' | 'extra',
    isZipExtracted = false
  ): SkillItem | null {
    try {
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        return null;
      }

      // 寻找入口 Markdown 文件 (SKILL.md > skill.md > README.md)
      const candidates = ['SKILL.md', 'skill.md', 'README.md'];
      let entryFile: string | null = null;
      let actualFolderPath = folderPath;

      for (const cand of candidates) {
        const p = path.join(folderPath, cand);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          // 如果是 README.md，必须包含 frontmatter 才能认定为技能定义
          if (cand === 'README.md') {
            const sample = fs.readFileSync(p, 'utf-8').trim();
            if (!sample.startsWith('---')) continue;
          }
          entryFile = p;
          break;
        }
      }

      // 若当前目录未直接找到入口，递归探测一级与二级非系统子目录 (应对 zip 解压或文件夹导入后带有多层同名/子目录的情况)
      if (!entryFile) {
        const findEntryRecursive = (dir: string, depth = 0): { entry: string; folder: string } | null => {
          if (depth > 2) return null;
          try {
            const subEntries = fs.readdirSync(dir, { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isDirectory() && !sub.name.startsWith('.') && sub.name !== '__MACOSX' && sub.name !== 'node_modules' && sub.name !== 'dist' && sub.name !== '.git') {
                const subFolder = path.join(dir, sub.name);
                for (const cand of candidates) {
                  const subP = path.join(subFolder, cand);
                  if (fs.existsSync(subP) && fs.statSync(subP).isFile()) {
                    if (cand === 'README.md') {
                      const sample = fs.readFileSync(subP, 'utf-8').trim();
                      if (!sample.startsWith('---')) continue;
                    }
                    return { entry: subP, folder: subFolder };
                  }
                }
                const nested = findEntryRecursive(subFolder, depth + 1);
                if (nested) return nested;
              }
            }
          } catch {}
          return null;
        };

        const found = findEntryRecursive(folderPath, 0);
        if (found) {
          entryFile = found.entry;
          actualFolderPath = found.folder;
        }
      }

      if (!entryFile) return null;

      const content = fs.readFileSync(entryFile, 'utf-8');
      const parsed = parseSkillMarkdown(content);
      const folderBaseName = path.basename(actualFolderPath);
      const rawName = parsed.name || folderBaseName;
      const cleanId = (parsed.frontmatter?.name || folderBaseName).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

      // 探测 Python 依赖声明 (requirements.txt)
      const reqCandidate1 = path.join(actualFolderPath, 'requirements.txt');
      const reqCandidate2 = path.join(actualFolderPath, 'scripts', 'requirements.txt');
      let requirementsPath: string | undefined;
      let requirements: string[] | undefined;
      if (fs.existsSync(reqCandidate1) && fs.statSync(reqCandidate1).isFile()) {
        requirementsPath = reqCandidate1;
      } else if (fs.existsSync(reqCandidate2) && fs.statSync(reqCandidate2).isFile()) {
        requirementsPath = reqCandidate2;
      }
      if (requirementsPath) {
        try {
          const reqRaw = fs.readFileSync(requirementsPath, 'utf-8');
          requirements = reqRaw.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
        } catch {}
      }

      // 探测复合资源子目录 (基于真实技能实际所在目录 actualFolderPath)
      const scriptsDirCandidate = path.join(actualFolderPath, 'scripts');
      const assetsDirCandidate = path.join(actualFolderPath, 'assets');
      const referencesDirCandidate = path.join(actualFolderPath, 'references');
      const examplesDirCandidate = path.join(actualFolderPath, 'examples');

      const scriptsDir = fs.existsSync(scriptsDirCandidate) && fs.statSync(scriptsDirCandidate).isDirectory()
        ? scriptsDirCandidate
        : undefined;
      const assetsDir = fs.existsSync(assetsDirCandidate) && fs.statSync(assetsDirCandidate).isDirectory()
        ? assetsDirCandidate
        : undefined;
      const referencesDir = fs.existsSync(referencesDirCandidate) && fs.statSync(referencesDirCandidate).isDirectory()
        ? referencesDirCandidate
        : undefined;
      const examplesDir = fs.existsSync(examplesDirCandidate) && fs.statSync(examplesDirCandidate).isDirectory()
        ? examplesDirCandidate
        : undefined;

      // 结构化注入物理绝对路径与依赖规约，彻底保障 Agent 执行脚本时不迷路、不报错
      let physicalSection = '';
      if (scriptsDir || assetsDir || referencesDir || examplesDir || requirementsPath) {
        physicalSection = `\n\n【复合技能本地物理资源与运行环境规约 (Composite Skill Physical Resources & Preflight)】\n` +
          `- 技能物理根目录 (Skill Root): ${actualFolderPath}\n` +
          (scriptsDir ? `- 脚本执行目录 (Scripts Dir): ${scriptsDir}\n` : '') +
          (assetsDir ? `- 模板与资产目录 (Assets Dir): ${assetsDir}\n` : '') +
          (referencesDir ? `- 规范与参考目录 (References Dir): ${referencesDir}\n` : '') +
          (examplesDir ? `- 样例示范目录 (Examples Dir): ${examplesDir}\n` : '') +
          (requirementsPath ? `- 依赖清单路径 (Requirements): ${requirementsPath}${requirements && requirements.length > 0 ? ` [包含: ${requirements.slice(0, 5).join(', ')}${requirements.length > 5 ? ' 等' : ''}]` : ''}\n` : '') +
          `- 调度执行硬规范: 当需要执行 Python 脚本、预检依赖或读取 Word/Excel 模板时，必须使用上述绝对物理路径直接调用，严禁臆测相对路径！\n` +
          (requirementsPath ? `- 依赖自动装配指示: 首次执行脚本若出现 ModuleNotFoundError，请调用 run_terminal_command 执行 \`pip install -r "${requirementsPath}"\` 自动装配依赖！\n` : '');
      }

      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(entryFile).mtimeMs;
      } catch {}

      const scopeTag = scope === 'workspace' ? '项目专属' : scope === 'extra' ? '外部技能' : '自定义';
      const prompt = `【激活${scopeTag}技能：${rawName}】${physicalSection}\n${parsed.body || content}`;

      return {
        id: `custom:${scope}:${cleanId}`,
        name: `[${scopeTag}] ${rawName}`,
        description: parsed.description || `复合型本地技能 (${folderBaseName})`,
        isBuiltin: false,
        category: 'custom',
        filePath: entryFile,
        version: parsed.version || '1.0.0',
        triggers: parsed.triggers,
        recommendedTools: parsed.recommendedTools,
        rawFrontmatter: parsed.frontmatter,
        isFolderSkill: true,
        skillDir: actualFolderPath,
        scriptsDir,
        assetsDir,
        referencesDir,
        examplesDir,
        isZipExtracted,
        requirementsPath,
        requirements,
        mtimeMs,
        prompt
      };
    } catch (e) {
      console.warn(`[SkillManager] Failed to build skill from folder ${folderPath}:`, e);
      return null;
    }
  }

  /**
   * 解压并提取 ZIP 打包技能包
   */
  private extractAndLoadZip(zipFilePath: string, scope: 'global' | 'workspace' | 'extra'): SkillItem[] {
    try {
      if (!fs.existsSync(zipFilePath)) return [];
      const zipBaseName = path.basename(zipFilePath, '.zip');
      const extractedBaseDir = storageHub.getExtractedSkillsDir();
      const targetDir = path.join(extractedBaseDir, zipBaseName);

      // 若尚未解压或 zip 有更新，则执行解包
      let shouldExtract = !fs.existsSync(targetDir);
      if (!shouldExtract) {
        try {
          const zipMtime = fs.statSync(zipFilePath).mtimeMs;
          const targetMtime = fs.statSync(targetDir).mtimeMs;
          if (zipMtime > targetMtime) {
            shouldExtract = true;
          }
        } catch {}
      }

      if (shouldExtract) {
        try {
          if (fs.existsSync(targetDir)) {
            try {
              fs.rmSync(targetDir, { recursive: true, force: true });
            } catch {}
          }
          fs.mkdirSync(targetDir, { recursive: true });
          const zip = new AdmZip(zipFilePath);
          zip.extractAllTo(targetDir, true);
        } catch (err) {
          console.warn(`[SkillManager] Failed to extract zip ${zipFilePath}:`, err);
          return [];
        }
      }

      const result: SkillItem[] = [];

      // 1. 尝试直接从解压根目录加载
      const rootSkill = this.buildSkillFromFolder(targetDir, scope, true);
      if (rootSkill) {
        result.push(rootSkill);
        return result;
      }

      // 2. 若根目录下无 SKILL.md，探测解压目录内部的一级子目录 (常见于 zip 包内包含外层同名文件夹)
      try {
        const subEntries = fs.readdirSync(targetDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory() && !sub.name.startsWith('.') && sub.name !== '__MACOSX') {
            const subSkill = this.buildSkillFromFolder(path.join(targetDir, sub.name), scope, true);
            if (subSkill) {
              result.push(subSkill);
            }
          }
        }
      } catch {}

      return result;
    } catch (e) {
      console.warn(`[SkillManager] extractAndLoadZip error on ${zipFilePath}:`, e);
      return [];
    }
  }

  /**
   * 递归深度扫描目标目录：
   * - 递归解析复合型技能文件夹 (含 SKILL.md / skill.md)
   * - 识别并自动解包加载 .zip 技能
   * - 穿透 dist 目录寻找 zip 技能包
   * - 兼容单文件 .md 技能 (排除纯文档 README.md)
   */
  public scanDirectoryForSkills(
    dir: string,
    scope: 'global' | 'workspace' | 'extra',
    seenIds: Set<string>
  ): SkillItem[] {
    if (!fs.existsSync(dir)) return [];
    const skillMap = new Map<string, SkillItem>();

    const registerSkill = (item: SkillItem) => {
      // 标准化比较 key (例如 huaxun-excel-generator)
      const baseKey = (item.rawFrontmatter?.name || path.basename(item.filePath || item.id, '.md'))
        .toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!skillMap.has(baseKey)) {
        skillMap.set(baseKey, item);
        seenIds.add(item.id.toLowerCase());
      } else {
        const existing = skillMap.get(baseKey)!;
        const verDiff = compareSemver(item.version, existing.version);
        const newScore = (item.isFolderSkill ? 10 : 0) + (item.scriptsDir ? 20 : 0) + (item.assetsDir ? 10 : 0);
        const oldScore = (existing.isFolderSkill ? 10 : 0) + (existing.scriptsDir ? 20 : 0) + (existing.assetsDir ? 10 : 0);
        const isNewerMtime = (item.mtimeMs || 0) > (existing.mtimeMs || 0);

        if (verDiff > 0 || (verDiff === 0 && (newScore > oldScore || (newScore === oldScore && isNewerMtime)))) {
          skillMap.set(baseKey, item);
          seenIds.add(item.id.toLowerCase());
        }
      }
    };

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // A. 探测 .zip 压缩技能包
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
          const zipSkills = this.extractAndLoadZip(fullPath, scope);
          for (const s of zipSkills) {
            registerSkill(s);
          }
          continue;
        }

        // B. 探测单文件 Markdown 技能
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          // 纯说明性质的 README.md 若无 frontmatter 则不当作独立技能
          if (entry.name.toLowerCase() === 'readme.md') {
            const content = fs.readFileSync(fullPath, 'utf-8').trim();
            if (!content.startsWith('---')) continue;
          }

          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = parseSkillMarkdown(content);
          const skillId = (parsed.frontmatter?.name || entry.name.replace(/\.md$/i, '')).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const name = parsed.name || skillId;
          const scopeTag = scope === 'workspace' ? '项目专属' : scope === 'extra' ? '外部技能' : '自定义';

          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(fullPath).mtimeMs;
          } catch {}

          registerSkill({
            id: `custom:${scope}:${skillId}`,
            name: `[${scopeTag}] ${name}`,
            description: parsed.description || `单文件技能 (${entry.name})`,
            isBuiltin: false,
            category: 'custom',
            filePath: fullPath,
            version: parsed.version || '1.0.0',
            triggers: parsed.triggers,
            recommendedTools: parsed.recommendedTools,
            rawFrontmatter: parsed.frontmatter,
            mtimeMs,
            prompt: `【激活${scopeTag}技能：${name}】\n${parsed.body || content}`
          });
          continue;
        }

        // C. 探测子目录
        if (entry.isDirectory()) {
          // 排除系统及内部保留目录
          if (
            entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === '__MACOSX' ||
            entry.name === 'skills_extracted'
          ) {
            continue;
          }

          // 若子目录为 dist，穿透扫描里面的 .zip 文件
          if (entry.name.toLowerCase() === 'dist') {
            try {
              const distFiles = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const df of distFiles) {
                if (df.isFile() && df.name.toLowerCase().endsWith('.zip')) {
                  const zipSkills = this.extractAndLoadZip(path.join(fullPath, df.name), scope);
                  for (const s of zipSkills) {
                    registerSkill(s);
                  }
                }
              }
            } catch {}
            continue;
          }

          // 尝试将子目录解析为复合技能
          const folderSkill = this.buildSkillFromFolder(fullPath, scope);
          if (folderSkill) {
            registerSkill(folderSkill);
          } else {
            // 若自身未直接匹配，进一步探测内部独立子文件夹 (应对外层包裹目录或多技能包聚合仓库)
            try {
              const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const sub of subEntries) {
                if (sub.isDirectory() && !sub.name.startsWith('.') && sub.name !== '__MACOSX' && sub.name !== 'node_modules') {
                  const subSkill = this.buildSkillFromFolder(path.join(fullPath, sub.name), scope);
                  if (subSkill) {
                    registerSkill(subSkill);
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn(`[SkillManager] Error scanning directory ${dir}:`, err);
    }

    return Array.from(skillMap.values());
  }

  loadGlobalSkills(): SkillItem[] {
    const primaryDir = this.getGlobalSkillsDir();
    const extractedDir = storageHub.getExtractedSkillsDir();
    const extraDirs = storageHub.getExtraSkillDirs();

    const globalMap = new Map<string, SkillItem>();
    const seenIds = new Set<string>();

    const mergeSkills = (skills: SkillItem[], sourcePriority: number) => {
      // sourcePriority: 3 = primaryDir (用户在数据中枢明确导入/更新), 2 = extractedDir, 1 = extraDirs
      for (const item of skills) {
        const baseKey = (item.rawFrontmatter?.name || path.basename(item.filePath || item.id, '.md'))
          .toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!globalMap.has(baseKey)) {
          globalMap.set(baseKey, item);
          (item as any)._priority = sourcePriority;
        } else {
          const existing = globalMap.get(baseKey)!;
          const existingPriority = (existing as any)._priority || 0;

          const verDiff = compareSemver(item.version, existing.version);
          const newScore = (item.isFolderSkill ? 10 : 0) + (item.scriptsDir ? 20 : 0) + (item.assetsDir ? 10 : 0);
          const oldScore = (existing.isFolderSkill ? 10 : 0) + (existing.scriptsDir ? 20 : 0) + (existing.assetsDir ? 10 : 0);
          const isNewerMtime = (item.mtimeMs || 0) > (existing.mtimeMs || 0);

          let shouldReplace = false;
          if (verDiff > 0) {
            shouldReplace = true;
          } else if (verDiff === 0) {
            if (sourcePriority > existingPriority) {
              shouldReplace = true;
            } else if (sourcePriority === existingPriority) {
              if (newScore > oldScore) {
                shouldReplace = true;
              } else if (newScore === oldScore && isNewerMtime) {
                shouldReplace = true;
              }
            }
          }

          if (shouldReplace) {
            globalMap.set(baseKey, item);
            (item as any)._priority = sourcePriority;
          }
        }
      }
    };

    // 1. 扫描外部技能目录 (如 D:\ASTeamAIProject\Skills) (priority: 1)
    for (const extraDir of extraDirs) {
      if (!fs.existsSync(extraDir)) continue;
      const extraSkills = this.scanDirectoryForSkills(extraDir, 'extra', seenIds);
      mergeSkills(extraSkills, 1);
    }

    // 2. 扫描解压缓存区目录 (priority: 2)
    if (fs.existsSync(extractedDir)) {
      try {
        const extractedEntries = fs.readdirSync(extractedDir, { withFileTypes: true });
        for (const e of extractedEntries) {
          if (e.isDirectory() && !e.name.startsWith('.')) {
            const folderSkill = this.buildSkillFromFolder(path.join(extractedDir, e.name), 'global', true);
            if (folderSkill) {
              mergeSkills([folderSkill], 2);
            }
          }
        }
      } catch {}
    }

    // 3. 扫描主全局技能目录 (priority: 3 - 用户明确安装在此，最高优先级)
    const primarySkills = this.scanDirectoryForSkills(primaryDir, 'global', seenIds);
    mergeSkills(primarySkills, 3);

    return Array.from(globalMap.values());
  }

  loadCustomWorkspaceSkills(workspacePath: string | null): SkillItem[] {
    if (!workspacePath || !fs.existsSync(workspacePath)) return [];

    const skillsDir = path.join(workspacePath, '.asteam', 'skills');
    if (!fs.existsSync(skillsDir)) return [];

    const seenIds = new Set<string>();
    return this.scanDirectoryForSkills(skillsDir, 'workspace', seenIds);
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

    const all = [
      ...this.getBuiltinSkills(),
      ...this.loadGlobalSkills(),
      ...this.loadEnterpriseSkills(),
      ...this.loadCustomWorkspaceSkills(workspacePath),
      ...projectedMcpSkills
    ];

    return all.filter(s => !storageHub.isSkillUninstalled(s.id));
  }

  findSkill(query: string, workspacePath: string | null): SkillItem | undefined {
    if (!query) return undefined;
    const clean = query.trim().toLowerCase();
    const cleanBase = path.basename(clean, '.md')
      .replace(/^(?:custom_global_|custom:global:|custom_workspace:|custom:workspace:|custom_extra_|custom:extra:|mcp_prompt:)/i, '');
    const cleanNormalized = cleanBase.replace(/[^a-z0-9]/g, '');
    const all = this.getAllAvailableSkills(workspacePath);

    // Stage 1: 精确 ID 匹配 (最高优先级，严禁被普通 triggers 截胡)
    const exactIdMatch = all.find(s => {
      const sId = s.id.toLowerCase();
      const sIdBase = sId.replace(/^(?:custom:global:|custom:workspace:|custom:extra:|mcp_prompt:)/i, '');
      const sIdNorm = sIdBase.replace(/[^a-z0-9]/g, '');
      return sId === clean || sIdBase === clean || sIdBase === cleanBase || sIdNorm === cleanNormalized;
    });
    if (exactIdMatch) return exactIdMatch;

    // Stage 2: 文件夹或文件名精确匹配
    const fileDirMatch = all.find(s => {
      const sFileName = s.filePath ? path.basename(s.filePath, '.md').toLowerCase() : '';
      const sDirName = s.skillDir ? path.basename(s.skillDir).toLowerCase() : '';
      return (
        sFileName === cleanBase ||
        sDirName === cleanBase ||
        (sDirName && sDirName.replace(/[^a-z0-9]/g, '') === cleanNormalized)
      );
    });
    if (fileDirMatch) return fileDirMatch;

    // Stage 3: 技能标题/名称精确匹配
    const exactNameMatch = all.find(s => {
      const sName = s.name.toLowerCase();
      const sNameNorm = sName.replace(/[^a-z0-9]/g, '');
      return sName === clean || sNameNorm === cleanNormalized;
    });
    if (exactNameMatch) return exactNameMatch;

    // Stage 4: 技能名称包含关键词匹配
    const partialNameMatch = all.find(s => {
      const sName = s.name.toLowerCase();
      return sName.includes(cleanBase) || sName.includes(clean);
    });
    if (partialNameMatch) return partialNameMatch;

    // Stage 5: Triggers 触发词兜底回退匹配
    return all.find(s => {
      return (s.triggers || []).some(t => {
        const tLower = t.toLowerCase();
        return clean.includes(tLower) || tLower.includes(clean);
      });
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

    storageHub.unrecordUninstalledSkill(cleanId);
    storageHub.unrecordUninstalledSkill(`custom:global:${cleanId}`);

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
      throw new Error(`文件或目录不存在: ${sourcePath}`);
    }

    const stat = fs.statSync(sourcePath);

    // 1. 如果导入的是 ZIP 或 .skill 压缩包
    const lowerSource = sourcePath.toLowerCase();
    const isZipOrSkill = stat.isFile() && (lowerSource.endsWith('.zip') || lowerSource.endsWith('.skill'));
    if (isZipOrSkill) {
      const zipBaseName = path.basename(sourcePath).replace(/\.(?:skill\.zip|skill|zip)$/i, '');
      const targetDir = path.join(this.getGlobalSkillsDir(), zipBaseName);
      
      // 关键优化：若已有同名旧目录，先全量清空，确保纯净覆盖更新，彻底杜绝僵尸陈旧脚本！
      if (fs.existsSync(targetDir)) {
        try {
          fs.rmSync(targetDir, { recursive: true, force: true });
        } catch (rmErr) {
          console.warn(`[SkillManager] Failed to clean existing targetDir ${targetDir}:`, rmErr);
        }
      }
      fs.mkdirSync(targetDir, { recursive: true });
      const zip = new AdmZip(sourcePath);
      zip.extractAllTo(targetDir, true);

      const unrecordTombstones = (item: SkillItem) => {
        storageHub.unrecordUninstalledSkill(item.id);
        const clean = item.id.replace(/^custom:(global|workspace|extra):/, '');
        storageHub.unrecordUninstalledSkill(clean);
        storageHub.unrecordUninstalledSkill(clean.replace(/_/g, '-'));
        storageHub.unrecordUninstalledSkill(clean.replace(/-/g, '_'));
        if (item.rawFrontmatter?.name) {
          storageHub.unrecordUninstalledSkill(item.rawFrontmatter.name);
        }
        if (item.skillDir) {
          storageHub.unrecordUninstalledSkill(path.basename(item.skillDir));
        }
      };

      // 探测解压后的技能包
      const directSkill = this.buildSkillFromFolder(targetDir, 'global');
      if (directSkill) {
        unrecordTombstones(directSkill);
        return directSkill;
      }

      // 检查是否包含子文件夹
      const subEntries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isDirectory() && !sub.name.startsWith('.')) {
          const subSkill = this.buildSkillFromFolder(path.join(targetDir, sub.name), 'global');
          if (subSkill) {
            unrecordTombstones(subSkill);
            return subSkill;
          }
        }
      }
      throw new Error(`ZIP 包中未找到包含 SKILL.md 或有效技能元数据的入口`);
    }

    // 2. 如果导入的是文件夹
    if (stat.isDirectory()) {
      const folderName = path.basename(sourcePath);
      const targetDir = path.join(this.getGlobalSkillsDir(), folderName);

      // 优先探测该文件夹本身是否为包含 SKILL.md / skill.md 的单一复合技能
      let hasRootSkill = false;
      const candidates = ['SKILL.md', 'skill.md', 'README.md'];
      for (const cand of candidates) {
        if (fs.existsSync(path.join(sourcePath, cand))) {
          hasRootSkill = true;
          break;
        }
      }

      const unrecordTombstones = (item: SkillItem) => {
        storageHub.unrecordUninstalledSkill(item.id);
        const clean = item.id.replace(/^custom:(global|workspace|extra):/, '');
        storageHub.unrecordUninstalledSkill(clean);
        storageHub.unrecordUninstalledSkill(clean.replace(/_/g, '-'));
        storageHub.unrecordUninstalledSkill(clean.replace(/-/g, '_'));
        if (item.rawFrontmatter?.name) {
          storageHub.unrecordUninstalledSkill(item.rawFrontmatter.name);
        }
        if (item.skillDir) {
          storageHub.unrecordUninstalledSkill(path.basename(item.skillDir));
        }
      };

      if (hasRootSkill) {
        if (path.normalize(sourcePath) !== path.normalize(targetDir)) {
          if (fs.existsSync(targetDir)) {
            try {
              fs.rmSync(targetDir, { recursive: true, force: true });
            } catch {}
          }
          fs.cpSync(sourcePath, targetDir, { recursive: true });
        }
        const folderSkill = this.buildSkillFromFolder(targetDir, 'global');
        if (folderSkill) {
          unrecordTombstones(folderSkill);
          return folderSkill;
        }
      }

      // 若根目录没有直接包含 SKILL.md，探测其子目录是否包含复合技能 (例如选择的是外部合集仓库目录，如 D:\ASTeamAIProject\Skills)
      try {
        const subEntries = fs.readdirSync(sourcePath, { withFileTypes: true });
        const foundSubSkills: SkillItem[] = [];
        for (const sub of subEntries) {
          if (
            sub.isDirectory() &&
            !sub.name.startsWith('.') &&
            sub.name !== 'node_modules' &&
            sub.name !== '__MACOSX' &&
            sub.name !== 'dist'
          ) {
            const subPath = path.join(sourcePath, sub.name);
            const subSkill = this.buildSkillFromFolder(subPath, 'extra');
            if (subSkill) {
              unrecordTombstones(subSkill);
              foundSubSkills.push(subSkill);
            }
          }
        }

        if (foundSubSkills.length > 0) {
          // 智能关联为外部技能仓库，持久化进 extraSkillDirs，令其永久有效
          storageHub.addExtraSkillDir(sourcePath);
          return foundSubSkills[0];
        }
      } catch (scanErr) {
        console.warn(`[SkillManager] Error scanning subfolders in ${sourcePath}:`, scanErr);
      }

      // 兜底策略：若无任何 SKILL.md，但用户明确选中了该文件夹作为技能，自动为其生成基础 SKILL.md 骨架并注册
      if (path.normalize(sourcePath) !== path.normalize(targetDir)) {
        if (fs.existsSync(targetDir)) {
          try {
            fs.rmSync(targetDir, { recursive: true, force: true });
          } catch {}
        }
        fs.cpSync(sourcePath, targetDir, { recursive: true });
      }
      const scaffoldSkillMd = path.join(targetDir, 'SKILL.md');
      if (!fs.existsSync(scaffoldSkillMd)) {
        const defaultContent = `---\nname: ${folderName}\ndescription: 本地导入技能文件夹 (${folderName})\nversion: 1.0.0\ntriggers:\n  - ${folderName.toLowerCase()}\n---\n\n# ${folderName}\n\n【已激活本地文件夹技能：${folderName}】\n- 本技能由本地文件夹自动解析导入。\n`;
        fs.writeFileSync(scaffoldSkillMd, defaultContent, 'utf-8');
      }
      const scaffoldSkill = this.buildSkillFromFolder(targetDir, 'global');
      if (scaffoldSkill) {
        unrecordTombstones(scaffoldSkill);
        return scaffoldSkill;
      }

      throw new Error(`所选目录中未找到有效技能入口`);
    }

    // 3. 如果导入的是单文件 Markdown
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
    const cleanId = skillId.replace(/^custom:(global|workspace|extra):/, '');
    let deleted = false;

    // 0. 尝试通过 findSkill 探测实际物理文件或文件夹路径并实施物理删除
    const targetSkill = this.findSkill(skillId, null);
    if (targetSkill) {
      if (targetSkill.filePath && fs.existsSync(targetSkill.filePath)) {
        try {
          fs.unlinkSync(targetSkill.filePath);
          deleted = true;
        } catch {}
      }
      if (targetSkill.skillDir && fs.existsSync(targetSkill.skillDir)) {
        try {
          fs.rmSync(targetSkill.skillDir, { recursive: true, force: true });
          deleted = true;
        } catch {}
      }
    }

    // 1. 尝试删除全局 md 文件
    const targetFile = path.join(dir, `${cleanId}.md`);
    if (fs.existsSync(targetFile)) {
      try {
        fs.unlinkSync(targetFile);
        deleted = true;
      } catch {}
    }

    // 2. 尝试删除文件夹技能
    const targetFolder = path.join(dir, cleanId);
    if (fs.existsSync(targetFolder) && fs.statSync(targetFolder).isDirectory()) {
      try {
        fs.rmSync(targetFolder, { recursive: true, force: true });
        deleted = true;
      } catch {}
    }

    // 3. 尝试从解压缓存区删除
    const extractedFolder = path.join(storageHub.getExtractedSkillsDir(), cleanId);
    if (fs.existsSync(extractedFolder)) {
      try {
        fs.rmSync(extractedFolder, { recursive: true, force: true });
        deleted = true;
      } catch {}
    }

    // 4. 无论物理落盘状态如何（即使是外部只读目录或内置技能），一律登记卸载墓碑，确保重启时绝不再次出现
    storageHub.recordUninstalledSkill(skillId);
    storageHub.recordUninstalledSkill(cleanId);
    storageHub.recordUninstalledSkill(cleanId.replace(/_/g, '-'));
    storageHub.recordUninstalledSkill(cleanId.replace(/-/g, '_'));
    return true;
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

    const selected = all.filter(s => {
      if (enabledSkillIds!.includes(s.id) || normalizedEnabled.includes(s.id)) return true;
      const sClean = s.id.replace(/^custom:(?:global|workspace|extra):/, '').toLowerCase();
      const sCleanNorm = sClean.replace(/[^a-z0-9]/g, '');
      const sName = (s.rawFrontmatter?.name || s.name).replace(/^\[.*?\]\s*/, '').toLowerCase();
      const sNameNorm = sName.replace(/[^a-z0-9]/g, '');

      return enabledSkillIds!.some(eid => {
        const eClean = eid.replace(/^custom:(?:global|workspace|extra):/, '').toLowerCase();
        const eCleanNorm = eClean.replace(/[^a-z0-9]/g, '');
        return (
          eClean === sClean ||
          (eCleanNorm.length >= 3 && eCleanNorm === sCleanNorm) ||
          eClean === sName ||
          (eCleanNorm.length >= 3 && eCleanNorm === sNameNorm)
        );
      });
    });
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
