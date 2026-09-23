#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Huaxun delivery Excel generator — fill base template with version/about + data sheets.

Keeps company branding conventions from Excel模板（暂定）:
- 版本控制: 文档属性 + 版本变更
- 关于: purpose / index / confidentiality / contact
- data sheets: teal header (#008080), 微软雅黑 10pt, thin borders

CLI:
  python generate_huaxun_excel.py --meta meta.json --content content.json --out ./out [--name 基名]

content.json schema (see file head / references/format-spec.md):
{
  "meta": { ... optional override of --meta ... },
  "keep_empty_sheets": false,
  "sheets": [
    {
      "name": "人员通讯录",
      "type": "contact",          # preset or "matrix"
      "header": [...],            # optional if preset
      "rows": [[...], ...],
      "start_cell": "B2",         # default B2
      "column_widths": {"B": 10, "C": 14},
      "freeze_panes": true,       # default true
      "show_gridlines": false
    }
  ]
}
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from copy import copy
from datetime import date, datetime
from pathlib import Path

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import column_index_from_string, get_column_letter
    from openpyxl.worksheet.worksheet import Worksheet
except Exception as exc:  # pragma: no cover
    print("缺少 openpyxl，请使用 MIMO_PYTHON 或 pip install openpyxl", file=sys.stderr)
    raise

SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS = SKILL_DIR / "assets"
BASE_TEMPLATE = ASSETS / "huaxun_base_template.xlsx"
DEFAULT_COMPANY = "上海华讯网络系统有限公司"

# --- design tokens (from Excel模板（暂定）) ---
FONT_NAME = "微软雅黑"
FONT_SIZE = 10
HEADER_FILL = "FF008080"
HEADER_FG = "FFFFFF"
DATA_FG = "404040"
PLACEHOLDER_FG = "FF0000"
BORDER_COLOR = "A6A6A6"
BORDER_HEADER_COLOR = "FFFFFF"
ROW_H_HEADER = 20.0
ROW_H_DATA = 16.5

# version-control cell map (base template)
VC_META_MAP = {
    "project_name": "C4",
    "doc_title": "C5",
    "doc_version": "C6",
    "doc_date": "C7",
    "author": "C8",
    "reviewer": "C9",
}
VC_CHANGE_START_ROW = 14
VC_CHANGE_MAX_PREALLOC = 17  # template rows 14-17
ABOUT_SHEET = "关于"
VC_SHEET = "版本控制"

# preset sheet headers
PRESET_HEADERS: dict[str, list[str]] = {
    "contact": ["序号", "姓名", "角色", "单位/部门", "手机", "邮箱", "备注"],
    "device": ["序号", "设备名称", "型号", "管理IP", "位置", "责任人", "备注"],
    "ip_plan": ["序号", "网段/用途", "网关", "起始IP", "结束IP", "掩码/长度", "备注"],
    "checklist": ["序号", "检查项", "检查方法", "期望结果", "实际结果", "是否通过", "备注"],
    "issues": ["序号", "问题描述", "严重级别", "责任人", "状态", "计划关闭日", "备注"],
    "schedule": ["序号", "任务名称", "负责人", "开始日期", "结束日期", "状态", "备注"],
    "inventory": ["序号", "资产编号", "资产名称", "规格型号", "数量", "存放位置", "备注"],
    "param": ["序号", "参数名", "参数值", "有效范围", "生效方式", "备注"],
}

SHORT_COL_KEYS = {
    "序号", "版本", "日期", "更新日期", "更新人", "作者", "审核人",
    "编号", "属性", "类别", "类型", "状态", "优先级", "角色", "姓名",
    "数量", "是否通过", "严重级别", "掩码/长度",
}
# 手机/邮箱/IP 等“短字段名但内容偏长”，单独给最小宽，不走短列窄宽
MIN_WIDTH_BY_HEADER = {
    "序号": 7.0,
    "手机": 15.0,
    "电话": 15.0,
    "邮箱": 30.0,
    "管理IP": 15.0,
    "起始IP": 15.0,
    "结束IP": 15.0,
    "网关": 15.0,
    "IP": 15.0,
    "掩码/长度": 11.0,
    "日期": 13.0,
    "更新日期": 13.0,
    "开始日期": 13.0,
    "结束日期": 13.0,
    "计划关闭日": 13.0,
    "版本": 10.0,
    "数量": 8.0,
    "状态": 10.0,
    "是否通过": 10.0,
    "严重级别": 10.0,
    "优先级": 9.0,
}
# 超长自由文本列允许换行，其余尽量撑开不换行
WRAP_COL_KEYS = {
    "备注", "说明", "描述", "内容", "取值", "主要更新内容", "配置内容",
    "问题描述", "检查项", "检查方法", "期望结果", "实际结果", "任务名称",
}
LONG_VALUE_KEYS = {
    "内容", "名称", "描述", "说明", "备注", "取值", "主要更新内容",
    "配置内容", "问题描述", "检查项", "检查方法", "期望结果", "实际结果",
    "任务名称", "设备名称", "资产名称", "规格型号", "网段/用途", "参数名", "参数值",
    "单位/部门", "管理IP", "位置", "存放位置", "责任人", "负责人",
    "邮箱", "起始IP", "结束IP", "网关", "资产编号", "计划关闭日",
    "开始日期", "结束日期", "有效范围", "生效方式",
}


# ---------- env precheck ----------

def precheck(verbose: bool = True) -> list[str]:
    problems: list[str] = []
    try:
        import openpyxl  # noqa: F401
    except Exception as exc:
        problems.append(f"Python 依赖缺失 (openpyxl): {exc}")
        problems.append("修复: 使用 MIMO_PYTHON 或 pip install openpyxl")
    if not BASE_TEMPLATE.is_file():
        problems.append(f"缺少基础模板: {BASE_TEMPLATE}")
        problems.append("修复: 将公司 Excel模板（暂定）.xlsx 复制为 assets/huaxun_base_template.xlsx")
    if verbose:
        print("=== 环境预检 ===")
        print(f"  MIMO_PYTHON: {os.environ.get('MIMO_PYTHON', '(未设置，用系统 python)')}")
        print(f"  基础模板: {'OK' if BASE_TEMPLATE.is_file() else '缺失'}")
        for p in problems:
            print("  [问题]", p)
        if not problems:
            print("  结果: 通过")
    return problems


# ---------- helpers ----------

def _is_short_col(header: list[str] | None, col_idx: int) -> bool:
    if not header or col_idx >= len(header):
        return False
    name = str(header[col_idx]).strip()
    if name in LONG_VALUE_KEYS:
        return False
    return name in SHORT_COL_KEYS or len(name) <= 2


def _thin_border(color: str = BORDER_COLOR) -> Border:
    side = Side(style="thin", color=color)
    return Border(left=side, right=side, top=side, bottom=side)


def _clear_cell_style(cell) -> None:
    """Wipe value and styles so residual template borders/fills disappear."""
    cell.value = None
    cell.font = Font(name=FONT_NAME, size=FONT_SIZE, color=DATA_FG)
    cell.fill = PatternFill(fill_type=None)
    cell.border = Border()
    cell.alignment = Alignment()
    cell.number_format = "General"


def _reset_sheet_view(ws: Worksheet, freeze_cell: str | None = None) -> None:
    """Force normal view + open-at-top-left so headers/banner are visible on open.

    Original template may store view='pageLayout' (关于页页眉显示不完整).
    When freeze_panes is set, selection must live in bottomRight pane —
    leftover selection A1/pane=None makes Excel/WPS jump or hide top rows.
    """
    try:
        # pageLayout / pageBreakPreview render headers incompletely in some clients
        ws.sheet_view.view = "normal"
    except Exception:
        pass
    try:
        ws.sheet_view.topLeftCell = "A1"
    except Exception:
        pass

    selections = []
    if freeze_cell:
        # parse freeze cell for active pane selection
        col, row = _parse_cell(freeze_cell)
        # frozen pane occupies cols A..(col-1) and rows 1..(row-1)
        active_pane = "bottomRight"
        selections.append({
            "pane": active_pane,
            "activeCell": freeze_cell,
            "sqref": freeze_cell,
        })
    else:
        selections.append({
            "pane": None,
            "activeCell": "A1",
            "sqref": "A1",
        })

    try:
        from openpyxl.worksheet.views import Selection
        sel_objs = []
        for s in selections:
            sel_objs.append(Selection(pane=s["pane"], activeCell=s["activeCell"], sqref=s["sqref"]))
        ws.sheet_view.selection = sel_objs
    except Exception:
        try:
            sel = ws.sheet_view.selection
            if sel:
                sel[0].pane = selections[0]["pane"]
                sel[0].activeCell = selections[0]["activeCell"]
                sel[0].sqref = selections[0]["sqref"]
                while len(sel) > 1:
                    sel.pop()
        except Exception:
            pass


def _font(*, bold: bool = False, color: str = DATA_FG, size: float = FONT_SIZE) -> Font:
    return Font(name=FONT_NAME, size=size, bold=bold, color=color)


def _align(*, horizontal: str = "left", vertical: str = "center", wrap: bool = True) -> Alignment:
    return Alignment(horizontal=horizontal, vertical=vertical, wrap_text=wrap)


def _fill_header() -> PatternFill:
    return PatternFill("solid", fgColor=HEADER_FILL)


def _text_width(text) -> float:
    """Display width in Excel column-width units (≈ width of one '0')."""
    s = "" if text is None else str(text)
    w = 0.0
    for ch in s:
        o = ord(ch)
        # CJK / fullwidth → ~2 units; ASCII → 1 unit
        if o >= 0x1100 and o != 0x2015:
            w += 2.05
        else:
            w += 1.0
    return w


def _col_min_width(header_name: str) -> float:
    name = str(header_name or "").strip()
    if name in MIN_WIDTH_BY_HEADER:
        return MIN_WIDTH_BY_HEADER[name]
    if name in WRAP_COL_KEYS:
        return 16.0
    if name in SHORT_COL_KEYS or len(name) <= 2:
        return 9.0
    return 12.0


def _col_max_width(header_name: str, needed: float) -> float:
    name = str(header_name or "").strip()
    if name in WRAP_COL_KEYS:
        # long free-text: allow wrap at reasonable width
        return max(28.0, min(48.0, needed))
    # identity-like fields: prefer one-line fit
    if name in ("邮箱", "手机", "管理IP", "起始IP", "结束IP", "网关"):
        return max(MIN_WIDTH_BY_HEADER.get(name, 16.0), min(36.0, needed + 2))
    return max(14.0, min(40.0, needed + 2))


def _auto_col_width(header: list[str], rows: list[list], col_idx: int) -> float:
    """Size column so typical content shows on one line; only long text wraps."""
    name = str(header[col_idx]).strip() if col_idx < len(header) else ""
    samples: list = []
    if col_idx < len(header) and header[col_idx] not in (None, ""):
        samples.append(header[col_idx])
    for row in rows:
        if col_idx < len(row) and row[col_idx] not in (None, ""):
            samples.append(row[col_idx])

    # content-driven width + padding so text is not clipped
    needed = max((_text_width(s) for s in samples), default=10.0) + 1.8
    min_w = _col_min_width(name)
    max_w = _col_max_width(name, needed)
    width = max(needed, min_w)

    # 序号/状态等短列：内容再长也不无限撑开
    if name in SHORT_COL_KEYS and name not in MIN_WIDTH_BY_HEADER:
        width = min(width, max(min_w, 12.0))

    return max(6.0, min(width, max_w))


def _should_wrap(header: list[str], col_idx: int) -> bool:
    name = str(header[col_idx]).strip() if col_idx < len(header) else ""
    return name in WRAP_COL_KEYS


def _normalize_date_str(value: str | None) -> str:
    if not value:
        return ""
    s = str(value).strip()
    # 2026-02-14 / 2026/2/14 / 2026.2.14 -> 26年02月14日 style kept as ISO if already pretty
    m = re.match(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return s


def _cn_date(value: str | None) -> str:
    """Convert to yy年mm月dd日 when possible, else pass through."""
    if not value:
        return ""
    s = str(value).strip()
    m = re.match(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y}年{mo:02d}月{d:02d}日"
    return s


def _parse_cell(ref: str) -> tuple[int, int]:
    """'B2' -> (col_idx, row) 1-based col."""
    m = re.match(r"([A-Za-z]+)(\d+)", ref.strip())
    if not m:
        return 2, 2
    return column_index_from_string(m.group(1).upper()), int(m.group(2))


def _ensure_placeholders_removed(ws, meta: dict) -> None:
    """Clear residual <...> placeholders in VC if values provided."""
    for key, cell_ref in VC_META_MAP.items():
        cell = ws[cell_ref]
        val = cell.value
        if isinstance(val, str) and val.strip().startswith("<") and val.strip().endswith(">"):
            # leave empty if meta missing that field
            if not meta.get(key):
                cell.value = None


def fill_version_control(wb, meta: dict) -> None:
    if VC_SHEET not in wb.sheetnames:
        return
    ws = wb[VC_SHEET]
    label_font = _font(color=DATA_FG)

    for key, cell_ref in VC_META_MAP.items():
        raw = meta.get(key, "")
        if key == "doc_date":
            raw = _cn_date(raw) if raw else raw
        cell = ws[cell_ref]
        cell.value = raw if raw not in (None, "") else cell.value
        # keep filled values dark; keep red only if still a placeholder
        if isinstance(cell.value, str) and cell.value.strip().startswith("<"):
            cell.font = _font(color=PLACEHOLDER_FG)
        else:
            cell.font = _font(color=DATA_FG)
        cell.alignment = _align(horizontal="left")
        cell.border = _thin_border()
        # merged C:E — style siblings for border continuity
        for col in range(4, 6):  # D,E
            ws.cell(row=cell.row, column=col).border = _thin_border()

    # ensure label column font
    for row in range(4, 10):
        ws.cell(row=row, column=2).font = label_font
        ws.cell(row=row, column=2).alignment = _align(horizontal="left")

    # version change history
    changes = meta.get("changes") or []
    if isinstance(changes, dict):
        changes = [changes]
    if not changes:
        # synthesize one row from current meta
        changes = [{
            "version": meta.get("doc_version", ""),
            "date": _cn_date(meta.get("doc_date", "")),
            "author": meta.get("author", ""),
            "summary": "初稿创建",
        }]

    # need enough rows
    needed = VC_CHANGE_START_ROW + len(changes) - 1
    _extend_vc_change_rows(ws, needed)

    # clear old prealloc values first
    for r in range(VC_CHANGE_START_ROW, max(VC_CHANGE_MAX_PREALLOC, needed) + 1):
        for c in range(2, 6):
            cell = ws.cell(row=r, column=c)
            cell.value = None
            cell.font = _font(color=DATA_FG)
            cell.alignment = _align(horizontal="left")
            cell.border = _thin_border()
            cell.number_format = "General"

    for i, ch in enumerate(changes):
        r = VC_CHANGE_START_ROW + i
        vals = [
            ch.get("version", meta.get("doc_version", "")),
            _cn_date(ch.get("date", meta.get("doc_date", ""))),
            ch.get("author", meta.get("author", "")),
            ch.get("summary", ""),
        ]
        for j, v in enumerate(vals):
            cell = ws.cell(row=r, column=2 + j)
            cell.value = v
            cell.font = _font(color=DATA_FG)
            cell.alignment = _align(
                horizontal="center" if j < 3 else "left"
            )
            cell.border = _thin_border()
            cell.number_format = "General"
    try:
        ws.oddHeader.center.text = meta.get("doc_title") or "版本控制"
        ws.oddFooter.center.text = "第 &P 页，共 &N 页"
    except Exception:
        pass
    _reset_sheet_view(ws)


def _extend_vc_change_rows(ws: Worksheet, last_row: int) -> None:
    """Copy style from row 14 down to last_row if needed."""
    if last_row <= VC_CHANGE_MAX_PREALLOC:
        return
    src_row = VC_CHANGE_START_ROW
    for r in range(VC_CHANGE_MAX_PREALLOC + 1, last_row + 1):
        for c in range(2, 6):
            src = ws.cell(row=src_row, column=c)
            dst = ws.cell(row=r, column=c)
            dst.font = copy(src.font)
            dst.alignment = copy(src.alignment)
            dst.border = copy(src.border)
            dst.fill = copy(src.fill)
            dst.number_format = src.number_format
        ws.row_dimensions[r].height = ROW_H_DATA


def fill_about(wb, meta: dict, sheet_names: list[str]) -> None:
    """Fill 关于 sheet in-place — keep original banner/header structure."""
    if ABOUT_SHEET not in wb.sheetnames:
        return
    ws = wb[ABOUT_SHEET]
    purpose = meta.get("purpose") or f"这份表格用于支撑「{meta.get('doc_title') or meta.get('project_name') or '项目'}」相关交付与协同管理。"
    maintainer = meta.get("maintainer") or meta.get("author") or ""
    email = meta.get("maintainer_email") or ""
    phone = meta.get("maintainer_phone") or ""
    last_update = _cn_date(meta.get("doc_date", ""))
    banner_title = meta.get("doc_title") or meta.get("project_name") or "项目交付表"

    def set_a(row: int, text: str, *, bold: bool = False, color: str = DATA_FG, wrap: bool = True):
        cell = ws.cell(row=row, column=1)
        cell.value = text
        cell.font = _font(bold=bold, color=color)
        cell.alignment = _align(horizontal="left", vertical="center", wrap=wrap)

    # --- restore original banner A1:J1 (do not drop 页眉) ---
    # unmerge any partial row-1 merges, then re-merge full banner
    for rng in list(ws.merged_cells.ranges):
        if rng.min_row == 1:
            ws.unmerge_cells(str(rng))
    for col in range(1, 11):  # A..J
        cell = ws.cell(row=1, column=col)
        cell.value = None
        cell.fill = _fill_header()
        cell.font = _font(bold=True, color=HEADER_FG, size=12)
        cell.alignment = _align(horizontal="left", vertical="center")
        cell.border = Border()  # banner is a solid strip, no inner grid
    ws["A1"].value = banner_title
    ws.merge_cells("A1:J1")
    ws.row_dimensions[1].height = 24.0

    # original template uses very wide col A so long sentences stay on one visual line
    ws.column_dimensions["A"].width = 110
    for col in range(2, 11):
        ws.column_dimensions[get_column_letter(col)].width = 8.0

    set_a(2, "关于这份表格: ", bold=True)
    set_a(3, purpose)
    set_a(5, "随着项目的进展，该表格会根据实际情况不断更新")
    set_a(7, "这里你可以找到:", bold=True)

    # sheet index from A8 downward — clear old index rows first
    for r in range(8, 13):
        ws.cell(row=r, column=1).value = None

    data_names = [n for n in sheet_names if n not in (VC_SHEET, ABOUT_SHEET)]
    for i, name in enumerate(data_names):
        set_a(8 + i, name)

    how_row = 8 + len(data_names) + 1
    set_a(how_row, "如何使用这张表:", bold=True)
    usage = meta.get("usage") or (
        "请各责任人按列填写并保持字段完整；人员/设备/进度等信息变更时及时更新对应数据表，"
        "并在「版本控制」页登记版本与主要更新内容。"
    )
    set_a(how_row + 1, usage)
    # 用途/使用说明按内容估高，避免截断
    ws.row_dimensions[3].height = max(18.0, 16.5 * max(1, int(_text_width(purpose) / 100) + 1))
    ws.row_dimensions[how_row + 1].height = max(18.0, 16.5 * max(1, int(_text_width(usage) / 100) + 1))

    conf_row = how_row + 3
    set_a(conf_row, "关于信息的保密:", bold=True)
    conf = (
        meta.get("confidentiality")
        or "该表格的信息仅限于项目内部小组使用，禁止将表内信息泄露在项目以外其他地方。"
    )
    set_a(conf_row + 1, conf)
    ws.row_dimensions[conf_row + 1].height = max(18.0, 16.5 * max(1, int(_text_width(conf) / 100) + 1))

    contact_row = conf_row + 3
    set_a(contact_row, "如果有任何建议或反馈信息，请联系：")
    set_a(contact_row + 1, maintainer or "<维护更新作者姓名或组织>")
    set_a(contact_row + 2, email or "<作者或组织电子邮箱>")
    set_a(contact_row + 3, phone or "<作者或组织电话号码>")
    for offset in (1, 2, 3):
        cell = ws.cell(row=contact_row + offset, column=1)
        if isinstance(cell.value, str) and cell.value.strip().startswith("<"):
            cell.font = _font(color=PLACEHOLDER_FG)
        else:
            cell.font = _font(color=DATA_FG)

    set_a(contact_row + 4, f"最近更新 {last_update}" if last_update else "最近更新 ")

    # print page header/footer so 页眉页脚 in print/PDF also complete
    try:
        ws.oddHeader.center.text = banner_title
        ws.oddFooter.center.text = "第 &P 页，共 &N 页"
    except Exception:
        pass

    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = 9  # A4
    _reset_sheet_view(ws)


def _reset_sheet_grid(ws: Worksheet, start_col: int, start_row: int, max_rows: int, max_cols: int) -> None:
    """Clear values in a reasonable used range so new content is clean."""
    for r in range(1, max_rows + 1):
        for c in range(1, max_cols + 1):
            cell = ws.cell(row=r, column=c)
            # do not wipe if we will overwrite header/data area only — wipe all for custom sheets
            cell.value = None


def build_data_sheet(
    ws: Worksheet,
    *,
    name: str,
    header: list[str],
    rows: list[list],
    start_cell: str = "B2",
    column_widths: dict | None = None,
    freeze_panes: bool = True,
    show_gridlines: bool = False,
) -> None:
    start_col, start_row = _parse_cell(start_cell)
    ncols = len(header)
    nrows = max(len(rows), 20)  # keep some blank rows for manual fill

    # clear values AND styles across a generous range (template residual borders)
    clear_to_row = max(start_row + nrows + 10, ws.max_row or 0, 60)
    clear_to_col = max(start_col + ncols + 4, ws.max_column or 0, 16)
    for r in range(1, clear_to_row + 1):
        for c in range(1, clear_to_col + 1):
            _clear_cell_style(ws.cell(row=r, column=c))
        # drop oversized leftover row heights
        if r in ws.row_dimensions:
            ws.row_dimensions[r].height = None

    # drop leftover freeze from template before re-applying
    ws.freeze_panes = None

    # title bar in row above header (default start_row=2 → title at row 1)
    title_row = start_row - 1
    if title_row >= 1:
        end_col = start_col + ncols - 1
        # clear any old merge on title row
        for rng in list(ws.merged_cells.ranges):
            if rng.min_row == title_row and rng.max_row == title_row:
                ws.unmerge_cells(str(rng))
        for c in range(start_col, end_col + 1):
            cell = ws.cell(row=title_row, column=c)
            cell.value = None
            cell.fill = _fill_header()
            cell.font = _font(bold=True, color=HEADER_FG, size=11)
            cell.alignment = _align(horizontal="left", vertical="center")
            cell.border = _thin_border(BORDER_HEADER_COLOR)
        ws.cell(row=title_row, column=start_col).value = name
        if end_col > start_col:
            ws.merge_cells(
                start_row=title_row,
                start_column=start_col,
                end_row=title_row,
                end_column=end_col,
            )
        ws.row_dimensions[title_row].height = 22.0

    # header
    for j, h in enumerate(header):
        cell = ws.cell(row=start_row, column=start_col + j)
        cell.value = h
        cell.font = _font(bold=True, color=HEADER_FG)
        cell.fill = _fill_header()
        cell.alignment = _align(horizontal="center", vertical="center", wrap=True)
        cell.border = _thin_border(BORDER_HEADER_COLOR)
    ws.row_dimensions[start_row].height = ROW_H_HEADER

    # data + blank template rows
    total_data_rows = nrows
    for i in range(total_data_rows):
        r = start_row + 1 + i
        row_vals = rows[i] if i < len(rows) else []
        max_lines = 1
        for j in range(ncols):
            cell = ws.cell(row=r, column=start_col + j)
            raw = row_vals[j] if j < len(row_vals) else None
            if raw is not None and raw != "":
                cell.value = raw
            hcenter = _is_short_col(header, j)
            # 仅长文本列自动换行；其余靠列宽撑开，避免邮箱/手机被拦腰截断
            wrap = _should_wrap(header, j)
            cell.font = _font(color=DATA_FG)
            cell.alignment = _align(horizontal="center" if hcenter else "left", wrap=wrap)
            cell.border = _thin_border()
            if wrap and raw not in (None, ""):
                col_w = _auto_col_width(header, rows, j)
                lines = max(1, int(_text_width(raw) / max(col_w - 1.5, 8)) + 1)
                max_lines = max(max_lines, min(lines, 4))
        ws.row_dimensions[r].height = max(ROW_H_DATA, 16.5 * max_lines)

    # column widths
    # margin col A / left of start
    if start_col > 1:
        left_letter = get_column_letter(start_col - 1)
        if left_letter not in (column_widths or {}):
            ws.column_dimensions[left_letter].width = 6.0
    for j in range(ncols):
        letter = get_column_letter(start_col + j)
        if column_widths and letter in column_widths:
            ws.column_dimensions[letter].width = float(column_widths[letter])
        elif column_widths and str(j) in column_widths:
            ws.column_dimensions[letter].width = float(column_widths[str(j)])
        else:
            ws.column_dimensions[letter].width = _auto_col_width(header, rows, j)

    freeze_ref = None
    if freeze_panes:
        freeze_ref = f"{get_column_letter(start_col)}{start_row + 1}"
        ws.freeze_panes = ws[freeze_ref]
    ws.sheet_view.showGridLines = bool(show_gridlines)
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = 9
    try:
        ws.oddHeader.center.text = name
        ws.oddFooter.center.text = "第 &P 页，共 &N 页"
    except Exception:
        pass
    _reset_sheet_view(ws, freeze_cell=freeze_ref)


def _resolve_header(sheet: dict) -> list[str]:
    stype = (sheet.get("type") or "matrix").strip().lower()
    header = sheet.get("header")
    if header and isinstance(header, list) and header:
        return [str(h) for h in header]
    if stype in PRESET_HEADERS:
        return list(PRESET_HEADERS[stype])
    raise ValueError(f"工作表「{sheet.get('name')}」缺少 header，且 type={stype!r} 无预设")


def _sanitize_sheet_name(name: str, existing: list[str], used: set[str]) -> str:
    raw = (name or "").strip() or "数据表"
    # Excel illegal chars
    cleaned = re.sub(r"[\\/*?:\[\]]", "_", raw)[:31]
    if cleaned in used or cleaned in existing:
        # keep order but avoid collision
        base = cleaned[:28]
        k = 2
        while f"{base}_{k}" in used or f"{base}_{k}" in existing:
            k += 1
        cleaned = f"{base}_{k}"
    return cleaned


def _ensure_sheet(wb, preferred: str, index: int) -> Worksheet:
    """Get/rename/create worksheet at a stable position after 关于."""
    if preferred in wb.sheetnames:
        ws = wb[preferred]
        return ws
    # try rename sheet1..sheet4 in order
    for cand in (f"sheet{index}", f"Sheet{index}", f"工作表{index}"):
        if cand in wb.sheetnames:
            wb[cand].title = preferred
            return wb[preferred]
    # create new
    # position after 关于
    pos = wb.sheetnames.index(ABOUT_SHEET) + 1 if ABOUT_SHEET in wb.sheetnames else len(wb.sheetnames)
    ws = wb.create_sheet(title=preferred, index=pos)
    return ws


def remove_extra_sheets(wb, keep: list[str]) -> None:
    for name in list(wb.sheetnames):
        if name in (VC_SHEET, ABOUT_SHEET):
            continue
        if name not in keep:
            wb.remove(wb[name])


def generate(meta: dict, content: dict, out_dir: Path, base_name: str | None = None) -> Path:
    if not BASE_TEMPLATE.is_file():
        raise FileNotFoundError(f"缺少基础模板: {BASE_TEMPLATE}")

    meta = {**(content.get("meta") or {}), **meta}
    sheets_spec: list[dict] = content.get("sheets") or []
    if not sheets_spec:
        # default four empty-ish data sheets names
        sheets_spec = [
            {"name": "sheet1", "type": "matrix", "header": ["列1", "列2", "列3", "列4", "列5"], "rows": []},
            {"name": "sheet2", "type": "matrix", "header": ["列1", "列2", "列3", "列4", "列5"], "rows": []},
            {"name": "sheet3", "type": "matrix", "header": ["列1", "列2", "列3", "列4", "列5"], "rows": []},
            {"name": "sheet4", "type": "matrix", "header": ["列1", "列2", "列3", "列4", "列5"], "rows": []},
        ]

    wb = load_workbook(BASE_TEMPLATE)

    # 1) version control + about (about index after sheets resolved)
    fill_version_control(wb, meta)

    # 2) data sheets
    final_names: list[str] = []
    used: set[str] = set()
    for idx, spec in enumerate(sheets_spec, start=1):
        header = _resolve_header(spec)
        rows = spec.get("rows") or []
        desired = spec.get("name") or f"数据表{idx}"
        name = _sanitize_sheet_name(desired, [], used)
        used.add(name)
        ws = _ensure_sheet(wb, name, idx)
        build_data_sheet(
            ws,
            name=name,
            header=header,
            rows=rows,
            start_cell=spec.get("start_cell") or "B2",
            column_widths=spec.get("column_widths"),
            freeze_panes=bool(spec.get("freeze_panes", True)),
            show_gridlines=bool(spec.get("show_gridlines", False)),
        )
        final_names.append(name)

    if not content.get("keep_empty_sheets", False):
        remove_extra_sheets(wb, final_names)

    # 3) about index uses actual sheet names
    fill_about(wb, meta, wb.sheetnames)

    # 4) VC sheet page setup
    if VC_SHEET in wb.sheetnames:
        wb[VC_SHEET].page_setup.orientation = "landscape"
        wb[VC_SHEET].page_setup.paperSize = 9

    # 5) active sheet: first data sheet
    if final_names and final_names[0] in wb.sheetnames:
        wb.active = wb.sheetnames.index(final_names[0])

    title = (meta.get("doc_title") or meta.get("project_name") or "华讯交付表").strip()
    safe = re.sub(r'[\\/:*?"<>|]', "_", title)[:80]
    base = base_name or safe or "huaxun_workbook"
    if not base.lower().endswith(".xlsx"):
        out_path = out_dir / f"{base}.xlsx"
    else:
        out_path = out_dir / base

    out_dir.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    return out_path


# ---------- CLI ----------

def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate Huaxun-format Excel workbook")
    ap.add_argument("--meta", required=True, help="meta.json path")
    ap.add_argument("--content", required=True, help="content.json path")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--name", default=None, help="output base name (without .xlsx)")
    ap.add_argument("--skip-precheck", action="store_true")
    args = ap.parse_args(argv)

    if not args.skip_precheck:
        problems = precheck(verbose=True)
        if problems and any("缺少" in p or "缺失基础模板" in p for p in problems):
            return 2

    meta = _load_json(Path(args.meta))
    content = _load_json(Path(args.content))
    out_dir = Path(args.out)

    try:
        path = generate(meta, content, out_dir, args.name)
    except Exception as exc:
        print(f"[错误] 生成失败: {exc}", file=sys.stderr)
        return 1

    # QA
    try:
        wb = load_workbook(path)
        residual = []
        for sname in wb.sheetnames:
            ws = wb[sname]
            for row in ws.iter_rows(max_row=min(ws.max_row or 1, 200), max_col=min(ws.max_column or 1, 40)):
                for cell in row:
                    v = cell.value
                    if isinstance(v, str) and any(tok in v for tok in ("{{", "TODO", "TBD")):
                        residual.append(f"{sname}!{cell.coordinate}={v[:40]}")
        print("=== 生成完成 ===")
        print(f"  输出: {path}")
        print(f"  工作表: {', '.join(wb.sheetnames)}")
        if residual:
            print(f"  [警告] 发现占位残留: {residual[:10]}")
        else:
            print("  QA: 无 {{/TODO/TBD 残留")
    except Exception as exc:
        print(f"[警告] QA 打开失败: {exc}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
