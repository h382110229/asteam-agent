# ASTeam Agent v1.4.0 官方发布说明 (Release Notes)

> **发布版本**：v1.4.0 (Build 20260907)  
> **适用平台**：Windows 10 / 11 (x64)  
> **二进制制品目录**：`d:\AIProject\asteam-agent\release\`  
> **核心定位**：全面对标 Cursor、Windsurf 与 Claude Code 等顶尖智能体，引入项目工程规约、全能上下文提及中心、影子快照时光机回滚体系，并全链路适配 LLMAPI Auto 全模态多模型驱动引擎。

---

## 🌟 核心新特性概览

### 1. 📜 项目级行为准则与架构规约 (Project Rules)
- **智能嗅探与最高优先级注入**：自动检测工作区根目录的 `.asteamrules`、`.asteam/rules` 或 `ASTEAM.md`，在会话启动时以最高优先级置顶注入 System Prompt，确保团队编码标准、架构约定与安全红线严苛落地；
- **顶栏常驻规约勋章 (TitleBar Rules Badge)**：
  - 已配置时高亮展示绿色胶囊 `📜 规约生效中 (.asteamrules)`，实时统计规则条目与字数；
  - 未配置时友好提示虚线胶囊 `📜 + 规约未配置`，引导用户快捷配置；
- **交互式规约管理与生成弹窗 (`ProjectRulesModal`)**：
  - 点击顶栏或输入框徽章即可唤起规约抽屉；
  - 内置三大行业主流模版：
    1. **严格 TypeScript / React 规范**（全类型推导、禁 any、Tailwind CSS、防内存泄漏）；
    2. **企业级全栈通用规范**（API 契约、Git 提交规范、安全边界）；
    3. **Python 生产级工程规范**（PEP 8、Pydantic、异步并发、异常分级）；
  - 支持在弹窗中一键生成并写入根目录 `.asteamrules` 文件，立即全局生效。

---

### 2. 🎯 全能 `@` 上下文补全中心 (Unified Context Mention Hub)
- **四合一多 Tab 上下文菜单**：在输入框中键入 `@` 唤起半透明玻璃拟态上下文面板，支持【全部 / 文件 / Git 变更 / 技能】自由切换与键盘快捷键选中；
- **`@file` 文件模糊检索与源码挂载**：
  - 自动扫描当前工作区源码文件（智能忽略 `node_modules`、`.git`、`dist` 等大目录）；
  - 支持文件名拼音与模糊搜索，选定后在发送时将真实源码以标准 Markdown 代码块无损注入 Prompt 上下文；
- **`@git-diff` 工作区变更一键直通**：
  - 输入 `@git-diff`，发送时自动抓取当前 Git 分支所有暂存与未暂存的改动摘要及 Unified Diff，无需手动复制 diff 即可向 Agent 发起 Review、排障与测试规划；
- **`@skill` 技能快捷挂载**：
  - 快速挂载已安装的官方 Office 套件、代码审计与架构设计技能。

---

### 3. ⏪ 影子快照与时光机一键回滚 (Checkpoint & Timeline)
- **写前自动快照拦截**：Agent 在执行文件创建或覆写修改前，底层 `CheckpointManager` 自动备份目标文件的原始影子副本；
- **消息气泡【⏪ 撤销本轮修改】**：每轮任务完成后在气泡底部呈现修改文件统计与撤销按钮，1 秒钟原子级回滚至执行前状态，并联动更新 Git 状态；
- **工作台【时光机 (Timeline)】货架抽屉**：
  - 在右侧工作台开辟独立【时光机】Tab；
  - 可视化罗列各轮会话生成的历史快照点、时间戳与增删改指标；
  - 支持对任意历史快照点发起一键无损还原。

---

### 4. 🎨 LLMAPI Auto 全模态多模型驱动引擎 (Full-Modal AI Engine)
- **`Auto` 智能大脑路由**：接入点选择 `Auto` 时，智能体根据用户意图自主决策并调度专长模型；
- **全模态工具矩阵全面就绪**：
  - 🖼️ `generate_image`：文生图，调度 `agnes-image-2.1-flash`，高清原图本地落盘；
  - 🎬 `generate_video`：文生视频，调度 `agnes-video-2.5-flash`，自动提交任务、抓取直链并下载至 `videos/` 目录；
  - 🧠 `generate_embedding`：文本向量，调度 `gemini-embedding-2`，返回 3072 维特征向量；
  - 🎙️ `text_to_speech` & `audio_to_text`：语音合成与识别工具接入，内置优雅诊断兜底；
- **33 款最新在线模型与 9 维能力矩阵推导**：支持 Vision 视觉防崩溃自适应路由，前端徽章直观呈现；
- **原生多模态播放与预览卡片**：聊天流与工作台原生内嵌 HTML5 视频播放器（支持全屏、静音、控制条）与音频播放器。

---

## 🔍 实测深度复盘与工程加固 (Post-Mortem)

在真实测试与运行验证阶段，我们定位并彻底根治了以下 4 项关键技术瓶颈：

| 序号 | 暴露现象 | 根本原因 (Root Cause) | 架构修复与加固策略 |
| :--- | :--- | :--- | :--- |
| **1** | 便携版打开黑屏或报错：<br>`useCallback is not defined` | `WorkspaceDrawer.tsx` 中遗漏导入 `useCallback`；原打包脚本仅执行 `vite build`，Vite 在部分 JSX 分支未作严苛符号检查导致脏代码溜入发布包 | 1. 补齐组件导入并修复所有类型警告；<br>2. 在 `package.json` 的 `build:renderer` 中引入 **`tsc --noEmit && vite build` 强卡点门禁**，任何符号或语法异常直接阻断打包构建 |
| **2** | 规约入口感知缺失：<br>顶部工具栏看不到规约生效中 | 规约徽章原先仅在长任务执行动态看板中显示，且测试项目根目录未初始化 `.asteamrules` 文件 | 1. 在 `TitleBar` 顶栏增加常驻胶囊（已配置显示绿色高亮，未配置显示虚线引导）；<br>2. 新建 `ProjectRulesModal` 弹窗，支持 3 套预设一键写入落盘；<br>3. 初始化标准 `.asteamrules` 文件 |
| **3** | 请求模型报错：<br>`fetch failed (UND_ERR_CONNECT_TIMEOUT)` | Node.js 全局 `fetch` (undici) 直连 Cloudflare CDN 时优先尝试 IPv6 产生 10 秒超时，且无法自动继承 Windows 系统网络代理 | 将主进程所有向外部 LLM 接口发起的网络请求全面切换为 **Chromium 原生 `net.fetch`**，自动继承系统代理与 Happy Eyeballs 双栈极速并发，握手缩短至 **<1秒** |
| **4** | 视频生成工具调用未执行：<br>文本泄漏为 XML 标签 `<tool:generate_video>` | `Auto` 大脑输出了 XML 变体格式 `<tool_call><tool:generate_video>{...}</tool:generate_video></tool_call>`，原正则仅支持 Markdown 代码块 | 升级 `extractToolCall` 匹配引擎，兼容 XML 闭合标签 `</tool>` 与 `</tool:name>` 等全部变体；前端过滤原始标签，无缝触发工具执行 |
| **5** | 工作台抽屉 Tab 切换无法点击：<br>鼠标点击被误判为拖拽窗口 | TitleBar 顶栏设置了 `-webkit-app-region: drag` 覆盖顶部 40px，右侧抽屉全屏覆盖导致 Tab 按钮进入拖拽感应区被操作系统拦截 | 抽屉容器下移至 `top-10` (40px) 顶栏下方，且为 Tab 容器及每个按钮显式增加 `no-drag` 样式，消除点击拦截 |
| **6** | 视频生成任务仅返回 task_id：<br>缺少下载直链且货架展示假预览 | 服务商网关原先仅开放 `POST /v1/videos` 任务提交，缺少查询路由；前端在未落盘时误将排队任务推送为货架制品 | 1. 推动网关侧上线 `GET /v1/videos/{task_id}` 查询接口；<br>2. 客户端增加后台自动轮询协程（4 秒轮询，最长 120 秒）；<br>3. 任务完成后自动拉取真实 `.mp4` 文件写入本地磁盘并更新货架 |
| **7** | 原生 `window.confirm` 弹窗风格脱节：<br>弹出 Win32 经典白底消息框 | 撤销修改、还原快照与放弃变更处直接调用了原生浏览器 confirm 方法，与现代 UI 体系冲突 | 全新开发 `ConfirmModal.tsx` 现代弹窗组件（毛玻璃遮罩、圆角阴影、受影响文件变动清单可视化胶囊、Esc 响应），全局统一替换 |
| **8** | Agent 出现代码修改文本幻觉：<br>未找到文件却声称修改完成 | 当 `view_file` 失败时部分模型会跳过 `write_file` 并直接在总结中臆造修改成功 | 1. 在底层 System Prompt 中注入防幻觉铁律，严禁未写入时虚假汇报；<br>2. `CheckpointManager` 严格按实际落盘变动数结算，避免空快照触发 |

---

## 📦 二进制安装与便携产物

| 文件名称 | 格式类型 | 文件大小 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **`ASTeam Agent-Portable-1.4.0.exe`** | **单文件绿色便携版** | `~109.1 MB` | **【推荐测试】** 免安装、免提权、双击即跑，数据全部隔离在本地自定义数据目录中 |
| **`ASTeam Agent-Setup-1.4.0.exe`** | **标准安装包 (NSIS)** | `~109.4 MB` | 企业员工桌面安装，支持开始菜单、桌面图标与卸载引导 |
| **`win-unpacked\ASTeam Agent.exe`** | **免打包绿色目录** | `~190 MB` | 开发者免打包极速启动与调试验证 |

产物存放物理路径：`d:\AIProject\asteam-agent\release\`
