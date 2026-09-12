# ASTeam Agent v1.8.1 官方发布说明 (Release Notes)

> **发布版本**：v1.8.1 (Build 20260911)  
> **代码基线**：主分支 `main`  
> **核心定位**：【阶段七点一：v1.8.1 存储中枢全闭环架构与宿主环境纯净隔离优化】全面圆满交付。针对之前在问题排查与技能/服务扩展中偶尔调用宿主机默认路径（如 `~/.asteam`、`C:\Users\<user>` 或外部 Agent 环境变量）所引发的跨智能体冲突与 C 盘占用隐患，全面建立**“存储自闭环、环境自包含、路径自纠偏、生态自解耦”**的企业级闭环底座，Windows 智能首选非系统盘（默认 `D:\ASTeamData`）。

---

## 🌟 核心问题与重构背景 (Why v1.8.1)

在实际排查复杂问题与运行工具时，暴露了智能体底层的几处隐性泄漏：
1. **跨智能体环境冲突**：部分工具或诊断提示词提及了 `~/.asteam/skills` 或主目录，容易与宿主环境中的其他 Agent（如 Antigravity / Gemini / Claude Desktop / Cursor）的默认配置产生命名或锁冲突；
2. **C 盘系统盘被隐式写入**：默认配置或外部扫描回退至 `C:\Users\xxx\.asteam`，未能将所有数据、技能与日志统一归拢到用户首选的大容量数据盘；
3. **MCP 配置缺乏中枢自包含落盘**：先前 MCP 服务的自定义配置主要以临时状态存在，缺乏在中枢根目录（`D:\ASTeamData\mcp_servers.json`）下的自包含落盘机制。

---

## 🚀 v1.8.1 核心交付全景 (Core Highlights)

### 一、💾 Windows 非系统盘智能首选与数据中枢自闭环 (`D:\ASTeamData`)
- **非系统盘智能优选**：
  - Windows 系统启动时自动探测并优先将数据根目录绑定至非系统盘（默认 `D:\ASTeamData`），彻底告别对 C 盘的默认侵入；
- **自闭环存储配置 (`storage-config.json`)**：
  - 在 `D:\ASTeamData` 根目录下保存自包含的 `storage-config.json`，支持外接数据盘即插即拔跨设备迁移，数据中枢无需依赖系统注册表即可实现自愈启动；
- **全要素 6 大模块完备落盘**：
  - 严格自闭环维护 `workspaces/` (工作区)、`skills/` (全局技能)、`memory/` (长期记忆)、`artifacts/` (交付成果)、`logs/` (运行日志)、`enterprise_hub/` (企业私有扩展)。

---

### 二、🔌 MCP 服务闭环持久化与自愈加载 (`mcp_servers.json`)
- **中枢持久化落盘**：
  - 用户在设置面板配置的全部自定义与企业级 MCP 服务，在热重载 (`reloadServers`) 时自动序列化并安全持久化至 `D:\ASTeamData\mcp_servers.json`；
- **自动恢复与状态自愈**：
  - 启动或打开设置面板时，底层自动检测并恢复 `mcp_servers.json` 中的服务拓扑，无需用户反复手动粘贴配置；
- **协议版本升级**：
  - 标准 MCP Client 客户端版本统一升级对齐至 `1.8.1`。

---

### 三、🎯 全局技能库纯净隔离 (零 C:\ ~/.asteam 外部泄漏)
- **扫描边界严格收敛**：
  - 重构 `SkillManager.loadGlobalSkills()`，严格仅扫描 ASTeam 自身中枢技能库目录 (`storageHub.getSkillsDir()`)，彻底切断对宿主 `C:\Users\<user>\.asteam\skills` 的自动隐式加载；
- **自演进技能闭环落盘**：
  - Hermes 自演进提炼技能 (`distill_skill`) 与动态安装技能 (`install_skill`) 100% 封闭保存至 `D:\ASTeamData\skills/`，并即时激活生效；
- **设置面板动态路径指示**：
  - 设置中心技能导入卡片文案动态读取当前数据中枢路径（如 `D:\ASTeamData\skills`），向用户传递明确的闭环指示。

---

### 四、🧭 智能路径重定向与闭环提示词注入
- **闭环系统提示词注入**：
  - 在 `systemPrompt` 中深度注入【ASTeam 智能体专属存储中枢与环境自闭环】纪律与物理绝对路径，向模型明确声明数据中枢、技能库、记忆库、MCP 配置的封闭物理边界；
- **底层工具解析纠偏沙箱**：
  - `WorkspaceTools.resolveSafe()` 底层拦截一切模型可能误写的 `~/.asteam/...` 路径，并以原子级安全重定向至数据中枢对应的闭环子目录；
- **消除假象提示词**：
  - 全面清理工具观察返回值中的历史硬编码 `~/.asteam/skills/` 假象字符串，统一替换为实时的物理绝对路径。

---

### 五、📦 纯 JS 原生生态与零宿主环境依赖套件 (Zero-Host-Dependency Suite)
- **纯 JS 企业级 PDF 生成与结构提取 (`generate_pdf` / `read_pdf`)**：
  - 基于 `pdf-lib` 与 `@pdf-lib/fontkit` 实现完全内置的纯 JS PDF 排版生成引擎，支持科技深蓝封面、密级水印、动态页码、章节多级排版与 CJK 中文字体子集化，体积低至数十 KB，彻底告别对外部 Python `reportlab`、`wkhtmltopdf` 或 LibreOffice 的依赖；
  - 配套 `read_pdf` 工具原生提取 PDF 标题、作者、总页数及版面规格，实现闭环自验；
- **Windows 文件独占锁冲突韧性回退 (`safeWriteFileSync`)**：
  - 针对 Windows 系统下 Microsoft Word / Excel / PPT 打开文件造成系统级独占锁 (`EBUSY` / `EPERM`) 的常见场景，设计原子级安全写入层。遇锁时自动探针重试，探测失败后自动平滑无感另存为 `_v2` / `_v3` 新版本并向模型与用户友好报告，杜绝进程崩溃与写入断裂；
  - 全面穿透应用于 Word 生成、Excel 保存、PPT 生成及一般文件保存；
- **纯 JS 原生 ZIP 归档与解压 (`compress_zip` / `extract_zip`)**：
  - 基于 `adm-zip` 原生实现跨平台 ZIP 归档与提取，支持多文件、多目录递归打包与解压还原，零系统 `zip` / `tar` / `7z` 命令行依赖；
- **无 Git 环境宿主优雅降级 (`isGitInstalled` / `getGitStatus`)**：
  - 针对无 `git.exe` 环境变量的纯净 Windows 终端，底层静默捕获 `ENOENT` 异常，返回友好无侵入状态提示，确保日常文档生成与非 Git 操作 100% 顺畅执行；
- **Windows 260 字符长路径超限免疫 (`\\?\` Auto-Prefixing)**：
  - 针对 Windows 经典 `MAX_PATH` 260 字符上限，自动规范化注入扩展路径前缀，确保深度嵌套工程与归档文件正常读写；
- **交付物探针门禁扩展**：
  - `ArtifactVerifier` 正则全面支持 `.pdf` 与 `.zip` 文件，确保新扩展产物同享物理真实落盘与时效性防伪校验。

---

## 🧪 自动化测试与工程验证

### 自动化验证套件 (`npm run test:verify` -> `scripts/verify-v1.8.1.mjs`)
- **7 大测试分组全部通过 (88/88 项 100% 通过)**：
  1. `[Test Group 1]` 纯 JS 原生 Office 生产力套件 (Word 封面/目录/表格, Exceljs 多 Sheet/读写, PPTX) - 15/15 通过
  2. `[Test Group 2]` 交付制品物理探针硬门禁 (防伪造、时效性时间戳检查、非零字节) - 10/10 通过
  3. `[Test Group 3]` Windows PowerShell 宿主命令健壮性沙箱 (`&&` 转写、UTF-8 BOM 脚本) - 4/4 通过
  4. `[Test Group 4]` Hermes 式自省持久记忆与自演进技能体系 (自省沉淀、技能封装) - 8/8 通过
  5. `[Test Group 5]` ASTeam StorageHub 闭环架构与 D 盘首选 (MCP 配置落盘、自愈加载、子目录健全) - 16/16 通过
  6. `[Test Group 6]` 技能纯净隔离与 resolveSafe 闭环重定向 (无 C 盘泄漏、路径纠偏) - 9/9 通过
  7. `[Test Group 7]` 零宿主依赖套件验证 (PDF 生成/提取、文件锁碰撞回退、ZIP 压缩/解压、Git 优雅降级、长路径) - 26/26 通过

### 生产编译校验 (`npm run build`)
- `tsc --noEmit`：0 错误，TypeScript 严格类型检查完全通过；
- `vite build`：生产级前端 Bundle (React + Tailwind + Monaco Editor) 打包成功；
- `node scripts/build-electron.mjs`：Electron 主进程 (`main.cjs` 7.1MB) 与 Preload 桥梁顺利完成生产编译。
