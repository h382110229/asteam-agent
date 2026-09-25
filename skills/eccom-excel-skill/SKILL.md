---
name: eccom-excel-skill
description: 按华讯网络（ECCOM）官方规范与品牌色（松石主绿 #006857、强调红 #D31245）生成标准化交付工作簿（.xlsx）。适用于人员通讯录、设备清单、IP规划表、验收检查表、问题跟踪矩阵与多Sheet数据建模。支持纯JS免环境快速执行与Python高级模板双模渲染。
version: 2.1.0
triggers:
  - 华讯excel
  - 华讯表格
  - eccom excel
  - eccom-excel
  - eccom_excel
  - eccom-excel-skill
  - 华讯模板excel
  - 设备清单表格
  - ip规划表
  - 验收检查表
recommended_tools:
  - ask_question
  - write_file
  - run_terminal_command
  - generate_office_document
---

# 华讯 Excel 交付技能套件（eccom-excel-skill）v2.1.0

按华讯网络（ECCOM）官方规范与品牌色规范，生成符合企业交付标准的 **Excel（.xlsx）** 工作簿。  
固定保留「版本控制」「关于」品牌页，数据表统一华讯松石绿表头（`#FF006857`） + 纯白加粗文字 + 微软雅黑 + 细边框；列宽自适应。

## Important

1. **环境自适应**：具备 ASTeam Agent 内置纯 JS 引擎（`generate_office_document`）与 Python `openpyxl` 脚本双模通路。若宿主无 Python，自动调用纯 JS 原生快速生成。
2. **保留模板结构**：「版本控制」「关于」必须存在且被填写；「关于」A1:J1 横幅**禁止删除**。
3. **表头样式统一**：`#FF006857`（松石墨绿 RGB 0/104/87）底 + 白字加粗；短字段居中，长文本列左对齐。
4. **视图强制 normal**；冻结窗格 selection 必须落在 bottomRight（否则打开像“丢表头”）。
5. **列宽优先撑开单行**：手机≥15、邮箱≥30、IP≥15；仅备注类 wrap。
6. 输出为单文件 `.xlsx`；PDF 仅在用户明确要求时再导出。

## 初始化引导（每次新交付）

在生成前，用 `question` 收集（可合并为一轮）：

| 字段 | 必填 | 说明 |
|------|------|------|
| doc_title | 是 | 文档/表格标题 |
| doc_version | 是 | 如 V1.0 |
| doc_date | 是 | 如 2026-02-14 |
| project_name | 是 | 项目名称 |
| author | 是 | 作者 |
| reviewer | 否 | 审核人 |
| purpose | 否 | 「关于」页用途说明 |
| maintainer / maintainer_email / maintainer_phone | 否 | 「关于」页联系信息 |
| sheets | 是 | 数据表列表（名称 + 表头/预设 type + 行数据） |

若用户说「按默认来」：project_name 可用文档标题；数据表先建 4 张空网格。

### 数据表类型 → 推荐预设（`type`）

| type | 适用 | 默认表头 |
|------|------|----------|
| contact | 人员通讯录 | 序号, 姓名, 角色, 单位/部门, 手机, 邮箱, 备注 |
| device | 设备清单 | 序号, 设备名称, 型号, 管理IP, 位置, 责任人, 备注 |
| ip_plan | IP地址规划 | 序号, 网段/用途, 网关, 起始IP, 结束IP, 掩码/长度, 备注 |
| checklist | 验收检查表 | 序号, 检查项, 检查方法, 期望结果, 实际结果, 是否通过, 备注 |
| issues | 问题跟踪 | 序号, 问题描述, 严重级别, 责任人, 状态, 计划关闭日, 备注 |
| schedule | 进度计划 | 序号, 任务名称, 负责人, 开始日期, 结束日期, 状态, 备注 |
| inventory | 资产清单 | 序号, 资产编号, 资产名称, 规格型号, 数量, 存放位置, 备注 |
| param | 参数配置表 | 序号, 参数名, 参数值, 有效范围, 生效方式, 备注 |
| matrix | 自定义 | 必须提供 `header` |

业务更贴切时优先用预设；列不够就扩展 `header`，不要硬套。

## 工作流

### Step 0 — 环境预检（必做）

```powershell
& $env:MIMO_PYTHON "D:\ASTeamAIProject\Skills\huaxun-excel-generator\scripts\precheck_env.py"
```

安装到用户技能目录时，将路径换成实际安装路径。生成脚本默认也会跑预检（`--skip-precheck` 可跳过）。

| 结果 | 处理 |
|------|------|
| 缺 openpyxl | 用 `MIMO_PYTHON`；或 `pip install openpyxl` |
| 缺 `huaxun_base_template.xlsx` | 将公司 `Excel模板（暂定）.xlsx` 复制为该文件名 |

### Step 1 — 收集元数据与表结构

写入临时文件（或用户指定目录）：

- `meta.json`：标题/版本/日期/项目/作者/审核人/联系人等
- `content.json`：数据表 schema

`meta.json` 最小示例：

```json
{
  "doc_title": "XX项目交付通讯录与设备清单",
  "doc_version": "V1.0",
  "doc_date": "2026-02-14",
  "project_name": "XX项目",
  "author": "张三",
  "reviewer": "李四",
  "purpose": "用于项目人员、设备与验收信息的统一维护。",
  "maintainer": "张三",
  "maintainer_email": "zhangsan@example.com",
  "maintainer_phone": "13800000000",
  "changes": [
    {"version": "V1.0", "date": "2026-02-14", "author": "张三", "summary": "初稿创建"}
  ]
}
```

`content.json` 最小示例：

```json
{
  "sheets": [
    {
      "name": "人员通讯录",
      "type": "contact",
      "rows": [
        ["1", "张三", "项目经理", "华讯", "13800000000", "zhangsan@example.com", ""]
      ]
    },
    {"name": "设备清单", "type": "device", "rows": []},
    {"name": "验收检查表", "type": "checklist", "rows": []}
  ]
}
```

完整字段与列宽规则见 `references/format-spec.md`。

### Step 2 — 生成工作簿

始终通过技能脚本（使用 `MIMO_PYTHON`）：

```powershell
& $env:MIMO_PYTHON "D:\ASTeamAIProject\Skills\huaxun-excel-generator\scripts\generate_huaxun_excel.py" `
  --meta meta.json --content content.json --out <输出目录>
```

可选 `--name 基名` 控制输出文件名。若目标文件被 Excel 占用（Permission denied），换 `--name` 或让用户先关闭文件。

### Step 3 — QA（必做）

1. 能被 `openpyxl` 打开，无异常。
2. 含「版本控制」「关于」及全部数据表；`关于` 索引与表名一致。
3. 无 `{{` / `TODO` / `TBD`；版本控制占位已填实。
4. 数据表：R1 标题条 + R2 表头；手机/邮箱单行可读。
5. 所有表 `sheet_view.view == "normal"`；冻结 selection 在 bottomRight。
6. 「关于」A1:J1 横幅含标题且未取消合并。

```powershell
& $env:MIMO_PYTHON -c "from openpyxl import load_workbook; wb=load_workbook(r'输出.xlsx'); print([(n, wb[n].sheet_view.view, wb[n].freeze_panes) for n in wb.sheetnames]); ws=wb['人员通讯录']; print([(chr(66+j), ws.column_dimensions[chr(66+j)].width) for j in range(6)]); print(wb['关于']['A1'].value)"
```

### Step 4 — 交付

对用户给出：

- `.xlsx` 绝对路径
- 工作表清单（含版本控制/关于）
- 若仍有未填业务数据：提醒哪些表仅有表头/空行

## 样式规则（skill 级，每次生成强制执行）

- 字体：微软雅黑 10pt
- **视图强制 normal**（模板「关于」曾为 pageLayout，会导致页眉显示不完整）
- 「关于」A1:J1 横幅：文档标题 + `#FF006857`（松石墨绿）白字加粗（禁止删除/取消合并）
- 数据表：R1 表名标题条（松石绿底），R2 表头（白字加粗，居中）
- **列宽自适应**：手机≥15、邮箱≥30、IP≥15，优先单行
- **换行策略**：仅备注/说明/描述等长文本列 wrap
- 数据：短字段居中；长文本左对齐；全部垂直居中
- 边框：四边 thin `#A6A6A6`
- 行高：标题 22 / 表头 20 / 数据 16.5（长文本按行数增高）
- 冻结：表头下一行（selection=bottomRight）；网格线默认关闭
- 打印页眉/页脚：页眉=表名/文档标题，页脚=页码
- 版本控制横向 A4；数据页纵向 A4；预留约 20 行空数据行

实现：`build_data_sheet` + `fill_version_control` + `fill_about` + `_reset_sheet_view`。详见 `references/format-spec.md` 与 `CHANGELOG.md`。

## 资源

| 路径 | 用途 |
|------|------|
| `assets/huaxun_base_template.xlsx` | 含「版本控制/关于/sheet1-4」的原模板副本 |
| `references/format-spec.md` | 颜色/布局/列宽/预设表规范 |
| `scripts/generate_huaxun_excel.py` | 唯一生成入口 |
| `scripts/precheck_env.py` | 环境与模板预检 |
| `examples/` | 可运行的 meta/content 样例 |

## Examples

**User:** 按华讯 Excel 模板出一份项目通讯录和设备清单，项目名同标题，作者张三。

**Actions:** 补问审核人/版本日期（若未给）→ content 写 contact + device → 跑脚本 → QA → 提交 xlsx 路径。

**User:** 用华讯格式做验收检查表，列要多一列「证据截图链接」。

**Actions:** type=checklist 且 header 追加列 → 填 rows（可空）→ 生成并交付。

**User:** 只要版本控制和一张自定义参数表。

**Actions:** sheets 仅一条 param/matrix；删除多余 sheet1-4；更新关于索引。

## Troubleshooting

| 问题 | 处理 |
|------|------|
| 打开后表头“不见了” | 检查 view 是否 normal、freeze selection 是否 bottomRight；走本技能脚本重新生成 |
| 关于页眉/横幅异常 | 禁止手工删 A1:J1；重新生成会重建横幅 |
| 手机/邮箱截断或中间换行 | 脚本已按内容加宽且非长文本列不 wrap；勿手改列宽后另存覆盖 |
| Permission denied | 目标 xlsx 被 Excel/WPS 占用；关闭文件或换 `--name` |
| openpyxl 打不开模板 | 须 `.xlsx`；用技能内 `huaxun_base_template.xlsx` |
| 关于页索引空白 | content.sheets 需有 name；生成后按最终表名重写 |
| 中文乱码 | 使用 `MIMO_PYTHON`；JSON 存 UTF-8 |
| 需要 PDF | 用户明确要求时再用 LibreOffice/Excel 导出 |
