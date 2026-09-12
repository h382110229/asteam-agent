# ASTeam Agent v1.8.2 详尽全功能测试用例与验证手册 (Test Cases Manual)

> **版本**：v1.8.2 (Build 20260911)  
> **适用产物**：
> - 自动集成测试：`npm run test:verify` (`scripts/verify-v1.8.2.mjs`)
> - 桌面安装包：`release/ASTeam Agent-Setup-1.8.2.exe`
> - 桌面便携版：`release/ASTeam Agent-Portable-1.8.2.exe`
> - 源码调试：`npm run dev` 或 `npm run preview`
> **数据中枢根目录**：`D:\ASTeamData` (Windows 严格自闭环)

---

## 目录
1. [第一部分：自动化集成测试用例矩阵 (8大组 121项断言)](#第一部分自动化集成测试用例矩阵)
2. [第二部分：v1.8.2 核心新特性人工端到端 (E2E) 实机用例](#第二部分v182-核心新特性人工端到端实机用例)
3. [第三部分：极限边界与故障注入自愈测试用例](#第三部分极限边界与故障注入自愈测试用例)
4. [第四部分：原生 Office 与零宿主依赖扩展用例](#第四部分原生-office-与零宿主依赖扩展用例)
5. [第五部分：实测执行记录与验收打勾清单](#第五部分实测执行记录与验收打勾清单)

---

# 第一部分：自动化集成测试用例矩阵

执行命令：
```bash
npm run test:verify
```

### 测试组 1：纯 JS 原生 Office 生产力套件 (14 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-OFF-001 | Office 套件符号导出校验 | 加载 `office-generator.ts` | 确认 `createWordDocx` 导出且为函数 | ✅ PASS |
| TC-OFF-002 | Excel 创建函数导出校验 | 加载 `office-generator.ts` | 确认 `createExcelXlsx` 导出且为函数 | ✅ PASS |
| TC-OFF-003 | Excel 读取函数导出校验 | 加载 `office-generator.ts` | 确认 `readExcelXlsx` 导出且为函数 | ✅ PASS |
| TC-OFF-004 | PPT 创建函数导出校验 | 加载 `office-generator.ts` | 确认 `createPowerPointPptx` 导出且为函数 | ✅ PASS |
| TC-OFF-005 | Word 复杂文档物理落盘 | 传入封面、两级大纲、段落、斑马纹表格 | 目标 `.docx` 文件物理存在 | ✅ PASS |
| TC-OFF-006 | Word 文件体积与结构 | 读取生成的 `.docx` 文件 | 文件体积 > 5KB (实测 ~11.9KB) | ✅ PASS |
| TC-OFF-007 | Word 返回消息结构 | 校验生成函数的 Promise 结果 | 返回带路径的成功提示信息 | ✅ PASS |
| TC-OFF-008 | Excel 多 Sheet 物理落盘 | 传入 2 个工作表（主机明细、网络配置） | 目标 `.xlsx` 文件物理存在 | ✅ PASS |
| TC-OFF-009 | Excel 文件体积合规 | 读取生成的 `.xlsx` 文件 | 文件体积 > 2KB (实测 ~7.8KB) | ✅ PASS |
| TC-OFF-010 | Excel 返回消息结构 | 校验生成函数的 Promise 结果 | 返回带路径的成功提示信息 | ✅ PASS |
| TC-OFF-011 | Excel 原生解析 Sheet 识别 | 调用 `readExcelXlsx` 解析已落盘文件 | 识别并返回 2 个 Sheet 名称 | ✅ PASS |
| TC-OFF-012 | Excel Sheet 名称准确性 | 校验解析数据中的工作表 1 | 名称完全匹配 “主机明细” | ✅ PASS |
| TC-OFF-013 | Excel 行记录数解析准确性 | 校验 Sheet 1 数据行 | 行数精确为 2 行，列头完全解析 | ✅ PASS |
| TC-OFF-014 | PPT 演示文稿生成与落盘 | 传入 16:9 页面、标题与观点卡片 | 生成 `.pptx` 文件物理存在且有效 | ✅ PASS |

### 测试组 2：交付制品真实物理探针硬门禁 (10 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-GATE-001 | 探针单例初始化 | 加载 `artifact-verifier.ts` | `artifactVerifier` 实例非空 | ✅ PASS |
| TC-GATE-002 | 虚假不存在文件拦截 | 传入虚构路径 `non_existent.docx` | `verified === false` 拦截成功 | ✅ PASS |
| TC-GATE-003 | 不存在文件失败原因反馈 | 检查拦截原因信息 | 明确包含 “文件不存在” 提示 | ✅ PASS |
| TC-GATE-004 | 0 字节空文件拦截 | 创建 0 字节文件并探针探测 | `verified === false` 拦截成功 | ✅ PASS |
| TC-GATE-005 | 空文件失败原因反馈 | 检查拦截原因信息 | 明确包含 “0 字节空文件” 提示 | ✅ PASS |
| TC-GATE-006 | 历史陈旧文件新鲜度拦截 | 创建文件并将 mtime 倒拨 10 分钟 | `verified === false` 拦截成功 | ✅ PASS |
| TC-GATE-007 | 陈旧文件原因提示 | 检查拦截原因信息 | 明确指出修改时间早于任务发起时刻 | ✅ PASS |
| TC-GATE-008 | 真实新鲜交付件正常放行 | 传入任务生命周期内新鲜生成文件 | `verified === true` 放行通过 | ✅ PASS |
| TC-GATE-009 | 防伪信任徽章签发 | 检查放行后的证据徽章 | 包含 `🛡️ [物理探针门禁验收通过]` | ✅ PASS |
| TC-GATE-010 | 总门禁审查拦截助理伪造 | 助理回复文本宣称交付了旧文件 | `inspectDeliveryGate` 返回拦截纠偏指引 | ✅ PASS |

### 测试组 3：Windows PowerShell 命令沙箱健壮性 (4 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-SH-001 | `&&` 管道语法安全纠偏 | 传入 `echo A && echo B` 命令 | 自动转写为 `; if ($?) { ... }` 序列 | ✅ PASS |
| TC-SH-002 | 复合链式命令完整转换 | 传入多重 `&&` 连续命令 | 所有节点均被安全转写，无语法破裂 | ✅ PASS |
| TC-SH-003 | Windows 临时脚本 UTF-8 BOM | 检查生成的临时 `.ps1` 脚本头部 | 包含 `\uFEFF` 字节序标记，避免控制台乱码 | ✅ PASS |
| TC-SH-004 | 非 ASCII 中文字符完整性 | 脚本包含中文参数与路径 | 读取并校验字符未发生乱码截断 | ✅ PASS |

### 测试组 4：Hermes 长期记忆反思与技能自演进 (8 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-MEM-001 | 任务完成后台自省复盘 | 传入复合 Office 与云迁移任务历史 | `autoReflectAndPersist` 提炼出洞察规则 | ✅ PASS |
| TC-MEM-002 | 反思规则领域关键词覆盖 | 检查提取出的记忆条目 | 包含 Office 格式规约与云迁移规范 | ✅ PASS |
| TC-MEM-003 | 内置迁移专家技能命中 | 检索内置技能 `idc_cloud_migration_expert` | 成功命中且存在于内置列表中 | ✅ PASS |
| TC-MEM-004 | 技能 Prompt 华为云规范 | 检查技能系统提示词 | 包含华为云架构迁移指引 | ✅ PASS |
| TC-MEM-005 | 技能 Prompt ECU 盘点指引 | 检查技能系统提示词 | 包含 ECU 计算规格与资源盘点要求 | ✅ PASS |
| TC-MEM-006 | 自演进技能 ID 格式规范 | 调用 `distillSkill` 生成新技能 | 生成合法小写下划线标识符 | ✅ PASS |
| TC-MEM-007 | 自演进技能物理落盘 | 检查目标工作区 `.asteam/skills/` | 生成 `distilled_cbs_migration.md` 文件 | ✅ PASS |
| TC-MEM-008 | 技能文件内容完整度 | 读取生成的 Markdown 技能文件 | 完整包含提炼出的规约正文 | ✅ PASS |

### 测试组 5：StorageHub 存储自闭环与 D 盘优先 (15 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-HUB-001 | StorageHub 单例初始化 | 加载 `storage-hub.ts` | 实例正常初始化 | ✅ PASS |
| TC-HUB-002 | Windows D 盘智能首选 | 宿主存在 D 盘时启动 | 数据根目录严格默认 `D:\ASTeamData` | ✅ PASS |
| TC-HUB-003 | 技能子目录物理存在 | 检查中枢目录结构 | `D:\ASTeamData\skills` 物理存在 | ✅ PASS |
| TC-HUB-004 | 记忆子目录物理存在 | 检查中枢目录结构 | `D:\ASTeamData\memory` 物理存在 | ✅ PASS |
| TC-HUB-005 | 制品子目录物理存在 | 检查中枢目录结构 | `D:\ASTeamData\artifacts` 物理存在 | ✅ PASS |
| TC-HUB-006 | 工作区子目录物理存在 | 检查中枢目录结构 | `D:\ASTeamData\workspaces` 物理存在 | ✅ PASS |
| TC-HUB-007 | 日志子目录物理存在 | 检查中枢目录结构 | `D:\ASTeamData\logs` 物理存在 | ✅ PASS |
| TC-HUB-008 | MCP 配置文件路径获取 | 调用 `getMcpConfigFilePath()` | 返回 `D:\ASTeamData\mcp_servers.json` | ✅ PASS |
| TC-HUB-009 | MCP 配置位置闭环校验 | 验证路径前缀 | 严格位于 `D:\ASTeamData` 内部 | ✅ PASS |
| TC-HUB-010 | 中枢容量指标统计 | 调用 `getStorageStats()` | 正确返回当前根路径与各模块统计 | ✅ PASS |
| TC-HUB-011 | 统计模块覆盖度 | 校验统计报告字段 | 完整包含技能、记忆、制品各模块 | ✅ PASS |
| TC-HUB-012 | McpManager 单例初始化 | 加载 `mcp-manager.ts` | `mcpManager` 正常就绪 | ✅ PASS |
| TC-HUB-013 | MCP 服务配置中枢持久化 | 传入测试 MCP 服务并保存 | 物理写入 `D:\ASTeamData\mcp_servers.json` | ✅ PASS |
| TC-HUB-014 | 持久化 JSON 回读校验 | 调用 `getSavedConfigJson()` | 准确回读已持久化的服务配置 | ✅ PASS |
| TC-HUB-015 | 空参热重载自愈还原 | 调用 `reloadServers()` 不传参 | 自动从 `mcp_servers.json` 恢复服务 | ✅ PASS |

### 测试组 6：全局技能隔离与 resolveSafe 纠偏 (8 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-ISO-001 | 全局技能库路径对齐 | 检查 `SkillManager` 技能目录 | 与 `storageHub.getSkillsDir()` 严格一致 | ✅ PASS |
| TC-ISO-002 | 安装技能存储位置隔离 | 调用 `installSkill` 安装探针技能 | 文件保存至 `D:\ASTeamData\skills/` | ✅ PASS |
| TC-ISO-003 | 安装技能物理落盘 | 检查文件系统 | `v181_isolation_probe.md` 物理存在 | ✅ PASS |
| TC-ISO-004 | 全局技能动态载入 | 调用 `loadGlobalSkills()` | 成功加载已落盘探针技能 | ✅ PASS |
| TC-ISO-005 | 探针测试技能清理 | 调用 `deleteSkill` | 探针技能从磁盘安全删除 | ✅ PASS |
| TC-ISO-006 | 误写技能路径自动重定向 | 传入 `~/.asteam/skills/xxx.md` | `resolveSafe` 重定向至 `D:\ASTeamData\skills` | ✅ PASS |
| TC-ISO-007 | 误写配置路径自动重定向 | 传入 `~/.asteam/mcp_servers.json` | `resolveSafe` 重定向至 `D:\ASTeamData\mcp_servers.json` | ✅ PASS |
| TC-ISO-008 | 真实桌面路径保真解析 | 传入 `~/Desktop/doc.docx` | 准确指向用户真实系统桌面 | ✅ PASS |

### 测试组 7：零宿主依赖套件 (PDF/ZIP/锁韧性/Git) (29 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-ZERO-001 | 短路径免前缀保真 | 路径长度 < 240 字符 | 路径保持原样无冗余前缀 | ✅ PASS |
| TC-ZERO-002 | Windows 长路径自动前缀 | 构造 > 240 字符的 Windows 路径 | 自动注入 `\\?\` 长路径前缀 | ✅ PASS |
| TC-ZERO-003 | 无锁文件正常写入 | 调用 `safeWriteFileSync` | 成功物理落盘 | ✅ PASS |
| TC-ZERO-004 | 无碰撞标记判断 | 检查写入结果 | `isFallback === false` | ✅ PASS |
| TC-ZERO-005 | 写入状态确认 | 检查写入结果 | `success === true` | ✅ PASS |
| TC-ZERO-006 | 纯 JS PDF 物理生成 | 传入多章节、页眉页脚与中文文本 | 生成 `.pdf` 文件物理存在 | ✅ PASS |
| TC-ZERO-007 | PDF 文件体积与字体嵌入 | 检查生成的 PDF 体积 | 体积 > 2KB (实测 ~29.4KB，含字体子集) | ✅ PASS |
| TC-ZERO-008 | PDF 生成器返回确认 | 检查生成结果 | 返回成功确认信息 | ✅ PASS |
| TC-ZERO-009 | 纯 JS PDF 检视器页数识别 | 调用 `readPdf` 检视生成的 PDF | 精确解析为 2 页 | ✅ PASS |
| TC-ZERO-010 | PDF 元数据标题提取 | 检视生成的 PDF | 成功提取出匹配的文档标题 | ✅ PASS |
| TC-ZERO-011 | PDF 元数据作者提取 | 检视生成的 PDF | 成功提取出匹配的作者信息 | ✅ PASS |
| TC-ZERO-012 | PDF 摘要概览生成 | 检视生成的 PDF | 生成包含字符数与页数的详细摘要 | ✅ PASS |
| TC-ZERO-013 | 纯 JS ZIP 压缩包物理生成 | 传入目录压缩为 `.zip` | 生成 `.zip` 文件物理存在 | ✅ PASS |
| TC-ZERO-014 | ZIP 压缩包体积有效性 | 检查生成的 ZIP 体积 | 体积 > 2KB (实测 ~29.7KB) | ✅ PASS |
| TC-ZERO-015 | ZIP 压缩操作确认消息 | 检查压缩函数返回值 | 返回带目标路径的成功信息 | ✅ PASS |
| TC-ZERO-016 | 纯 JS ZIP 解压缩目录创建 | 调用 `extractZip` 解压到新目录 | 解压目录物理存在 | ✅ PASS |
| TC-ZERO-017 | 解压后文件 A 完整性 | 检查解压目录中的子文件 A | 文件物理存在 | ✅ PASS |
| TC-ZERO-018 | 解压后文件 B 完整性 | 检查解压目录中的子文件 B | 文件物理存在 | ✅ PASS |
| TC-ZERO-019 | 解压文件内容一致性校验 | 回读解压后的文件内容 | 与压缩前源文件内容完全一致 | ✅ PASS |
| TC-ZERO-020 | Git 安装状态探针防崩溃 | 调用 `isGitInstalled()` | 稳定返回布尔值（实测 true），无崩溃 | ✅ PASS |
| TC-ZERO-021 | 非 Git 空目录状态查询 | 对空目录调用 `getGitStatus()` | 返回 `isGitRepo: false`，安全降级 | ✅ PASS |
| TC-ZERO-022 | 非 Git 目录 Diff 查询友好降级 | 对空目录调用 `getGitDiffSummary()` | 返回友好免责通知，无异常崩溃 | ✅ PASS |
| TC-ZERO-023 | 探针验证新生成 PDF | 将新 PDF 送入 `artifactVerifier` | 验证通过 `verified === true` | ✅ PASS |
| TC-ZERO-024 | PDF 签发防伪徽章 | 检查 PDF 验证输出 | 包含防伪证书信息 | ✅ PASS |
| TC-ZERO-025 | 探针验证新生成 ZIP | 将新 ZIP 送入 `artifactVerifier` | 验证通过 `verified === true` | ✅ PASS |
| TC-ZERO-026 | ZIP 签发防伪徽章 | 检查 ZIP 验证输出 | 包含防伪证书信息 | ✅ PASS |
| TC-ZERO-027 | Office 文件并发占锁模拟 | 模拟文件被独占打开锁定 | 自动降级写入 `_v2` 副本 | ✅ PASS |
| TC-ZERO-028 | 独占锁回退路径报告 | 检查并发占锁结果 | `isFallback === true` 并返回新路径 | ✅ PASS |
| TC-ZERO-029 | 多重占锁梯级递增 | 连续对 `_v2` 文件占锁写入 | 自动递增写入 `_v3` 副本 | ✅ PASS |

### 测试组 8：Skill & MCP 深度融合演化 (v1.8.2 新特性) (33 项)
| 编号 | 测试用例名称 | 输入/前置条件 | 预期断言 | 自动化状态 |
| :--- | :--- | :--- | :--- | :---: |
| TC-FUS-001 | npx 命令识别 (`npx`) | 传入命令字符串 `"npx"` | `isNpxCommand` 返回 `true` | ✅ PASS |
| TC-FUS-002 | npx 命令识别 (`npx.cmd`) | 传入 Windows 常见命令 `"npx.cmd"` | `isNpxCommand` 返回 `true` | ✅ PASS |
| TC-FUS-003 | 非 npx 命令安全放行 | 传入 `"node"` 或 `"python"` | `isNpxCommand` 返回 `false` | ✅ PASS |
| TC-FUS-004 | npx 参数自动注入 `-y` | 传入参数数组 `['@modelcontextprotocol/server']` | `normalizeNpxArgs` 自动在数组首位注入 `'-y'` | ✅ PASS |
| TC-FUS-005 | `-y` 参数注入顺序严格性 | 检查注入后的参数数组 | 首个元素精确为 `'-y'` | ✅ PASS |
| TC-FUS-006 | `-y` 防重复注入幂等性 | 传入已含 `'-y'` 的参数数组 | 数组长度不变，不产生重复 `'-y'` | ✅ PASS |
| TC-FUS-007 | MCP 工具参数合规放行 | 传入符合 Schema 的 `{ income: 50000, currency: 'CNY' }` | `validateMcpToolArgs.isValid === true` | ✅ PASS |
| TC-FUS-008 | MCP 缺少必填字段拦截 | 传入遗漏必填字段的 `{ currency: 'CNY' }` | `validateMcpToolArgs.isValid === false` | ✅ PASS |
| TC-FUS-009 | 缺参错误前缀标准规范 | 检查拦截错误描述 | 包含 `[MCP 参数校验失败]` 前缀 | ✅ PASS |
| TC-FUS-010 | 缺参字段名精确定位 | 检查拦截错误描述 | 明确指出 `缺少必填字段 "income"` | ✅ PASS |
| TC-FUS-011 | MCP 参数类型不匹配拦截 | 传入 `{ income: 'not_a_number' }` (期望 number) | `validateMcpToolArgs.isValid === false` | ✅ PASS |
| TC-FUS-012 | 类型错误自纠错指引 | 检查类型拦截错误描述 | 明确指出 `字段 "income" 类型错误: 期望 number, 实际得到 string` | ✅ PASS |
| TC-FUS-013 | 技能微索引格式类型 | 调用 `skillManager.getMicroSkillIndex()` | 返回合法字符串 | ✅ PASS |
| TC-FUS-014 | 微索引标题头部标识 | 检查微索引输出 | 包含 `Available Skills (Micro Index)` 标识 | ✅ PASS |
| TC-FUS-015 | 内置专家技能微索引收录 | 检查微索引输出 | 准确包含 `idc_cloud_migration_expert` | ✅ PASS |
| TC-FUS-016 | 微索引极致紧凑度 Token 测算 | 统计微索引长度换算 Token 数 | 估算 Token < 250 (实测仅 ~225 tokens) | ✅ PASS |
| TC-FUS-017 | YAML Frontmatter 技能名解析 | 解析包含 Frontmatter 的 Markdown 技能文本 | `parsed.name === 'yaml_test_skill'` | ✅ PASS |
| TC-FUS-018 | YAML Frontmatter 版本号解析 | 检查解析对象 | `parsed.version === '1.8.2'` | ✅ PASS |
| TC-FUS-019 | YAML Frontmatter 触发词列表解析 | 检查解析对象 triggers 数组 | 准确解析出 `['test trigger', 'yaml parse']` | ✅ PASS |
| TC-FUS-020 | YAML 推荐工具绑定解析 (Tools Binding) | 检查解析对象 recommendedTools | 准确包含 `sqlite_query`, `code_ast_inspector` | ✅ PASS |
| TC-FUS-021 | 技能 Markdown 规范序列化 | 调用 `serializeSkillMarkdown(parsed)` | 输出内容严格以 `---\n` 开头并闭合 | ✅ PASS |
| TC-FUS-022 | 序列化元数据包含名称 | 检查序列化字符串 | 包含 `name: yaml_test_skill` | ✅ PASS |
| TC-FUS-023 | 序列化元数据包含版本 | 检查序列化字符串 | 包含 `version: 1.8.2` | ✅ PASS |
| TC-FUS-024 | MCP Prompts 投影为技能 | 调用 `getAllAvailableSkills()` 查询 | 能够正常查询带 `mcp_prompt:` 前缀的技能对象 | ✅ PASS |
| TC-FUS-025 | 纯 JS SQLite DDL 与 INSERT 执行 | 调用 `executeBuiltinTool('sqlite_query', ...)` 建表插数据 | `createTableRes.success === true` 成功执行 | ✅ PASS |
| TC-FUS-026 | 纯 JS SQLite SELECT 查询执行 | 执行 `SELECT * FROM users;` | `queryRes.success === true` 成功执行 | ✅ PASS |
| TC-FUS-027 | SQLite 返回结果集行数校验 | 检查查询结果中的 rows 数组 | `queryRes.data.rows.length === 1` | ✅ PASS |
| TC-FUS-028 | SQLite 数据字段值准确性 | 校验第一条记录的 name 字段 | `rows[0].name === 'ASTeam'` 完全一致 | ✅ PASS |
| TC-FUS-029 | 纯 JS 源码 AST 分析 TypeScript | 调用 `executeBuiltinTool('code_ast_inspector', ...)` | `astRes.success === true` 成功解析 TS 文件 | ✅ PASS |
| TC-FUS-030 | 源码行数与复杂度度量计算 | 检查 AST 分析中的 metrics | 成功统计出总行数、代码行数与圈复杂度 | ✅ PASS |
| TC-FUS-031 | 源码函数符号大纲提取 | 检查 AST 分析中的 functions 列表 | 成功提取出 `toSafeWindowsLongPath` 等函数声明 | ✅ PASS |
| TC-FUS-032 | 端口诊断管理工具在 Windows 无崩溃 | 调用 `executeBuiltinTool('port_process_manager', ...)` | `portRes.success === true` 稳定执行 | ✅ PASS |
| TC-FUS-033 | 端口列表结构返回 | 检查端口诊断结果中的 ports 数组 | 返回规范的端口与 PID 诊断数组 | ✅ PASS |

---

# 第二部分：v1.8.2 核心新特性人工端到端 (E2E) 实机用例

请在启动客户端桌面程序（`release/ASTeam Agent-Portable-1.8.2.exe` 或 `npm run dev`）后，在对话框进行如下场景化实测验证：

### 🎯 场景 A：Windows npx 管道防死锁与外部 MCP 服务加载
- **前置步骤**：
  1. 点击顶部或侧边栏【设置 (Settings)】图标；
  2. 切换到【MCP 管理】标签页；
  3. 点击【添加自定义 MCP 服务】；
  4. 填写：
     - **服务名称**：`sqlite-demo`
     - **执行命令**：`npx`（故意不写 `-y`）
     - **命令参数**：`-y @modelcontextprotocol/server-sqlite`（或故意填 `@modelcontextprotocol/server-sqlite`）
- **测试动作**：点击【连接/测试】按钮。
- **预期检验点**：
  - [ ] 观察终端或日志，底层自动前置补全 `-y`，不会卡在 npm 的确认交互中；
  - [ ] 服务正常切换为绿色 `connected` 状态或给出结构化错误，界面毫无卡顿与死锁假死；
  - [ ] 打开 `D:\ASTeamData\mcp_servers.json`，看到该服务已被闭环持久化落盘。

---

### 🎯 场景 B：MCP 工具参数 Schema 本地预校验与模型自我修正
- **测试动作**：在聊天窗口输入如下故意缺参指令：
  ```text
  请帮我调用 sqlite-demo 服务的 read_query 工具，参数传入 {}
  ```
- **预期检验点**：
  - [ ] Harness 执行器即时拦截，不会发出无效网络请求或产生系统级崩溃；
  - [ ] 对话流中返回标准格式的自纠错消息：
    `[MCP 参数校验失败] 无法调用工具 "read_query"：缺少必填字段 "query"...`；
  - [ ] 大模型根据反馈的纠错建议，在下一轮自动补充合法的 SQL 参数重新尝试。

---

### 🎯 场景 C：技能微索引与按需动态激活验证
- **测试动作 1**：在输入框中输入 `@` 符号；
- **预期检验点 1**：
  - [ ] 弹出 `@` 上下文补全浮层，列表中包含内置技能、用户技能以及以 `mcp_prompt:` 开头的投影技能。
- **测试动作 2**：在输入框中输入：
  ```text
  请问你当前内置了哪些技能？请列出微索引。
  ```
- **预期检验点 2**：
  - [ ] 模型给出的回答基于紧凑微索引（< 225 tokens），未一次性吐出数万字的完整 Prompt；
  - [ ] 响应迅速，Token 消耗量显著下降。
- **测试动作 3**：显式激活云迁移技能并提问：
  ```text
  @idc_cloud_migration_expert 请帮我评估一个 500 台虚拟机的 IDC 机房迁移到华为云的整体方案框架
  ```
- **预期检验点 3**：
  - [ ] 界面显示该技能被激活载入；
  - [ ] 模型严格按照华为云迁移专家规约输出规范的评估报告框架（涵盖网络连通、ECU 算力对齐、平滑切换批次）。

---

### 🎯 场景 D：纯 JS 内置排障工具实测（`sqlite_query` / `code_ast_inspector` / `port_process_manager`）

#### 用例 D-1：本地 SQLite 免安装数据库操作
- **测试动作**：在对话框输入：
  ```text
  请帮我使用内置 sqlite_query 工具，在当前工作区创建一个 test_project.db 数据库，建立一个 tasks 表（包含 id, title, status 字段），并插入一条 '完成 v1.8.2 研发' 的记录，最后查询出来给我展示。
  ```
- **预期检验点**：
  - [ ] 工具调用卡片显示正在调用 `sqlite_query`；
  - [ ] 成功在当前工作区生成 `test_project.db` 文件；
  - [ ] 助理返回刚插入的记录，显示建表、写入与 SELECT 查询均顺利执行。

#### 用例 D-2：项目代码 AST 符号与大纲提取
- **测试动作**：在对话框输入：
  ```text
  请使用内置 code_ast_inspector 工具，分析项目中的 electron/file-resilience.ts 文件的大纲与复杂度。
  ```
- **预期检验点**：
  - [ ] 工具调用卡片显示正在调用 `code_ast_inspector`；
  - [ ] 助理清晰列出文件内的函数符号（`toSafeWindowsLongPath`、`safeWriteFileSync`）以及总行数、代码行数与圈复杂度。

#### 用例 D-3：本地网络端口占用诊断
- **测试动作**：在对话框输入：
  ```text
  请使用内置 port_process_manager 工具，帮我排查一下本地 135 端口或者正在侦听的 TCP 端口情况。
  ```
- **预期检验点**：
  - [ ] 工具调用卡片显示正在调用 `port_process_manager`；
  - [ ] 助理列出本地端口占用、PID 及进程映射情况，Windows 下执行极快且 0 崩溃。

---

# 第三部分：极限边界与故障注入自愈测试用例

| 编号 | 场景名称 | 破坏性注入动作 | 预期系统表现与自愈行为 |
| :--- | :--- | :--- | :--- |
| **TC-STRESS-01** | Stdio 外部子进程强杀自愈 | 在 Task Manager 中手动 End Process 正在运行的 MCP 外部服务进程 | 触发 `error`/`exit` 监听器，系统进入指数退避重连（1s、2s、4s...），日志记录自愈警告，界面不会崩溃冻结 |
| **TC-STRESS-02** | 虚假路径重定向穿透测试 | 在提示词中诱导模型写入 `C:\Users\Administrator\.asteam\skills\hack.md` | `resolveSafe()` 自动纠偏拦截，强行重定向至 `D:\ASTeamData\skills\hack.md`，C 盘 0 污染 |
| **TC-STRESS-03** | 巨型参数 Schema 校验压测 | 构造包含 50+ 字段与嵌套对象的复杂 Tool Schema 传入校验 | 毫秒级返回校验结果，无卡顿无递归爆栈 |
| **TC-STRESS-04** | 极长路径 (>260 字符) 穿透 | 操作位于 Windows 极限深层目录下的文件 | `toSafeWindowsLongPath()` 自动注入 `\\?\` 前缀，物理读写均成功，无 Windows Win32 API 路径溢出报错 |

---

# 第四部分：原生 Office 与零宿主依赖扩展用例

### 🎯 场景 E：纯 JS 原生三件套实测
- **测试指令**：
  ```text
  请帮我生成一份关于《企业混合云迁移可行性研究报告》的 Word 文档，要求带正规封面、目录结构、两级大纲和对比表格，保存在当前工作区。
  ```
- **预期检验点**：
  - [ ] 工具调用生成真实 `.docx` 文件；
  - [ ] 后置触发 `ArtifactVerifier` 物理探针，通过验证并签发 `🛡️ [物理探针门禁验收通过]` 证书；
  - [ ] 在系统 Office 或 WPS 中打开该文件，排版规整、表格正常、无格式损坏弹窗。

---

# 第五部分：实测执行记录与验收打勾清单

在完成全量人工实测后，可逐项核对如下交付清单：

- [ ] **1. 全自动化测试**：执行 `npm run test:verify`，控制台输出 `通过 121 项 | 失败 0 项 (100%)`。
- [ ] **2. 生产构建打包**：执行 `npm run build:win`，顺利在 `release/` 生成 Setup 与 Portable 安装包。
- [ ] **3. npx 死锁免疫**：Windows 环境下调用 `npx` MCP 工具 100% 不发生 Stdio 管道挂起。
- [ ] **4. MCP 参数预校验**：入参错误时能收到易懂的 `[MCP 参数校验失败]` 纠错指引。
- [ ] **5. 技能微索引生效**：系统提示词 Token 占用减少数千，`@` 浮层能够按需激活指定技能。
- [ ] **6. MCP Prompts 投影**：外部 Prompts 以 `mcp_prompt:*` 形式出现在可用技能列表中。
- [ ] **7. 纯 JS 工具可用**：`sqlite_query`、`code_ast_inspector`、`port_process_manager` 均能正常调用并返回结果。
- [ ] **8. 存储中枢自闭环**：所有数据、技能、配置严格保存在 `D:\ASTeamData`，宿主系统盘保持零污染。
