# ASTeam Agent v1.8.2 官方发布说明 (Release Notes)

> **发布版本**：v1.8.2 (Build 20260911)  
> **代码基线**：主分支 `main`  
> **核心定位**：【阶段七点二：v1.8.2 内置统一 Skill & MCP 深度融合演化与极客运行时强化】全面圆满交付。专注于单机单智能体下的统一 Skill 与 MCP 机制进行深度融合重塑，全面消除 Windows `npx` 管道死锁隐患、提供 MCP 参数 Schema 本地预校验自纠错、落地技能两阶段轻量元数据索引（微索引 < 225 tokens，单次交互节省数千 Token）、打通 MCP Prompts 协议一等公民投影为 Skill、以及内置纯 JS 高频原生工具（SQLite、源码 AST 解析、网络端口管理）与 Stdio 进程退避自愈。

---

## 🌟 核心痛点与演进背景 (Why v1.8.2)

在追求极致单机单智能体极客开发体验时，传统 Skill 与 MCP 机制暴露出几大关键摩擦点：
1. **Windows `npx` 交互管道死锁**：在 Windows 下启动基于 npm 的外部 MCP 服务（如 `npx @modelcontextprotocol/server-xxx`）时，由于缺乏 `-y` 确认参数，npm 会尝试在被重定向的 Stdio 管道等待用户输入 `y`，导致子进程永久卡死且无输出；
2. **MCP 工具调用参数类型与缺参挫败**：外部 MCP 服务工具多样且入参 Schema 各异，模型在初次调用时若遗漏必填字段或类型有偏差，传统方式直接抛出晦涩的网络或 JSON-RPC 异常，缺乏精准的本地引导与自纠错建议；
3. **全局技能库 Prompt 堆叠导致上下文暴涨**：随着内置与演进技能日益丰富，每次交互直接在系统提示词全量展开所有技能的完整 Prompt 会占用 2000~5000+ Token，极易干扰大模型的注意力聚焦与代码生成质量；
4. **MCP Prompts 协议能力割裂**：标准 MCP 协议支持 Tools、Resources、Prompts 三要素，但业界大部分客户端仅实现了 Tools，导致 MCP 社区高质量的提示词模版无法转化为 Agent 的敏捷技能；
5. **本地极客高频排障工具链缺失**：排查本地数据库、分析代码语法大纲、检查端口冲突与服务占用时，极易退回到宿主繁重的终端命令，且外部 Stdio 进程崩溃后缺乏重连机制。

---

## 🚀 v1.8.2 核心交付全景 (Core Highlights)

### 一、⚡ Windows `npx` 管道死锁免疫与 MCP 参数 Schema 本地预校验 (P0)
- **Windows `npx` 自动 `-y` 注入**：
  - 底层 `isNpxCommand()` 与 `normalizeNpxArgs()` 智能识别 Windows 环境下的 `npx` 与 `npx.cmd` 调用；
  - 启动 Stdio 客户端前自动前置注入 `-y` 参数，彻底杜绝 npm 首次下载依赖时的 `Need to install the following packages: ... (y)` 控制台交互卡死。
- **MCP 参数 Schema 本地预校验与自纠错提示**：
  - 调用外部 MCP 工具前，基于工具的 `inputSchema` 自动执行即时轻量验证；
  - 精准拦截必填字段缺失（如缺少 `income`）与类型不匹配（如预期 `number` 传入 `string`）；
  - 输出格式规范、易于大模型直接理解与自我纠错的错误反馈：`[MCP 参数校验失败] 无法调用工具 "xxx"：缺少必填字段 "yyy"。参数规约参考：{...}。请修正入参后重新调用。`

---

### 二、🧠 Skill 两阶段轻量索引与按需动态激活机制 (P1)
- **极简 Micro Index 系统提示词注入 (< 225 Tokens)**：
  - 系统提示词全面淘汰“全量技能 Prompt 静态平铺”的粗暴模式；
  - 重构 `SkillManager.getMicroSkillIndex()`，向系统提示词仅输出极其紧凑的“微索引表”（每项仅占约 30 个 Token，整体 < 225 Tokens，比原来降低 90% 以上）；
- **动态按需激活 (Dynamic Activation)**：
  - **用户手动激活**：支持在聊天输入中输入 `@skill_id`（如 `@idc_cloud_migration_expert`）显式挂载；
  - **关键词/意图动态触发**：模型在规划阶段若命中技能 triggers，自动在当前轮次载入该技能全量规约；
  - **显式调度工具**：调度器内置提供 `activate_skill` 工具，大模型在多轮会话中可主动声明激活所需技能。

---

### 三、📜 标准化 YAML Frontmatter 扩展与工具强绑定 (P2)
- **双向 YAML Frontmatter 解析与序列化**：
  - `parseSkillMarkdown()` 与 `serializeSkillMarkdown()` 完整支持行业标准 Frontmatter；
  - 规范定义核心元数据字段：`name`、`description`、`version: 1.8.2`、`triggers`（触发词列表）、`recommendedTools`（推荐绑定工具）；
- **Tools Binding 工具联动**：
  - 激活特定技能时，内核自动检测并提示该技能所推荐绑定的工具链（如 SQLite 分析技能自动提示 `sqlite_query`），实现“规约准则”与“执行工具”的精准闭环。

---

### 四、🔌 MCP Prompts 协议打通与一等公民投影 (P3)
- **MCP Prompts 协议全链路支持**：
  - 官方 MCP 客户端完整集成 `client.listPrompts()` 与 `client.getPrompt()` 能力；
  - 启动连接或外部服务注册时，自动扫描并发现所有 MCP Prompts，支持提取参数规约与动态模版；
- **自动投影为 ASTeam 可用 Skill**：
  - `SkillManager.getAllAvailableSkills()` 自动将外部 MCP 服务的 Prompt 投影为原生 Skill（技能 ID 规范前缀 `mcp_prompt:<serverName>:<promptName>`）；
  - 用户在聊天框输入 `@` 时，可直接补全并使用来自外部 MCP 服务的 Prompt 技能，实现 MCP 生态资产一键赋能。

---

### 五、🛠️ 纯 JS 零配置内置高频工具与 Stdio 进程退避自愈 (P4)
- **原生高频本地工具套件**：
  - `sqlite_query`：Node 原生内置驱动，免除宿主安装 sqlite3 二进制，支持打开本地 `.db`/`.sqlite` 文件执行 DDL 表创建、INSERT 数据写入与 SELECT/PRAGMA 结构分析；
  - `code_ast_inspector`：纯 JS 源码符号大纲与依赖解析器，免外部重型环境提取 JS/TS/Python/Go/Java 等源码文件的大纲、类、函数、接口、依赖引用及行数与圈复杂度评估；
  - `port_process_manager`：Windows 本地网络端口占用与进程诊断管理，支持按端口探测占用（如 3000、8080 等）、提取关联 PID 与进程名称映射。
- **Stdio 客户端生命周期监听与自愈**：
  - 监听 Stdio 子进程的 `exit` 与 `error` 事件，遇到意外崩溃时自动执行指数退避重连（1s -> 2s -> 4s -> 最大 30s），保障会话期间工具链持续高可用。

---

## 🧪 自动化测试验证矩阵 (Verification Matrix)

本项目已建立全自动化回归与集成测试套件 `scripts/verify-v1.8.2.mjs`，覆盖 8 大核心测试组，**121 项测试断言 100% 全部通过**：

| 测试组 | 验证模块 | 测试断言数 | 结果 |
| :--- | :--- | :---: | :---: |
| **Test Group 1** | Pure JS Native Office 生产力套件 (Word/Excel/PPT) | 14 项 | ✅ 100% PASS |
| **Test Group 2** | 交付物理落盘门禁与防幻觉验证机 (ArtifactVerifier) | 10 项 | ✅ 100% PASS |
| **Test Group 3** | Windows PowerShell 复杂脚本沙箱与 UTF-8 BOM 容灾 | 4 项 | ✅ 100% PASS |
| **Test Group 4** | Hermes 式长期记忆反思与技能自演进蒸馏 (Auto-Reflect) | 8 项 | ✅ 100% PASS |
| **Test Group 5** | ASTeam StorageHub 存储自闭环与 D 盘智能优选 | 15 项 | ✅ 100% PASS |
| **Test Group 6** | 全局技能纯净隔离与 resolveSafe 智能路径纠偏 | 8 项 | ✅ 100% PASS |
| **Test Group 7** | 零宿主依赖套件 (PDF 生成与提取/ZIP 解压缩/文件锁韧性/Git 降级) | 29 项 | ✅ 100% PASS |
| **Test Group 8** | **v1.8.2 核心特性** (npx 注入/Schema 预校验/微索引/YAML 解析/Prompts 投影/纯 JS 内置工具) | 33 项 | ✅ 100% PASS |
| **总计** | **全模块端到端集成自动化验证** | **121 项** | **✅ 100% 全量通过** |

同时，`npm run build`（包括 Renderer 层的 Vite 构建与 Electron 层的 esbuild 主进程编译）执行耗时 < 13 秒，**0 警告、0 报错**。

---

## 📦 交付物与使用指南

1. **Windows 官方双端安装包已生成 (`release/`)**：
   - **安装版**：`release/ASTeam Agent-Setup-1.8.2.exe` (127,083,092 字节，约 121.2 MB)
   - **便携免安装版**：`release/ASTeam Agent-Portable-1.8.2.exe` (126,752,848 字节，约 120.9 MB)
2. **运行全量测试套件 (121/121 通过)**：
   ```bash
   npm run test:verify
   ```
3. **重新构建与打包命令**：
   ```bash
   npm run build:win   # 一键执行 build 并在 release/ 重新生成安装包
   ```
4. **数据存储目录确认 (零污染闭环)**：
   - Windows 下默认全量存储于非系统盘 `D:\ASTeamData`；
   - 包含 `skills/`、`memory/`、`artifacts/`、`workspaces/`、`logs/`、`mcp_servers.json`。
