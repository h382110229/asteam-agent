import fs from 'node:fs';
import path from 'node:path';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  prompt: string;
}

const BUILTIN_SKILLS: SkillItem[] = [
  {
    id: 'code_review',
    name: 'Code Review 专家',
    description: '严格按企业级标准（OWASP 安全基线、防御性编程、空指针防护、内存泄漏与性能）走查代码',
    isBuiltin: true,
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
    prompt: `【激活技能：Conventional Commits 规范助手】
- 在完成代码修改或给出提交建议时，使用标准 Conventional Commits 格式：
  <type>(<scope>): <short summary>
  [可选的详细正文描述]
  [可选的 BREAKING CHANGE 或 issue 关联]`
  }
];

export class SkillManager {
  getBuiltinSkills(): SkillItem[] {
    return BUILTIN_SKILLS;
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
          // Simple title & description parsing
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const name = titleMatch ? titleMatch[1].trim() : skillId;

          result.push({
            id: `custom:${skillId}`,
            name: `[自定义] ${name}`,
            description: `位于工作区 .asteam/skills/${file}`,
            isBuiltin: false,
            prompt: `【激活工作区专属技能：${name}】\n${content}`
          });
        }
      }
    } catch {}

    return result;
  }

  getAllAvailableSkills(workspacePath: string | null): SkillItem[] {
    return [...this.getBuiltinSkills(), ...this.loadCustomWorkspaceSkills(workspacePath)];
  }

  getAggregatedSkillPrompt(enabledSkillIds: string[], workspacePath: string | null): string {
    const all = this.getAllAvailableSkills(workspacePath);
    const selected = all.filter(s => enabledSkillIds.includes(s.id));
    if (selected.length === 0) return '';

    return '\n\n' + selected.map(s => s.prompt).join('\n\n');
  }
}

export const skillManager = new SkillManager();
