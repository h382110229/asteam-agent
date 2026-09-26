---
name: eccom-word-skill
description: 按华讯网络（ECCOM）官方知识模板规范 v2.3 与品牌色（松石主绿 #006857、强调红 #D31245）生成交付 Word（.docx）与 PDF。适用于技术方案白皮书、实施方案、验收报告、培训操作手册。支持自动大纲收集、表头居中数据左对齐、版本控制历史表与品牌母版保持。
version: 2.1.0
triggers:
  - 华讯word
  - 华讯模板
  - 华讯文档
  - eccom word
  - eccom-word
  - eccom_word
  - eccom-word-skill
  - 华讯方案
  - 华讯白皮书
  - 华讯验收报告
recommended_tools:
  - ask_question
  - write_file
  - run_terminal_command
  - generate_office_document
  - export_html_to_pdf
---

# 华讯 Word 与公文交付技能套件（eccom-word-skill）v2.1.0

按华讯知识模板格式规范 v2.3 与 ECCOM 品牌设计规范，生成符合企业交付标准的 **Word (.docx) + PDF** 交付文档。表格对齐已相对原模板修正（表头居中、数据左对齐、垂直居中、防跨页割裂）。

## Important

1. **先环境自适应，再引导，再生成**：支持 Python 高级脚本生成与 ASTeam Agent 内置纯 JS 引擎双轨互通。
2. **保留原模板品牌层**：封面横幅/ECCOM logo/页眉客户 logo 位/页脚公司样式来自原模板，**禁止**清空页眉页脚图片。
3. **表格对齐必须走 `normalize_table_alignment`**。
4. **免 LibreOffice 阻塞**：PDF 导出优先 Word COM；若宿主机未安装 Word 且无 LibreOffice，生成器将保全高质量 Word (.docx) 交付件并提示，用户可通过 ASTeam Agent 内置无头 Chromium 打印引擎直接输出高精度 PDF，杜绝流程硬中断。

## 初始化引导（每次新交付）

在生成前，用 `question` 收集（可合并为一轮）：

| 字段 | 必填 | 说明 |
|------|------|------|
| doc_title | 是 | 文档标题 |
| doc_version | 是 | 如 V1.0 |
| doc_date | 是 | 如 2026-02-14 |
| project_name | 是 | 项目名称 |
| customer_name | 是 | 客户名称 |
| author | 是 | 作者 |
| reviewer | 否 | 审核人 |
| customer_logo | 否 | 客户 logo 绝对路径；缺省用华讯 ECCOM logo |
| doc_type | 是 | 通用知识 / 项目方案设计 / 实施验收 / 培训手册 |
| outline | 是 | 章节大纲（可先给草稿，确认后再写正文） |

若用户说「按默认来」：company_name=上海华讯网络系统有限公司，logo=技能内 `assets/logo_eccom_cn.png`。

### 文档类型 → 推荐骨架

- **通用知识文档**：背景 → 概念/架构 → 实施要点 → 总结
- **项目方案/设计**：项目概述（含项目概况表）→ 需求分析 → 总体设计 → 详细设计（含拓扑/配置）→ 实施计划
- **实施/验收报告**：项目信息 → 实施范围与记录 → 问题与处理 → 验收结论 → 签字盖章
- **培训/操作手册**：适用范围 → 环境准备 → 操作步骤（分步 + 小心/警告）→ 常见问题

## 工作流

### Step 0 — 环境预检（必做）

```powershell
python "<skill_dir>\scripts\precheck_env.py"
```

生成脚本默认也会跑预检（可用 `--skip-precheck` 跳过）。

| 结果 | 处理 |
|------|------|
| 缺 python-docx/lxml | 用 `MIMO_PYTHON`（已预装）；或 `pip install python-docx lxml Pillow` |
| 缺 `huaxun_base_template.docx` | 从原 `.docm` 重新抽骨架（保留页眉页脚与封面图） |
| Word COM 不可用 | 安装 Microsoft Word；或安装 LibreOffice 并设置 `MIMO_SOFFICE` 指向 `soffice.exe` |
| 缺中文字体 | Windows 安装/启用 宋体、黑体、等线 |

### Step 1 — 收集元数据与大纲

写入临时文件（或用户指定目录）：

- `meta.json`：上表字段
- `content.json`：章节与块（schema 见 `scripts/generate_huaxun_doc.py` 文件头注释与 `references/format-spec.md`）

`content.json` 最小示例：

```json
{
  "include_toc": true,
  "include_version_control": true,
  "sections": [
    {
      "heading": "项目概述",
      "level": 1,
      "blocks": [
        {"type": "para", "text": "……"},
        {"type": "table", "caption": "表1 项目概况表",
         "header": ["序号", "名称", "取值", "有效范围", "备注"],
         "rows": [["1", "项目名称", "示例项目", "", ""]]},
        {"type": "note", "kind": "注释", "text": "……"}
      ]
    }
  ]
}
```

### Step 2 — 生成 Word + PDF

始终通过技能脚本（使用 `MIMO_PYTHON`）：

```powershell
python "<skill_dir>\scripts\generate_huaxun_doc.py" `
  --meta meta.json --content content.json --out <输出目录> --pdf
```

可选 `--name 基名` 控制输出文件名。

### Step 3 — QA（必做）

1. `docx` 能被 `python-docx` 打开、无异常。
2. 全文无残留 `{{` / `TODO` / `TBD`。
3. 抽查表格：表头居中加粗，数据左对齐（短字段居中），单元格垂直居中。
4. PDF 存在且可打开；目录若为空，在说明里提醒用户 Word 中更新域（脚本已设 `updateFields`）。

```powershell
& $env:MIMO_PYTHON -c "import docx; d=docx.Document(r'输出.docx'); print(len(d.paragraphs), len(d.tables))"
```

### Step 4 — 交付

对用户给出：

- `.docx` 与 `.pdf` 绝对路径
- 使用了默认华讯 logo 还是客户 logo
- 若目录未刷新：用 Word 打开 → 右键目录 → 更新域

## 表格规则（skill 级，每次生成强制执行）

- 表头居中加粗；数据左对齐；短字段列居中；全部垂直居中
- 清除单元格首行缩进；按内容动态定列宽
- **紧跟数据表的注释/建议/警告必须并入同一张表最后一行**（禁止拆成第二张表、禁止空行割裂）
- 行 `cantSplit` + 题注 `keepNext`；行数≥5 整表另起页

实现：`add_block` 内 note-merge + 保存后 `_fuse_note_tables_and_drop_gaps()` 兜底。详见 `references/format-spec.md`。

## 资源

| 路径 | 用途 |
|------|------|
| `assets/huaxun_base_template.docx` | 含华讯样式/编号的干净骨架 |
| `assets/logo_eccom_cn.png` | 默认封面 logo |
| `assets/cover_banner_city.png` / `cover_banner_datacenter.png` | 封面装饰备选图 |
| `references/format-spec.md` | 字体/编号/表格/块类型规范 |
| `scripts/generate_huaxun_doc.py` | 唯一生成入口 |

## Examples

**User:** 按华讯模板出一份《XX银行网络优化设计方案》Word 和 PDF，项目名同标题，作者张三。

**Actions:** grill 审核人/客户logo/版本日期（若未给）→ 写 meta/content → 跑脚本 `--pdf` → QA → 提交两文件路径。

**User:** 用华讯格式写实施验收报告，客户 logo 在 `E:\logos\abc.png`。

**Actions:** customer_logo 填该路径 → 验收骨架（含签字盖章块）→ 生成并交付。

## Troubleshooting

| 问题 | 处理 |
|------|------|
| python-docx 打不开原 .docm | 用本技能的 `huaxun_base_template.docx`，不要直接读 .docm |
| PDF 无目录 | Word 更新域；或 LibreOffice 再转换一次 |
| 表格仍不对齐 | 确认走的是本技能脚本，且调用了 normalize；勿手改后另存 |
| 缺字体 | 目标机需「等线/黑体/宋体」；Windows 默认具备 |
| 客户 logo 过大 | 生成前用 Pillow 缩到宽 ≤ 800px 再传入 meta |
