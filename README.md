# ASTeam Agent (v1.2.0)

> 企业级 Windows 桌面智能体客户端 · 基于 `deepseek-harness` 内核深度封装，集成实时交互控制台、原生多模态产物所见即所得预览、全周期进程置顶看板、原生 Office 文档生成、自主演进技能体系与全能宿主操作能力。

---

## 🌟 核心特性总览

### 1. ⚡ 实时交互式控制台与任务流看板 (Live Terminal & Task Stream)
- **实时流式终端输出**：当 Agent 执行终端诊断或测试构建命令时，前端步骤卡片实时流式打印 ANSI 彩色终端输出；
- **双向实时 Stdin 交互桥接**：遇到需要用户确认（如 `[y/N]` 或环境初始化选项）的命令时，自动唤起前端输入桥接，用户敲入字符即刻注入终端子进程 stdin；
- **Windows 原生 PowerShell UTF-8 编码兜底**：自动注入标准 UTF-8 BOM 头，彻底杜绝 Windows PowerShell 终端与脚本中文乱码。

### 2. 🖥️ 原生多模态产物实时预览器 (Live Artifacts & Webview Preview)
- **多模态所见即所得渲染**：
  - **HTML 交互大屏/微应用**：支持 Tailwind CSS、ECharts、交互式脚本安全沙箱运行；
  - **Mermaid 架构流程拓扑图**：动态自适应缩放与高清矢量渲染；
  - **SVG 矢量设计图**：支持代码检视、亮暗色底板对比切换；
- **多设备视口一键自适应**：支持【桌面端全宽】、【平板 768px】、【移动端 390px】即时模拟切换；
- **交付制品智能置底呈现**：将【交付制品已就绪 · 打开实时预览】卡片固定在所有分析结论的最下方，避免长篇大论中回翻；
- **交付物类型高精度判定引擎**：智能识别 `write_file` 写入的 `.html`/`.svg` 文件与 Mermaid 架构图，杜绝 HTML 内嵌小图标的误判。

### 3. 📌 全周期任务执行置顶动态看板 (Persistent Progress HUD)
- **执行过程防刷掉**：当 Agent 执行长链路规划或模型生成长篇文本时，顶部始终半透明毛玻璃悬浮显示当前正在执行的具体步骤、工具徽章与进度条；
- **执行态与完成态全周期常驻**：任务完成后依然保持展示 `✅ deepseek-harness 规划与执行已就绪 (4/4 步骤完成)`；
- **就地一键检视步骤详情**：在置顶看板右侧点击【检视步骤】，即可在顶部原地下拉出所有规划步骤、调用工具与输出摘要的完整清单。

### 4. 🎨 ASteam 品牌视觉规范与自适应主题
- **默认清新浅色主题**：遵循 ASteam 绿色主调（`--primary: #006857`）与品牌红（`--accent: #D31245`），移除异构黑金色样式；
- **API 网关友好反馈与一键重试**：遇到 Cloudflare 524 超时或模型网关异常时，自动剥离生硬 HTML 并呈现人话诊断卡片，附带【🔄 一键重新尝试】与【⚙️ 切换模型/线路】。

### 5. 深度封装 `deepseek-harness` 智能体内核
- **自主规划思考 (Plan & Execution)**：面对复杂任务，自动拆解目标并形成树状执行步骤，提供详尽的思考轨迹与实时状态跟踪；
- **双重执行模式自由切换**：
  - `自主执行 (Auto Edit)`：Agent 拥有自主创建/编辑文件、执行命令的闭环操作权限；
  - `只读规划 (Plan Only)`：严格拦截所有文件修改与外部破坏性操作，仅输出规划与建议。

### 6. 原生 Microsoft Office 二进制文件直接生成
- **Word (.docx) 方案白皮书**：
  - 调用 `generate_docx` 或以 `.docx` 为后缀保存，自动排版为带有标准封面、副标题、生成元数据、多级 Heading 标题、格式化数据表格与缩进列表的标准 Word 文档；
- **PowerPoint (.pptx) 商务幻灯片**：
  - 调用 `generate_pptx` 直接生成现代 16:9 比例商业演示文稿，自带主题封面、核心观点金句卡片（`Key Takeaway`）与精简要点；
  - **原生嵌入讲者演说逐字稿 (Speaker Notes)**：幻灯片备注栏自带现场口语化讲解词。

### 7. 深度融合 Anthropic 与 MiniMax 官方 Office 办公四件套
- **`office_word_report` (公文方案与深度报告专家)**：融合 Anthropic 深度分析论证与 MiniMax 规范公文体系，三段式 Executive Summary、Mermaid 架构流程图与量化指标；
- **`office_excel_master` (表格与数据建模大师)**：规范输出第三范式数据表格，提供现代动态数组高级公式（`XLOOKUP`, `LET`, `LAMBDA`, `FILTER`）与业务归因洞察；
- **`office_ppt_keynote` (商业提案与演说 PPT 架构师)**：贯彻“1 Slide 1 Idea”路演金字塔原理，逐页提供视觉排版建议与讲者演讲逐字稿；
- **`office_meeting_action` (智能会议纪要与行动清单)**：从杂乱讨论与录音中精准萃取核心决议 (Key Decisions) 与标准 RACI 交付推进矩阵；
- **专业研发套件**：`code_review`（安全审计）、`unit_test`（单测回归）、`refactor_clean`（代码重构）、`git_commit_helper`（规范提交）、`api_architect`（接口契约）。

### 8. Agent 自主演进与全局技能中心
- **Agent 自主安装技能 (`install_skill`)**：用户在对话中提出需求（如*“帮我安装针对某个领域的技能”*），Agent 自主生成规约或拉取远程 URL 并完成安装；
- **技能自省清单 (`list_skills`)**：随时向 Agent 询问当前已掌握的技能储备；
- **图形化技能管理 (`Settings -> MCP & 技能扩展`)**：
  - 本地文件导入：选择本地 `.md` 技能文件自动导入；
  - 在线 URL / GitHub Raw 一键拉取安装；
  - 可视化在线编写创建与一键删除卸载；
  - 数据安全保存在用户主目录 `~/.asteam/skills/`，跨工程与免项目模式全局通用。

### 9. Windows 通用宿主免项目模式
- 无需新建或挂载任何本地 Project 文件夹，即可作为全能个人助理使用；
- 默认工作目录 `~/ASTeam-Workspace`，原生支持相对路径与任意本地绝对路径读写（如直接保存到桌面 `C:\Users\...\Desktop`）；
- 支持执行终端诊断命令（如网络诊断 `ipconfig`、环境查询 `node -v` 等）。

### 10. 企业级工程体验与多项目树
- **Projects 多项目管理**：支持挂载多个本地工程，树形折叠展开与嵌套会话管理；
- **历史会话完整管理**：支持一键新建任务、会话置顶（Pin）、历史会话删除与平滑状态重置；
- **Git 状态感知与代码变更 Diff 抽屉**：标题栏展示实时 Git 分支与改动统计，右侧抽屉式行级彩色代码差异预览并支持一键放弃修改 (Discard)；
- **交互式确认卡片 (Grill-me 问答)**：支持单选/多选/文字输入的问答卡片；
- **人性化交互细节**：全量对话自由划选与一键复制、原生回形针附件与拖拽上传 (Drag & Drop)。

---

## 🛠️ 技术架构

- **宿主运行时**：Electron 34 + Node.js 22
- **渲染层**：React 18 + TypeScript + Vite 6 + Tailwind CSS 4
- **图标系统**：Lucide React
- **多模态预览**：Mermaid.js 10 + KaTeX + 沙箱化 iFrame
- **打包器**：`electron-builder` (NSIS 安装包 & 单文件绿色 Portable)
- **Office 引擎**：`docx` + `pptxgenjs` (Pure JS 内嵌免依赖)
- **通信通道**：Electron IPC 安全桥接与上下文隔离 (`contextIsolation: true`)

---

## 🚀 常用构建与开发指令

```bash
# 1. 启动本地开发调试环境
npm run dev

# 2. 编译打包渲染层与主进程代码
npm run build

# 3. 构建全量 Windows 生产安装包 (生成至 release/ 目录)
npm run build:win
```

---

## 📦 发布产物说明 (`release/`)

| 文件名 | 类型 | 说明 |
| :--- | :--- | :--- |
| **`ASTeam Agent-Portable-1.2.0-dev.exe`** | **绿色单文件便携版** (~114 MB) | **推荐日常分发**：无需安装、无需管理员权限，双击即用，数据物理隔离保存在各自电脑的 AppData 中 |
| **`ASTeam Agent-Setup-1.2.0-dev.exe`** | **标准安装包** (~114 MB) | 适用于需要桌面快捷方式、开始菜单与自选安装路径的企业标准化安装 |

---

## 📄 开源与隐私承诺

客户端内不硬编码任何私有 API Key 或企业凭证，所有的个人配置、历史对话与生成文档全部存放在用户本地硬盘（`%APPDATA%` 与 `~/.asteam`），向外部同事分发 Portable 可执行文件**绝不包含**您的任何私有数据。
