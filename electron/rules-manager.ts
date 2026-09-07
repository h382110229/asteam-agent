import fs from 'node:fs';
import path from 'node:path';

export interface ProjectRulesInfo {
  hasRules: boolean;
  filePath: string | null;
  ruleType: 'asteamrules' | 'asteam_rules_file' | 'asteam_md' | 'none';
  content: string;
}

export interface RulePresetTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
}

export const RULE_PRESETS: RulePresetTemplate[] = [
  {
    id: 'ts_react_strict',
    name: 'TypeScript + React 严苛工程规范',
    description: '严格禁止 any、强制原子化样式、纯函数组件、完整错误兜底',
    template: `# 项目工程与行为准则 (.asteamrules)
> 本文件由团队制定，ASTeam Agent 在本工程的所有会话中均将严格遵守以下准则。

## 1. 语言与类型红线
- 严禁使用 \`any\` 类型，所有复杂对象与参数必须具备明确 Interface 或 Type 定义；
- 优先使用不可变数据与解构语法；
- 异步操作必须具备 try-catch 或统一错误处理。

## 2. 前端架构与 UI 设计
- 组件采用 React 18+ 函数式组件 + Hooks；
- 样式遵循 Tailwind CSS，严格使用现代设计语言（微圆角、柔和阴影、层级明确）；
- 杜绝重复轮子，新组件需具备独立封装与可复用性。

## 3. 提交与安全性
- 严禁提交任何敏感密钥、Token 或私有配置；
- 文件命名统一使用 kebab-case 或 PascalCase，保持工作区整洁。
`
  },
  {
    id: 'fullstack_universal',
    name: '通用企业级全栈开发准则',
    description: '强调架构解耦、单一职责、小步重构、防御性编程',
    template: `# 项目工程与行为准则 (.asteamrules)
> 本工程核心原则：工程化、确定性与小步演进。

## 1. 架构与编码准则
- 遵循单一职责原则 (SRP) 与模块化解耦；
- 关键逻辑必须附带清晰的中文注释，说明设计决策与边界条件；
- 不允许未经论证引入庞大或有安全漏洞的第三方依赖。

## 2. 变更可撤销与安全性
- 修改核心代码前，必须明确指出影响范围；
- 严禁执行未加限制的高危删除命令 (如 rm -rf / 或无备份覆盖)；
- 修改完毕后必须进行最小可行性验证。
`
  },
  {
    id: 'python_production',
    name: 'Python 生产级工程规范',
    description: 'PEP 8、强类型注解 (typing)、Pydantic 校验与异步高可用',
    template: `# 项目工程与行为准则 (.asteamrules)
> Python 生产环境开发规约。

## 1. 编码规范
- 严格遵循 PEP 8 风格；
- 所有公共函数与方法必须声明类型注解 (Type Hints) 与 Docstring；
- 使用 Pydantic 或 Dataclass 进行结构体建模，避免未经校验的 dict 传递。

## 2. 性能与高可用
- I/O 密集型操作使用 async/await；
- 所有异常必须具体捕获，严禁裸 catch \`except:\`；
- 日志统一使用 loguru 或 logging，附带上下文 trace id。
`
  }
];

export class RulesManager {
  /**
   * 探测并获取项目根目录下的行为准则
   */
  public getProjectRules(workspacePath: string | null): ProjectRulesInfo {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return { hasRules: false, filePath: null, ruleType: 'none', content: '' };
    }

    const candidateFiles = [
      { name: '.asteamrules', type: 'asteamrules' as const },
      { name: path.join('.asteam', 'rules'), type: 'asteam_rules_file' as const },
      { name: 'ASTEAM.md', type: 'asteam_md' as const }
    ];

    for (const cand of candidateFiles) {
      const fullPath = path.join(workspacePath, cand.name);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.trim()) {
            return {
              hasRules: true,
              filePath: fullPath,
              ruleType: cand.type,
              content: content.trim()
            };
          }
        } catch {}
      }
    }

    return { hasRules: false, filePath: null, ruleType: 'none', content: '' };
  }

  /**
   * 组装注入系统提示词的顶级行为准则
   */
  public assembleRulesPrompt(workspacePath: string | null): string {
    const rules = this.getProjectRules(workspacePath);
    if (!rules.hasRules || !rules.content) {
      return '';
    }

    const fileName = rules.filePath ? path.basename(rules.filePath) : '.asteamrules';
    return `\n\n【⚠️ 项目最高行为准则与团队红线 (${fileName}) - 顶格优先执行】
当前项目根目录定义了强制性团队规范。你在本项目进行任何架构设计、代码生成、脚本编写与修改时，必须无条件将其置于最高优先级并严格遵守：

${rules.content}
---------------------------------------------------\n`;
  }

  /**
   * 保存或初始化项目规则文件 (默认写入项目根目录的 .asteamrules)
   */
  public saveProjectRules(workspacePath: string, content: string): { success: boolean; filePath: string; message: string } {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return { success: false, filePath: '', message: '工作区目录不存在' };
    }

    const targetPath = path.join(workspacePath, '.asteamrules');
    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      return {
        success: true,
        filePath: targetPath,
        message: '已成功保存项目行为准则 (.asteamrules)'
      };
    } catch (err: any) {
      return {
        success: false,
        filePath: targetPath,
        message: `保存失败: ${err.message}`
      };
    }
  }

  /**
   * 获取预设规约模板
   */
  public getPresets(): RulePresetTemplate[] {
    return RULE_PRESETS;
  }
}

export const rulesManager = new RulesManager();
