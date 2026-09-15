# ASTeam Agent v1.10.0 官方发布说明 (Release Notes)

> **发布版本**：v1.10.0 (Build 20260915)  
> **代码基线**：主分支 `main`  
> **核心定位**：【阶段八：v1.10.0 零依赖现代化办公套件与系统发现内核全面交付】。针对在 Windows 宿主免项目模式演练中暴露的“PowerShell 全盘扫描超时卡死”、“变量语法冲突报错”以及“漏交付用户明确要求的 HTML/PDF 报告”等顽疾，引入**零依赖极速项目特征扫描器**、**内置 Chromium HTML-to-PDF 原生无头打印引擎**与**交付物意图强契约硬门禁**，彻底摆脱外部工具依赖，保障长链条复杂任务的 100% 闭环交付。

---

## 🌟 核心演进背景 (Why v1.10.0)

在多 Agent 协同与 Windows 宿主免项目演练中，传统“完全放任大模型手写控制台脚本”的机制暴露出严重影响任务成功的致命痛点：

1. **PowerShell 递归全盘扫描陷入 120 秒超时熔断**：
   - 当用户要求扫描全盘（如 C/D/E 盘）检索开发工程时，Agent 现场编写的 PowerShell `Get-ChildItem -Recurse` 命令在遭遇庞大系统目录（如 `Windows`、`Program Files`、`AppData`）或文件锁时会无限阻塞，直接触发客户端 120 秒超时熔断，耗尽任务步数；
2. **Windows 变量作用域语法陷阱引发脚本崩溃**：
   - PowerShell 解析器将双引号内的字符串 `$drive: $_` 误判为作用域修饰变量（如 `$env:PATH`），抛出 `InvalidVariableReferenceWithDrive: ':' 后面的变量名字符无效` 语法解析错误，导致进程以 Exit code 1 失败；
3. **交付物硬契约缺失导致“半途而废”或“漏交报告”**：
   - 用户明确提出“*给出 pdf 和 HTML 两个版本的报告*”，但 Agent 在前面的扫描与纠错中耗尽了交互步数，在仅完成基础扫描后就直接给出简略答复退出，系统没有任何后置守卫核验用户要求的产物是否存在；
4. **宿主环境缺乏 PDF 编译与现代排版基础设施**：
   - 免项目模式下的普通 Windows 机器往往未安装 `wkhtmltopdf`、Python `reportlab` 或 Node `puppeteer`。Agent 既无法将现代卡片样式的 HTML 报告转换为 PDF，又因缺少工具而被迫伪造或放弃生成。

---

## 🚀 v1.10.0 核心交付全景 (Core Highlights)

### 一、⚡ 零依赖并发极速项目特征扫描器 (`system_fast_scan`) —— 【P0】
- **毫秒级跨盘特征发现**：
  - 弃用容易超时的 PowerShell 递归脚本，在内核原生实现轻量并发目录遍历；
  - 3~5 秒内即可完成 C/D/E 盘的深度扫描（默认限深 4 层），自动提取 `package.json`、`pom.xml`、`requirements.txt`、`Cargo.toml`、`pyproject.toml`、`*.sln`、`.git` 等核心开发工程标识；
- **智能防御与黑名单过滤**：
  - 原生屏蔽系统冗余目录（`Windows`, `Program Files`, `ProgramData`, `AppData`, `$Recycle.Bin`, `System Volume Information`, `node_modules` 等），彻底杜绝权限阻断与无休止死循环；
- **结构化导出支持**：
  - 工具原生支持将扫描到的项目路径、体积估算、修改时间、Git 状态等一键导出为 Markdown 表格、CSV 文件或 JSON 报告。

---

### 二、📄 现代富文本 HTML-to-PDF 原生无头打印引擎 (`export_html_to_pdf`) —— 【P0】
- **复用客户端内置 Chromium 通道**：
  - 无需本机安装任何第三方浏览器、wkhtmltopdf 或 Node 模块，直接调用 Electron 宿主内置的 `webContents.printToPDF` 无头打印通道；
- **高保真企业级视觉呈现**：
  - 完美支持现代 CSS3、Tailwind、Flexbox、Grid 卡片布局、暗黑模式背景与 SVG/Mermaid 矢量图表，100% 还原现代 Web 排版的美学质感；
- **多级自适应容灾渲染**：
  - 针对无 GUI 或非完整 Electron 环境，自动平滑降级至纯 JS 物理排版引擎，保障在任何极限环境下均能产出有效、可阅读的企业级 A4 PDF。

---

### 三、🛡️ 交付物意图强契约硬门禁 (Deliverable Hard Gatekeeper) —— 【P0】
- **用户 Prompt 强意图精准提取**：
  - 任务启动时，底层自动分析用户输入中的交付意图，提取出明确要求的制品格式（如 `['pdf', 'html']`、`['xlsx', 'docx']` 等）；
- **退出前双向强制核验**：
  - 在任务轮次准备结束时，门禁自动检索当前会话中真实物理落盘的制品扩展名；
  - 若检测到用户明确要求的交付物缺失（例如用户要 PDF+HTML，但当前尚未生成有效物理文件），**坚决拦截退出，并打回提示 Agent 立即调用工具完成物理落盘**，杜绝任务虎头蛇尾。

---

### 四、🔧 Windows PowerShell 变量语法自愈纠偏 —— 【P1】
- **自动纠偏 `$drive:` 变量作用域冲突**：
  - 内核预处理器自动扫描 PowerShell 命令，将 `"$drive: "` 格式智能修正为 `"${drive}: "`，消除驱动器限定符冲突；
- **保留合法作用域变量**：
  - 严谨保护 `$env:PATH`、`$global:var` 等合法环境变量与作用域声明不受影响。

---

### 五、💼 全流程办公套件无缝统一暴露 —— 【P1】
- 系统提示词（System Prompt）与能力矩阵全面升级，面向 Agent 开放完整的开箱即用办公武器库：
  1. `system_fast_scan`：极速项目盘点与特征检索
  2. `export_html_to_pdf`：现代风格 HTML 转高保真 PDF
  3. `generate_docx`：专业政企 Word 方案排版
  4. `generate_excel` / `read_excel`：多工作表与公式 Excel 读写
  5. `generate_pptx`：商业演示幻灯片制作
  6. `compress_zip` / `extract_zip`：纯 JS 归档压缩与解压

---

## 📊 质量验证矩阵 (Verification Matrix)

本项目已构建专用的全量自动化验证套件 `scripts/verify-v1.10.0.mjs`，全量执行并通过全部测试断言：

| 测试组编号 | 验证模块与核心特性 | 验证重点 | 验证状态 |
|:---:|:---|:---|:---:|
| **Test Group 1** | 零依赖极速扫描器 (FastScanner) | 盘符探测、多工程识别、node_modules 过滤、CSV/Markdown 转换 | ✅ 100% PASS |
| **Test Group 2** | 现代 HTML-to-PDF 无头打印引擎 | 富文本 HTML 解析、高保真 PDF 物理落盘、元数据与页数提取 | ✅ 100% PASS |
| **Test Group 3** | 交付物意图强契约硬门禁 | Prompt 意图提取、缺失产物精准拦截、合格产物物理防伪验签 | ✅ 100% PASS |
| **Test Group 4** | Windows PowerShell 变量语法纠偏 | `$drive: $_` 驱动器冲突纠偏、合法 `$env:PATH` 变量保护 | ✅ 100% PASS |
| **Test Group 5** | 纯 JS 原生 Office 排版套件基线 | 多 Sheet Excel 读写、政企级 Word 排版生成 | ✅ 100% PASS |
| **Test Group 6** | 版本号与发布基线一致性 | package.json 版本升级为 1.10.0、官方文档同步就绪 | ✅ 100% PASS |

---

*ASTeam Agent 架构研发团队 · 2026 年 9 月 15 日*
