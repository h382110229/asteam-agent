# ASTeam Agent v1.8.0 自动化测试与验证用例手册 (Test Cases)

## 一、 测试套件概述
- **测试脚本**：`scripts/verify-v1.8.0.mjs`
- **执行命令**：`npm run test:verify`
- **验证范围**：
  1. 纯 JS 原生 Office 生产力套件（Word/Excel/PPT）；
  2. 交付制品真实物理探针硬门禁（存在性、时间戳新鲜度、非零体积、防伪证书）；
  3. Windows PowerShell 宿主命令健壮性沙箱（语法纠偏与临时脚本）；
  4. Hermes 式自省持久记忆与自演进技能体系。

---

## 二、 详细测试用例清单

### 测试组 1：纯 JS 原生 Office 生产力套件
| 用例编号 | 测试名称 | 输入/前置条件 | 预期输出与断言 | 状态 |
|---|---|---|---|---|
| TC-OFFICE-01 | 模块符号导出校验 | 加载 `office-generator.ts` | 确认 `createWordDocx`, `createExcelXlsx`, `readExcelXlsx`, `createPowerPointPptx` 均为函数 | ✅ PASS |
| TC-OFFICE-02 | Word 文档物理落盘 | 传入标题、封面元数据、Markdown 大纲与表格 | 物理生成 `.docx` 文件，体积 > 5KB，包含封面、目录与斑马纹表格 | ✅ PASS |
| TC-OFFICE-03 | Excel 多 Sheet 与首行冻结 | 传入 2 个 Sheet 定义、列头与数据行 | 物理生成 `.xlsx` 文件，首行冻结，列宽自适应，体积 > 2KB | ✅ PASS |
| TC-OFFICE-04 | 原生 Excel 读取解析 | 传入刚才生成的 `.xlsx` 文件 | `readExcelXlsx` 正确解析 2 个 Sheet，提取出对应数据行与 Markdown 预览 | ✅ PASS |
| TC-OFFICE-05 | PowerPoint 演示文稿生成 | 传入 16:9 幻灯片标题与观点卡片 | 物理生成 `.pptx` 文件，体积 > 10KB | ✅ PASS |

### 测试组 2：交付制品真实物理探针硬门禁 (Artifact Verification Gate)
| 用例编号 | 测试名称 | 输入/前置条件 | 预期输出与断言 | 状态 |
|---|---|---|---|---|
| TC-GATE-01 | 探针单例初始化 | 加载 `artifact-verifier.ts` | `artifactVerifier` 实例正常初始化 | ✅ PASS |
| TC-GATE-02 | 不存在文件探针拦截 | 传入虚假的路径 `non_existent_file.docx` | `verified === false`，原因明确说明路径不存在 | ✅ PASS |
| TC-GATE-03 | 0 字节空文件探针拦截 | 创建 0 字节的空文件 | `verified === false`，原因明确提示文件体积为 0 字节 | ✅ PASS |
| TC-GATE-04 | 历史陈旧文件时效性拦截 | 创建文件并将 mtime 倒拨 10 分钟 | `verified === false`，拦截并提示修改时间早于任务发起时刻（防伪造旧文件） | ✅ PASS |
| TC-GATE-05 | 新鲜有效文件正常放行 | 创建本轮任务生命周期内的新文件 | `verified === true`，签发 `🛡️ [物理探针门禁验收通过]` 防伪证书 | ✅ PASS |
| TC-GATE-06 | 交付文本总门禁审查拦截 | 模型回复中宣称生成了陈旧旧文件 | `inspectDeliveryGate` 返回 `passed: false` 并生成系统纠偏拦截提示 | ✅ PASS |

### 测试组 3：Windows PowerShell 宿主命令健壮性沙箱
| 用例编号 | 测试名称 | 输入/前置条件 | 预期输出与断言 | 状态 |
|---|---|---|---|---|
| TC-SHELL-01 | `&&` 语法纠偏逻辑 | 传入带有 `&&` 的命令 | 自动转写为 `; if ($?) { ... }` 序列，解决旧版 PowerShell 报错 | ✅ PASS |
| TC-SHELL-02 | 临时安全脚本 UTF-8 BOM | 生成临时 `.ps1` 脚本 | 校验文件以 `\uFEFF` 开头，中文字符正常读取不乱码 | ✅ PASS |

### 测试组 4：Hermes 式自省持久记忆与自演进技能体系
| 用例编号 | 测试名称 | 输入/前置条件 | 预期输出与断言 | 状态 |
|---|---|---|---|---|
| TC-HERMES-01 | 任务完成后台自省复盘 | 传入复合 Office 生成与云迁移任务上下文 | `autoReflectAndPersist` 提炼出 Office 偏好与迁移规范，追加沉淀至项目记忆库 | ✅ PASS |
| TC-SKILL-01 | 预置华为云迁移技能检索 | 在技能库中检索 `idc_cloud_migration_expert` | 成功命中，包含完整 ECU 盘点与华为云架构规约 | ✅ PASS |
| TC-SKILL-02 | 专属技能自提炼落盘 | 调用 `distillSkill` 提炼新技能 | 在工作区 `.asteam/skills/` 成功物理落盘 `distilled_cbs_migration.md` | ✅ PASS |

---

## 三、 测试执行结果
```bash
npm run test:verify
```
**统计结果**：总计 **39** 项测试，**39** 项全部通过，**0** 项失败。
