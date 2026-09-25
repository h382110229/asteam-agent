#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Huaxun delivery Word/PDF generator — fill-in-place on original template branding.

Keeps original cover banner, ECCOM logo, header/footer artwork and company footer.
Only fills metadata, version-control tables, and body chapters; normalizes table alignment.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from lxml import etree

SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS = SKILL_DIR / "assets"
BASE_TEMPLATE = ASSETS / "huaxun_base_template.docx"
DEFAULT_COMPANY = "上海华讯网络系统有限公司"
CUSTOMER_LOGO_MEDIA = ("word/media/image5.png", "word/media/image50.png")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


# ---------- env precheck ----------

def precheck(verbose: bool = True) -> list[str]:
    """Return list of problems; empty list means OK."""
    problems: list[str] = []
    try:
        import docx  # noqa: F401
        from lxml import etree  # noqa: F401
    except Exception as exc:
        problems.append(f"Python 依赖缺失 (python-docx/lxml): {exc}")
        problems.append("修复: 使用 MIMO_PYTHON 或 pip install python-docx lxml Pillow")

    if not BASE_TEMPLATE.is_file():
        problems.append(f"缺少基础模板: {BASE_TEMPLATE}")
        problems.append("修复: 从华讯 .docm 重新生成 assets/huaxun_base_template.docx")

    has_word = False
    if os.name == "nt":
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "try { $w=New-Object -ComObject Word.Application; $w.Quit(); 'YES' } catch { 'NO' }"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        has_word = (r.stdout or "").strip().endswith("YES")
    soffice = os.environ.get("MIMO_SOFFICE")
    soffice_ok = bool(soffice and Path(soffice).is_file())
    # Word COM 与 LibreOffice 仅作为 PDF 导出可选依赖，不阻断 Word 文档本身生成
    if not has_word and not soffice_ok and verbose:
        print("  [提示] 宿主机未检测到 Word COM 或 LibreOffice。文档将正常生成为 Word (.docx)；如需转 PDF，可通过 ASTeam Agent 内置打印引擎输出。")

    if verbose:
        print("=== 环境预检 ===")
        print(f"  MIMO_PYTHON: {os.environ.get('MIMO_PYTHON', '(未设置，用系统 python)')}")
        print(f"  python-docx: OK")
        print(f"  Word COM: {'OK' if has_word else '不可用'}")
        print(f"  LibreOffice: {'OK' if soffice_ok else '不可用'}")
        print(f"  基础模板: {'OK' if BASE_TEMPLATE.is_file() else '缺失'}")
        for p in problems:
            print("  [问题]", p)
        if not problems:
            print("  结果: 通过")
    return problems


# ---------- helpers ----------

def _set_run_font(run, name="等线", size_pt=10.5, bold=None):
    run.font.name = name
    run.font.size = Pt(size_pt)
    if bold is not None:
        run.bold = bold
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), name)
    rFonts.set(qn("w:hAnsi"), name)
    rFonts.set(qn("w:eastAsia"), name)


def _set_cell_vcenter(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    vAlign = tcPr.find(qn("w:vAlign"))
    if vAlign is None:
        vAlign = OxmlElement("w:vAlign")
        tcPr.append(vAlign)
    vAlign.set(qn("w:val"), "center")


def _set_cell_margins(cell, top=40, start=60, bottom=40, end=60):
    """Tight cell padding — avoid large leading blank space inside boxes."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = tcPr.find(qn("w:tcMar"))
    if tcMar is None:
        tcMar = OxmlElement("w:tcMar")
        tcPr.append(tcMar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tcMar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tcMar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def _clear_cell_indent(paragraph):
    """Remove first-line / left indent inherited from Normal style inside table cells."""
    pf = paragraph.paragraph_format
    pf.first_line_indent = Pt(0)
    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is not None:
        ind.set(qn("w:firstLine"), "0")
        ind.set(qn("w:firstLineChars"), "0")
        ind.set(qn("w:left"), "0")
        ind.set(qn("w:leftChars"), "0")


def _text_width_units(text: str) -> int:
    """Rough display width: CJK/full-width=2, else=1."""
    w = 0
    for ch in str(text or ""):
        o = ord(ch)
        if o >= 0x1100 and o != 0x2015:
            w += 2
        else:
            w += 1
    return w


def _auto_col_widths(header: list[str] | None, rows: list[list], total_dxa: int = 9000) -> list[int]:
    """Distribute column widths by content length (with min/max clamps)."""
    cols = len(header) if header else (len(rows[0]) if rows else 1)
    if cols <= 0:
        return [total_dxa]
    widths = [0] * cols
    if header:
        for j, h in enumerate(header[:cols]):
            widths[j] = max(widths[j], _text_width_units(h) + 2)
    for row in rows:
        for j in range(cols):
            val = row[j] if j < len(row) else ""
            widths[j] = max(widths[j], _text_width_units(val))

    # short field columns get a compact floor
    short_floor = 6
    if header:
        for j, h in enumerate(header[:cols]):
            if _is_short_col(header, j):
                widths[j] = max(widths[j], short_floor)

    # min 6, soft-max 28 units so long text wraps instead of starving others
    widths = [max(6, min(w, 28)) for w in widths]
    # pad so every col has breathing room
    widths = [w + 2 for w in widths]
    total_u = sum(widths) or 1
    dxa = [max(int(total_dxa * w / total_u), 700) for w in widths]
    # fix rounding drift on last col
    drift = total_dxa - sum(dxa)
    if dxa:
        dxa[-1] = max(700, dxa[-1] + drift)
    return dxa


def _apply_table_layout(table, col_widths: list[int]):
    """Fixed layout + gridCol/tcW so Word honors computed widths."""
    tbl = table._tbl
    tblPr = tbl.tblPr
    # fixed layout
    layout = tblPr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tblPr.append(layout)
    layout.set(qn("w:type"), "fixed")
    # table width
    tblW = tblPr.find(qn("w:tblW"))
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.append(tblW)
    tblW.set(qn("w:w"), str(sum(col_widths)))
    tblW.set(qn("w:type"), "dxa")
    # grid
    grid = tbl.find(qn("w:tblGrid"))
    if grid is None:
        grid = OxmlElement("w:tblGrid")
        tbl.insert(1, grid)
    for child in list(grid):
        grid.remove(child)
    for w in col_widths:
        gc = OxmlElement("w:gridCol")
        gc.set(qn("w:w"), str(w))
        grid.append(gc)
    # each cell width
    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            if idx >= len(col_widths):
                break
            tcPr = cell._tc.get_or_add_tcPr()
            tcW = tcPr.find(qn("w:tcW"))
            if tcW is None:
                tcW = OxmlElement("w:tcW")
                tcPr.insert(0, tcW)
            tcW.set(qn("w:w"), str(col_widths[idx]))
            tcW.set(qn("w:type"), "dxa")


def normalize_table_alignment(table, header: list[str] | None = None, has_header_row: bool = True):
    """Huaxun rule: header center+bold; data left (short cols center); all vcenter."""
    try:
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
    except Exception:
        pass
    for r_idx, row in enumerate(table.rows):
        for c_idx, cell in enumerate(row.cells):
            _set_cell_vcenter(cell)
            _set_cell_margins(cell)
            is_header = has_header_row and r_idx == 0
            for p in cell.paragraphs:
                _clear_cell_indent(p)
                pf = p.paragraph_format
                pf.space_before = Pt(0)
                pf.space_after = Pt(0)
                pf.line_spacing = 1.15
                if is_header:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                elif _is_short_col(header, c_idx):
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                else:
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for run in p.runs:
                    _set_run_font(run, size_pt=10.5, bold=True if is_header else None)
            if is_header:
                _shade_cell(cell, "E7EEF7")


def _shade_cell(cell, fill="E7EEF7"):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = tcPr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tcPr.append(shd)
    shd.set(qn("w:fill"), fill)
    shd.set(qn("w:val"), "clear")


def _is_short_col(header: list[str] | None, col_idx: int) -> bool:
    if not header or col_idx >= len(header):
        return False
    name = header[col_idx].strip()
    short_keys = {
        "序号", "版本", "日期", "更新日期", "更新人", "作者", "审核人",
        "编号", "属性", "类别", "类型", "状态", "优先级", "角色", "姓名",
    }
    long_value_keys = {"内容", "名称", "描述", "说明", "备注", "取值", "主要更新内容", "配置内容"}
    if name in long_value_keys:
        return False
    return name in short_keys or len(name) <= 2


def _para_set_text(paragraph, text: str):
    # keep paragraph properties (position/format), replace runs
    for r in list(paragraph._p.findall(qn("w:r"))):
        paragraph._p.remove(r)
    run = paragraph.add_run(text)
    return run


def _find_body_child_by_text(body, needle: str, start: int = 0):
    children = list(body)
    for i, ch in enumerate(children):
        if i < start:
            continue
        if ch.tag == qn("w:p"):
            texts = "".join(t.text or "" for t in ch.findall(f".//{W}t"))
            if needle in texts:
                return i, ch
    return None, None


def enable_update_fields(doc):
    """Disable auto field-update on open (avoids Word 域引用弹窗)."""
    settings = doc.settings.element
    update = settings.find(qn("w:updateFields"))
    if update is not None:
        settings.remove(update)


def _collect_toc_lines(sections: list[dict]) -> list[tuple[int, str]]:
    """Return [(level, text)] for static TOC from numbered sections + nested heads."""
    lines: list[tuple[int, str]] = []
    for sec in sections:
        level = int(sec.get("level", 1))
        lines.append((level, sec.get("numbered_heading", sec.get("heading", ""))))
        for block in sec.get("blocks", []):
            if block.get("type") in ("h2", "h3", "h4"):
                nested = {"h2": 2, "h3": 3, "h4": 4}[block["type"]]
                lines.append((min(max(nested, level + 1), 4), block.get("text", "")))
    return lines


_bookmark_id = [1000]


def add_bookmark(paragraph, name: str) -> str:
    """Wrap paragraph content with a Word bookmark (for TOC hyperlinks)."""
    _bookmark_id[0] += 1
    bid = str(_bookmark_id[0])
    start = OxmlElement("w:bookmarkStart")
    start.set(qn("w:id"), bid)
    start.set(qn("w:name"), name)
    end = OxmlElement("w:bookmarkEnd")
    end.set(qn("w:id"), bid)
    p = paragraph._p
    # insert after pPr
    pPr = p.find(qn("w:pPr"))
    if pPr is not None:
        pPr.addnext(start)
    else:
        p.insert(0, start)
    p.append(end)
    return name


def _slug(text: str, idx: int) -> str:
    safe = re.sub(r"[^0-9A-Za-z一-鿿]+", "_", text)[:40].strip("_")
    return f"bm_{idx}_{safe or 'h'}"


def _assign_bookmarks(sections: list[dict]) -> list[dict]:
    """Deterministic bookmark names shared by body headings and TOC links."""
    idx = 0
    for sec in sections:
        idx += 1
        title = sec.get("numbered_heading") or sec.get("heading") or ""
        sec["_bm"] = _slug(title, idx)
        for block in sec.get("blocks", []):
            if block.get("type") in ("h2", "h3", "h4"):
                idx += 1
                block["_bm"] = _slug(block.get("text", ""), idx)
    return sections


def rebuild_static_toc(doc, sections: list[dict]):
    """Replace demo TOC with template-style entries + clickable hyperlinks."""
    lines: list[tuple[int, str, str]] = []
    for sec in sections:
        level = int(sec.get("level", 1))
        title = sec.get("numbered_heading", sec.get("heading", ""))
        lines.append((level, title, sec.get("_bm") or _slug(title, len(lines) + 1)))
        for block in sec.get("blocks", []):
            if block.get("type") in ("h2", "h3", "h4"):
                nested = {"h2": 2, "h3": 3, "h4": 4}[block["type"]]
                t = block.get("text", "")
                lines.append((min(max(nested, level + 1), 4), t, block.get("_bm") or _slug(t, len(lines) + 1)))
    if not lines:
        return

    toc_paras = []
    for p in doc.paragraphs:
        name = p.style.name if p.style else ""
        if name.startswith("toc "):
            toc_paras.append(p)
        elif toc_paras:
            break

    anchor = None
    for p in doc.paragraphs:
        if p.text.strip() == "目录":
            anchor = p._p
            break
    if anchor is None and toc_paras:
        anchor = toc_paras[0]._p.getprevious()
    if anchor is None:
        return

    for p in toc_paras:
        parent = p._p.getparent()
        if parent is not None:
            parent.remove(p._p)

    style_ids = {1: "12", 2: "20", 3: "30", 4: "40"}
    cur = anchor
    for level, text, bm in lines:
        sid = style_ids.get(min(level, 4), "12")
        p = OxmlElement("w:p")
        pPr = OxmlElement("w:pPr")
        pStyle = OxmlElement("w:pStyle")
        pStyle.set(qn("w:val"), sid)
        pPr.append(pStyle)
        # right tab + dotted leader for page number (template TOC look)
        tabs = OxmlElement("w:tabs")
        tab = OxmlElement("w:tab")
        tab.set(qn("w:val"), "right")
        tab.set(qn("w:leader"), "dot")
        tab.set(qn("w:pos"), "9072")  # ~16cm from left margin
        tabs.append(tab)
        pPr.append(tabs)
        # spacing only for level1 like toc 1 (120/120); others inherit style
        if level == 1:
            spacing = OxmlElement("w:spacing")
            spacing.set(qn("w:before"), "120")
            spacing.set(qn("w:after"), "120")
            pPr.append(spacing)
        p.append(pPr)

        # hyperlink title (no color override — keep template ink)
        hyperlink = OxmlElement("w:hyperlink")
        hyperlink.set(qn("w:anchor"), bm)
        hyperlink.set(qn("w:history"), "1")
        r = OxmlElement("w:r")
        rPr = OxmlElement("w:rPr")
        u = OxmlElement("w:u")
        u.set(qn("w:val"), "none")
        rPr.append(u)
        r.append(rPr)
        t = OxmlElement("w:t")
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = text
        r.append(t)
        hyperlink.append(r)
        p.append(hyperlink)

        # tab
        rtab = OxmlElement("w:r")
        tab_el = OxmlElement("w:tab")
        rtab.append(tab_el)
        p.append(rtab)

        # empty page number (fields would need bookmarks+update); leave blank slot
        rpn = OxmlElement("w:r")
        rpn_t = OxmlElement("w:t")
        rpn_t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        rpn_t.text = ""
        rpn.append(rpn_t)
        p.append(rpn)

        cur.addnext(p)
        cur = p


def _set_row_cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    if trPr.find(qn("w:cantSplit")) is None:
        trPr.append(OxmlElement("w:cantSplit"))


def _set_table_keep_together(table):
    """Prevent mid-row page breaks; keep rows intact."""
    for row in table.rows:
        _set_row_cant_split(row)


def _keep_next(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    if pPr.find(qn("w:keepNext")) is None:
        pPr.append(OxmlElement("w:keepNext"))
    if pPr.find(qn("w:keepLines")) is None:
        pPr.append(OxmlElement("w:keepLines"))


def fill_cover(doc, meta: dict):
    """Fill cover title/version/date only (原模板首页仅这三项正文信息)."""
    title = meta.get("doc_title", "文档标题")
    version = meta.get("doc_version", "V1.0")
    date = meta.get("doc_date", "")

    for p in doc.paragraphs:
        if "<文档标题>" in p.text:
            r = _para_set_text(p, title)
            # 原模板：黑体 18pt，不加粗，居中
            _set_run_font(r, name="黑体", size_pt=18, bold=False)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            break

    for p in doc.paragraphs:
        t = p.text.strip()
        if t.startswith("版本:") or t.startswith("版本："):
            r = _para_set_text(p, f"版本:{version}")
            _set_run_font(r, name="黑体", size_pt=14, bold=False)
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        elif t.startswith("日期:") or t.startswith("日期："):
            r = _para_set_text(p, f"日期:{date}")
            _set_run_font(r, name="黑体", size_pt=14, bold=False)
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT


def _fill_cell_text(cell, text: str, bold=False, size_pt=10.5, align=None):
    """Write text into first paragraph only; clear extra paragraphs (merge leftovers)."""
    paras = list(cell.paragraphs)
    if not paras:
        p = cell.add_paragraph()
        paras = [p]
    # remove extra paragraphs (keep one)
    for p in paras[1:]:
        p._p.getparent().remove(p._p)
    p = paras[0]
    for r in list(p._p.findall(qn("w:r"))):
        p._p.remove(r)
    _clear_cell_indent(p)
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run(text)
    _set_run_font(run, name="等线", size_pt=size_pt, bold=bold)


def fill_version_control(doc, meta: dict):
    """Fill 文档属性 + 文档变更过程 tables (first two tables).

    Keep original column widths/shading; do NOT add cell margins (causes date wrap).
    """
    if len(doc.tables) < 2:
        return
    props = {
        "项目名称": meta.get("project_name", ""),
        "文档标题": meta.get("doc_title", ""),
        "文档版本号": meta.get("doc_version", ""),
        "版本日期": meta.get("doc_date", ""),
        "作者": meta.get("author", ""),
        "审核人": meta.get("reviewer", ""),
    }
    t0 = doc.tables[0]
    for row in t0.rows:
        cells = row.cells
        if len(cells) < 2:
            continue
        key = cells[0].text.strip()
        if key in props:
            # 属性列居中、内容列左对齐，垂直居中；不改列宽不加边距
            _set_cell_vcenter(cells[0])
            _set_cell_vcenter(cells[1])
            _fill_cell_text(cells[0], key, bold=False, align=WD_ALIGN_PARAGRAPH.CENTER)
            _fill_cell_text(cells[1], props[key], bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
        elif key == "属性":
            _set_cell_vcenter(cells[0])
            _set_cell_vcenter(cells[1])
            _fill_cell_text(cells[0], key, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
            _fill_cell_text(cells[1], "内容", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)

    t1 = doc.tables[1]
    headers = ["版本", "更新日期", "更新人", "主要更新内容"]
    if t1.rows:
        for j, h in enumerate(headers):
            if j < len(t1.rows[0].cells):
                cell = t1.rows[0].cells[j]
                _set_cell_vcenter(cell)
                _fill_cell_text(cell, h, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    if len(t1.rows) >= 2:
        values = [
            meta.get("doc_version", ""),
            meta.get("doc_date", ""),
            meta.get("author", ""),
            "初稿",
        ]
        aligns = [
            WD_ALIGN_PARAGRAPH.CENTER,
            WD_ALIGN_PARAGRAPH.CENTER,  # 日期列居中且不换行
            WD_ALIGN_PARAGRAPH.CENTER,
            WD_ALIGN_PARAGRAPH.LEFT,
        ]
        for j, val in enumerate(values):
            if j < len(t1.rows[1].cells):
                cell = t1.rows[1].cells[j]
                _set_cell_vcenter(cell)
                _fill_cell_text(cell, val, bold=False, align=aligns[j])
                # 禁止日期列换行
                for p in cell.paragraphs:
                    pPr = p._p.get_or_add_pPr()
                    if pPr.find(qn("w:noWrap")) is None:
                        # noWrap is a tc property
                        pass
        # tc-level noWrap for date column
        tc = t1.rows[1].cells[1]._tc
        tcPr = tc.get_or_add_tcPr()
        if tcPr.find(qn("w:noWrap")) is None:
            nw = OxmlElement("w:noWrap")
            tcPr.append(nw)

    # 略微加宽「更新日期」列，避免 2026-02-14 换行
    try:
        grid = t1._tbl.find(qn("w:tblGrid"))
        if grid is not None:
            cols = grid.findall(qn("w:gridCol"))
            if len(cols) >= 4:
                # original 900/1399/933/6093 → widen date col
                cols[0].set(qn("w:w"), "900")
                cols[1].set(qn("w:w"), "1700")
                cols[2].set(qn("w:w"), "1200")
                cols[3].set(qn("w:w"), "5525")
    except Exception:
        pass


def replace_body_content(doc, content: dict):
    """Delete demo body (after version-control tables) and insert real chapters."""
    body = doc.element.body
    children = list(body)

    # Find last version-control table: table whose first header is 版本 (文档变更过程)
    vc_end_idx = None
    for i, ch in enumerate(children):
        if ch.tag != qn("w:tbl"):
            continue
        first_cells = ch.findall(f".//{W}tc")
        if not first_cells:
            continue
        first_text = "".join(t.text or "" for t in first_cells[0].findall(f".//{W}t")).strip()
        if first_text == "版本":
            vc_end_idx = i
    if vc_end_idx is None:
        # fallback: after 版本控制信息
        for i, ch in enumerate(children):
            if ch.tag == qn("w:p"):
                texts = "".join(t.text or "" for t in ch.findall(f".//{W}t"))
                if "文档变更过程" in texts:
                    # next tbl after this
                    for j in range(i, len(children)):
                        if children[j].tag == qn("w:tbl"):
                            vc_end_idx = j
                            break
            if vc_end_idx is not None:
                break
    if vc_end_idx is None:
        print("WARN: cannot locate version-control end; skip body replace", file=sys.stderr)
        return

    # Remove everything after vc table except final sectPr
    sectPr = body.find(qn("w:sectPr"))
    for ch in children[vc_end_idx + 1 :]:
        if ch is sectPr:
            continue
        if ch.tag == qn("w:sectPr"):
            continue
        body.remove(ch)

    # Insert new content before sectPr
    sections = number_headings(content.get("sections", []))
    sections = _assign_bookmarks(sections)
    table_seq = [0]
    state: dict = {}
    # page break so body starts on a fresh page after version control
    if sections:
        br = doc.add_paragraph()
        br.add_run().add_break(WD_BREAK.PAGE)
    for sec in sections:
        add_section(doc, sec, table_seq, bookmark=sec.get("_bm"), state=state)
    return sections


def number_headings(sections: list[dict]) -> list[dict]:
    counters = [0, 0, 0, 0]
    numbered = []
    for sec in sections:
        level = min(max(int(sec.get("level", 1)), 1), 4)
        counters[level - 1] += 1
        for i in range(level, 4):
            counters[i] = 0
        label = f"第{counters[0]}章" if level == 1 else ".".join(str(counters[i]) for i in range(level))
        new_blocks = []
        for block in sec.get("blocks", []):
            btype = block.get("type")
            if btype in ("h2", "h3", "h4"):
                nested_level = {"h2": 2, "h3": 3, "h4": 4}[btype]
                if nested_level <= level:
                    nested_level = level + 1
                    btype = {2: "h2", 3: "h3", 4: "h4"}.get(nested_level, "h4")
                counters[nested_level - 1] += 1
                for i in range(nested_level, 4):
                    counters[i] = 0
                nested_label = ".".join(str(counters[i]) for i in range(nested_level))
                text = block.get("text", "")
                block = {**block, "type": btype, "text": f"{nested_label} {text}".strip()}
            new_blocks.append(block)
        numbered.append(
            {
                **sec,
                "level": level,
                "blocks": new_blocks,
                "numbered_heading": f"{label} {sec.get('heading', '')}".strip(),
            }
        )
    return numbered


def _disable_para_numbering(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    numPr = pPr.find(qn("w:numPr"))
    if numPr is None:
        numPr = OxmlElement("w:numPr")
        pPr.insert(0, numPr)
    for child in list(numPr):
        numPr.remove(child)
    numId = OxmlElement("w:numId")
    numId.set(qn("w:val"), "0")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    numPr.append(ilvl)
    numPr.append(numId)


def add_note_table(doc, kind: str, text: str):
    """Single-row note/advice/warning block (no empty spacer row)."""
    table = doc.add_table(rows=1, cols=2)
    try:
        table.style = "Table Grid"
    except Exception:
        pass
    # label ~18%, content ~82%
    _apply_table_layout(table, [1600, 7400])
    _fill_cell_text(table.cell(0, 0), kind, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    _fill_cell_text(table.cell(0, 1), text, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
    for cell in table.rows[0].cells:
        _set_cell_vcenter(cell)
        _set_cell_margins(cell)
        for p in cell.paragraphs:
            _clear_cell_indent(p)
    _set_table_keep_together(table)


def add_signature(doc):
    doc.add_paragraph()
    for line in (
        "报价人名称：（盖章）____________________",
        "授权代表：（签字）____________________",
        "日期：______年____月____日",
    ):
        p = doc.add_paragraph()
        r = p.add_run(line)
        _set_run_font(r, name="宋体", size_pt=12)


def _merge_note_row_into_table(table, kind: str, text: str):
    """Append note as last row of an existing table (no separate table → no 割裂)."""
    cols = len(table.columns) if hasattr(table, "columns") and table.columns else 0
    if cols <= 0:
        # fallback from first row
        cols = len(table.rows[0].cells) if table.rows else 2
    row = table.add_row()
    cells = row.cells
    if cols == 1:
        _fill_cell_text(cells[0], f"{kind}：{text}", bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
        _set_cell_vcenter(cells[0])
        _set_cell_margins(cells[0])
    elif cols == 2:
        _fill_cell_text(cells[0], kind, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        _fill_cell_text(cells[1], text, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
        for c in cells:
            _set_cell_vcenter(c)
            _set_cell_margins(c)
    else:
        # label in col0, content merged across remaining columns
        _fill_cell_text(cells[0], kind, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        for i in range(1, cols):
            _fill_cell_text(cells[i], "", bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
        try:
            merged = cells[1]
            for i in range(2, cols):
                merged = merged.merge(cells[i])
            _fill_cell_text(merged, text, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
            _set_cell_vcenter(merged)
            _set_cell_margins(merged)
        except Exception:
            _fill_cell_text(cells[1], text, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT)
        _set_cell_vcenter(cells[0])
        _set_cell_margins(cells[0])
    _set_row_cant_split(row)


def add_block(doc, block: dict, table_seq: list[int], state: dict | None = None):
    """Render one content block. `state` carries last_table for note-merge."""
    if state is None:
        state = {}
    btype = block.get("type", "para")

    if btype == "para":
        p = doc.add_paragraph(style="Normal")
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        r = p.add_run(block.get("text", ""))
        _set_run_font(r, name="等线", size_pt=12)
        p.paragraph_format.first_line_indent = Pt(24)
        state.pop("last_table", None)
    elif btype in ("h2", "h3", "h4"):
        style = {"h2": "Heading 2", "h3": "Heading 3", "h4": "Heading 4"}[btype]
        p = doc.add_paragraph(block.get("text", ""), style=style)
        _disable_para_numbering(p)
        if block.get("_bm"):
            add_bookmark(p, block["_bm"])
        state.pop("last_table", None)
    elif btype == "bullets":
        style = "List Paragraph" if "List Paragraph" in {s.name for s in doc.styles} else "Normal"
        for item in block.get("items", []):
            text = item if style != "Normal" else f"• {item}"
            p = doc.add_paragraph(style=style)
            r = p.add_run(text)
            _set_run_font(r, name="等线", size_pt=12)
        state.pop("last_table", None)
    elif btype == "numbers":
        style = "List Paragraph" if "List Paragraph" in {s.name for s in doc.styles} else "Normal"
        for idx, item in enumerate(block.get("items", []), start=1):
            p = doc.add_paragraph(style=style)
            r = p.add_run(f"{idx}. {item}")
            _set_run_font(r, name="等线", size_pt=12)
        state.pop("last_table", None)
    elif btype == "table":
        caption = block.get("caption") or f"表{table_seq[0] + 1}"
        if not block.get("caption"):
            table_seq[0] += 1
        else:
            m = re.match(r"表\s*(\d+)", caption)
            if m:
                table_seq[0] = max(table_seq[0], int(m.group(1)))
        header = block.get("header") or []
        rows = block.get("rows") or []
        total_rows = 1 + len(rows)
        # 预留：若后跟 note，实际还会 +1 行
        will_note = bool(block.get("note") or block.get("notes"))
        if block.get("page_break") or (total_rows + (1 if will_note else 0)) >= 5:
            br = doc.add_paragraph()
            br.add_run().add_break(WD_BREAK.PAGE)
        cp = doc.add_paragraph()
        cr = cp.add_run(caption)
        _set_run_font(cr, name="等线", size_pt=10.5)
        _keep_next(cp)
        cols = len(header) if header else (len(rows[0]) if rows else 1)
        table = doc.add_table(rows=1 + len(rows), cols=cols)
        try:
            table.style = "Table Grid"
        except Exception:
            pass
        if header:
            for j, h in enumerate(header):
                cell = table.cell(0, j)
                cell.text = ""
                run = cell.paragraphs[0].add_run(str(h))
                _set_run_font(run, size_pt=10.5, bold=True)
        for i, row in enumerate(rows, start=1):
            for j in range(cols):
                val = row[j] if j < len(row) else ""
                cell = table.cell(i, j)
                cell.text = ""
                run = cell.paragraphs[0].add_run("" if val is None else str(val))
                _set_run_font(run, size_pt=10.5)
        widths = _auto_col_widths(header if header else None, rows, total_dxa=9000)
        _apply_table_layout(table, widths)
        normalize_table_alignment(table, header=header, has_header_row=bool(header))
        _set_table_keep_together(table)
        # inline note(s) declared on the table block
        for n in block.get("notes") or ([] if not block.get("note") else [block["note"]]):
            if isinstance(n, dict):
                _merge_note_row_into_table(table, n.get("kind", "注释"), n.get("text", ""))
            else:
                _merge_note_row_into_table(table, "注释", str(n))
        state["last_table"] = table
    elif btype == "note":
        kind = block.get("kind", "注释")
        text = block.get("text", "")
        last = state.get("last_table")
        if last is not None and block.get("merge", True):
            # 默认并入上一张表，避免两张表割裂
            _merge_note_row_into_table(last, kind, text)
        else:
            add_note_table(doc, kind, text)
            # standalone note is not a merge target
            state.pop("last_table", None)
    elif btype == "config":
        table = doc.add_table(rows=1, cols=1)
        try:
            table.style = "Table Grid"
        except Exception:
            pass
        cell = table.cell(0, 0)
        cell.text = ""
        run = cell.paragraphs[0].add_run(block.get("text", "将配置内容粘贴至此处"))
        _set_run_font(run, size_pt=10.5)
        _set_cell_vcenter(cell)
        _set_cell_margins(cell)
        _clear_cell_indent(cell.paragraphs[0])
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
        _set_table_keep_together(table)
        state["last_table"] = table
    elif btype == "signature":
        add_signature(doc)
    elif btype == "image":
        path = block.get("path")
        if path and Path(path).is_file():
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run()
            run.add_picture(str(path), width=Cm(float(block.get("width_cm", 14))))
            if block.get("caption"):
                cap = doc.add_paragraph()
                cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                cr = cap.add_run(block["caption"])
                _set_run_font(cr, name="等线", size_pt=9)
    elif btype == "page_break":
        br = doc.add_paragraph()
        br.add_run().add_break(WD_BREAK.PAGE)


def add_section(doc, sec: dict, table_seq: list[int], bookmark: str | None = None, state: dict | None = None):
    style = f"Heading {min(sec['level'], 4)}"
    p = doc.add_paragraph(sec["numbered_heading"], style=style)
    _disable_para_numbering(p)
    if bookmark:
        add_bookmark(p, bookmark)
    if state is None:
        state = {}
    state.pop("last_table", None)  # new chapter → don't merge into previous chapter table
    for block in sec.get("blocks", []):
        add_block(doc, block, table_seq, state)


def apply_customer_logo(docx_path: Path, logo_path: Path):
    """Replace placeholder customer-logo media (image5/50) in the package."""
    if not logo_path.is_file():
        return
    try:
        from PIL import Image
    except Exception:
        print("WARN: Pillow missing; skip customer logo replace", file=sys.stderr)
        return
    img = Image.open(logo_path).convert("RGBA")
    # keep reasonable header size (~2.5cm wide @ 96dpi ~ 240px); scale if huge
    max_w = 480
    if img.width > max_w:
        ratio = max_w / img.width
        img = img.resize((max_w, max(1, int(img.height * ratio))), Image.Resampling.LANCZOS)
    buf = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    img.save(buf.name, "PNG")
    buf.close()
    data = Path(buf.name).read_bytes()
    Path(buf.name).unlink(missing_ok=True)

    tmp = docx_path.with_suffix(".logo.docx")
    with zipfile.ZipFile(docx_path, "r") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            raw = zin.read(item.filename)
            if item.filename in CUSTOMER_LOGO_MEDIA:
                raw = data
            zout.writestr(item, raw)
    tmp.replace(docx_path)


def replace_footer_title_in_package(docx_path: Path, title: str):
    """Replace <文档标题> placeholder in footers (may be split across runs)."""
    tmp = docx_path.with_suffix(".footer.docx")
    with zipfile.ZipFile(docx_path, "r") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            base = item.filename.split("/")[-1]
            if re.match(r"footer\d+\.xml$", base):
                root = etree.fromstring(data)
                ts = list(root.iter(f"{W}t"))
                for i, t in enumerate(ts):
                    if not t.text:
                        continue
                    if t.text == "<" and i + 1 < len(ts) and ts[i + 1].text and "文档标题" in ts[i + 1].text:
                        t.text = ""
                        nxt = ts[i + 1].text.replace("文档标题>", title).replace("文档标题", title)
                        ts[i + 1].text = nxt
                    elif t.text == "<文档标题>":
                        t.text = title
                    elif "文档标题" in t.text and t.text.strip() in {"文档标题>", "文档标题"}:
                        t.text = t.text.replace("文档标题>", title).replace("文档标题", title)
                    elif t.text == "<文档标题":
                        t.text = ""
                data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
            zout.writestr(item, data)
    tmp.replace(docx_path)


def remove_unknown_docproperty_fields(docx_path: Path):
    """Strip DOCPROPERTY fields that Word renders as 错误!未知的文档属性名称."""
    tmp = docx_path.with_suffix(".fields.docx")
    with zipfile.ZipFile(docx_path, "r") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/document.xml":
                root = etree.fromstring(data)
                # find instrText containing DOCPROPERTY and remove the containing field runs
                to_remove = []
                for instr in root.iter(f"{W}instrText"):
                    if "DOCPROPERTY" in (instr.text or ""):
                        # walk up to w:r and mark for removal
                        r = instr.getparent()
                        while r is not None and r.tag != f"{W}r":
                            r = r.getparent()
                        if r is not None:
                            to_remove.append(r)
                        # also remove nearby fldChar begin/end siblings in same paragraph
                        if r is not None:
                            p = r.getparent()
                            if p is not None:
                                for child in list(p):
                                    if child.tag == f"{W}r":
                                        texts = "".join(t.text or "" for t in child.iter(f"{W}instrText"))
                                        if "DOCPROPERTY" in texts or "Project ID" in texts:
                                            if child not in to_remove:
                                                to_remove.append(child)
                                        # remove empty fldChar-only runs around it if field result text is error
                for r in to_remove:
                    parent = r.getparent()
                    if parent is not None:
                        parent.remove(r)
                # also remove literal error text runs
                for t in root.iter(f"{W}t"):
                    if t.text and "未知的文档属性" in t.text:
                        r = t.getparent()
                        while r is not None and r.tag != f"{W}r":
                            r = r.getparent()
                        if r is not None and r.getparent() is not None:
                            r.getparent().remove(r)
                data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
            zout.writestr(item, data)
    tmp.replace(docx_path)


def sync_cover_headers_footers(docx_path: Path):
    """Ensure first/even header-footer parts also carry ECCOM logo + company/tagline.

    Cover section references first/even + default. Empty first/even parts would
    hide the logo/tagline when Word treats the first page specially.
    """
    tmp = docx_path.with_suffix(".hf.docx")
    with zipfile.ZipFile(docx_path, "r") as zin:
        names = set(zin.namelist())
        header2 = zin.read("word/header2.xml") if "word/header2.xml" in names else None
        footer2 = zin.read("word/footer2.xml") if "word/footer2.xml" in names else None
        h2_rels = zin.read("word/_rels/header2.xml.rels") if "word/_rels/header2.xml.rels" in names else None
        f2_rels = zin.read("word/_rels/footer2.xml.rels") if "word/_rels/footer2.xml.rels" in names else None

        # map which header/footer files are first/even for cover (sect 0)
        # from earlier analysis: header1=even, header3=first, footer1=even, footer3=first
        clones = {
            "word/header1.xml": header2,
            "word/header3.xml": header2,
            "word/footer1.xml": footer2,
            "word/footer3.xml": footer2,
        }
        rel_clones = {
            "word/_rels/header1.xml.rels": h2_rels,
            "word/_rels/header3.xml.rels": h2_rels,
            "word/_rels/footer1.xml.rels": f2_rels,
            "word/_rels/footer3.xml.rels": f2_rels,
        }

        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename in clones and clones[item.filename] is not None:
                    data = clones[item.filename]
                elif item.filename in rel_clones and rel_clones[item.filename] is not None:
                    data = rel_clones[item.filename]
                elif item.filename == "word/settings.xml":
                    root = etree.fromstring(data)
                    for tag in ("updateFields", "documentProtection", "attachedTemplate"):
                        el = root.find(f"{W}{tag}")
                        if el is not None:
                            root.remove(el)
                    data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                elif item.filename == "word/document.xml":
                    root = etree.fromstring(data)
                    _fuse_note_tables_and_drop_gaps(root)
                    for sect in root.findall(f".//{W}sectPr"):
                        tp = sect.find(f"{W}titlePg")
                        if tp is not None:
                            sect.remove(tp)
                    data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                zout.writestr(item, data)
            # add missing rel files
            for rel_name, payload in rel_clones.items():
                if payload is not None and rel_name not in names:
                    zout.writestr(rel_name, payload)
    tmp.replace(docx_path)


def _fuse_note_tables_and_drop_gaps(root):
    """Safety net: merge standalone 1-row note tables into previous table; drop empty gap paras.

    This is a skill-level layout rule — every generated document gets it, not just demos.
    """
    body = root.find(f"{W}body")
    if body is None:
        return
    children = list(body)
    i = 0
    while i < len(children) - 1:
        cur = children[i]
        nxt = children[i + 1]
        # drop empty paragraphs sandwiched between two tables
        if cur.tag == f"{W}tbl" and nxt.tag == f"{W}p":
            texts = "".join(t.text or "" for t in nxt.findall(f".//{W}t")).strip()
            has_drawing = nxt.find(f".//{W}drawing") is not None or nxt.find(f".//{W}pict") is not None
            if not texts and not has_drawing:
                # look ahead for another table
                j = i + 1
                while j < len(children) and children[j].tag == f"{W}p":
                    t2 = "".join(x.text or "" for x in children[j].findall(f".//{W}t")).strip()
                    d2 = children[j].find(f".//{W}drawing") is not None
                    if t2 or d2:
                        break
                    j += 1
                if j < len(children) and children[j].tag == f"{W}tbl":
                    for k in range(i + 1, j):
                        body.remove(children[k])
                    children = list(body)
                    continue
        # fuse note table into previous data table
        if cur.tag == f"{W}tbl" and nxt.tag == f"{W}tbl":
            rows_a = cur.findall(f"{W}tr")
            rows_b = nxt.findall(f"{W}tr")
            # standalone note: 1 row, 2 cells, first cell short label
            if len(rows_b) == 1 and rows_a:
                cells_b = rows_b[0].findall(f"{W}tc")
                if len(cells_b) == 2:
                    label = "".join(t.text or "" for t in cells_b[0].findall(f".//{W}t")).strip()
                    content = "".join(t.text or "" for t in cells_b[1].findall(f".//{W}t")).strip()
                    if label in {"注释", "建议", "小心", "警告", "说明", "备注"} and content:
                        # append row B to table A
                        cur.append(rows_b[0])
                        body.remove(nxt)
                        children = list(body)
                        # do not advance i; re-evaluate
                        continue
        i += 1


def build_document(meta: dict, content: dict, out_docx: Path):
    if not BASE_TEMPLATE.is_file():
        raise FileNotFoundError(f"base template missing: {BASE_TEMPLATE}")
    doc = Document(str(BASE_TEMPLATE))

    fill_cover(doc, meta)
    fill_version_control(doc, meta)
    sections = replace_body_content(doc, content)
    rebuild_static_toc(doc, sections or [])
    enable_update_fields(doc)  # disable auto-update popup

    out_docx.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_docx))

    replace_footer_title_in_package(out_docx, meta.get("doc_title", ""))
    remove_unknown_docproperty_fields(out_docx)
    sync_cover_headers_footers(out_docx)

    logo = meta.get("customer_logo")
    if logo:
        apply_customer_logo(out_docx, Path(logo))

    return out_docx


def _export_pdf_word_com(docx_path: Path, out_dir: Path) -> Path | None:
    if os.name != "nt":
        return None
    pdf = out_dir / (docx_path.stem + ".pdf")
    if pdf.exists():
        try:
            pdf.unlink()
        except PermissionError:
            print("WARN: PDF locked:", pdf, file=sys.stderr)
            return None

    tmp_dir = Path(tempfile.mkdtemp(prefix="huaxun_pdf_"))
    ascii_docx = tmp_dir / "export_src.docx"
    ascii_pdf = tmp_dir / "export_out.pdf"
    shutil.copy2(docx_path, ascii_docx)
    ps1 = tmp_dir / "export.ps1"
    ps1.write_text(
        f'''
$ErrorActionPreference = "Stop"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {{
  $doc = $word.Documents.Open("{ascii_docx.as_posix()}", $false, $true)
  try {{ }} catch {{}}
  foreach ($toc in $doc.TablesOfContents) {{ try {{ $toc.Update() | Out-Null }} catch {{}} }}
  $doc.ExportAsFixedFormat("{ascii_pdf.as_posix()}", 17)
  $doc.Close($false)
}} finally {{
  $word.Quit()
}}
Write-Output "OK"
''',
        encoding="utf-8",
    )
    r = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if ascii_pdf.is_file() and ascii_pdf.stat().st_size > 0:
        shutil.copy2(ascii_pdf, pdf)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return pdf
    shutil.rmtree(tmp_dir, ignore_errors=True)
    print("WARN: Word COM PDF failed:", (r.stderr or r.stdout or "")[-800:], file=sys.stderr)
    return None


def export_pdf(docx_path: Path, out_dir: Path) -> Path | None:
    pdf = _export_pdf_word_com(docx_path, out_dir)
    if pdf:
        return pdf
    soffice = os.environ.get("MIMO_SOFFICE")
    if not soffice or not Path(soffice).is_file():
        print("WARN: no PDF backend (Word COM / MIMO_SOFFICE)", file=sys.stderr)
        return None
    user_install = out_dir / "lo_profile"
    user_install.mkdir(parents=True, exist_ok=True)
    uri = "file:///" + user_install.as_posix()
    cmd = [
        str(soffice), "--headless", "--norestore",
        f"-env:UserInstallation={uri}",
        "--convert-to", "pdf", "--outdir", str(out_dir), str(docx_path),
    ]
    subprocess.run(cmd, check=False)
    pdf = out_dir / (docx_path.stem + ".pdf")
    return pdf if pdf.is_file() else None


def _safe_name(title: str) -> str:
    bad = '\\/:*?"<>|'
    for ch in bad:
        title = title.replace(ch, "_")
    return title.strip() or "huaxun_doc"


def main():
    ap = argparse.ArgumentParser(description="Generate Huaxun-format Word/PDF")
    ap.add_argument("--meta", required=True)
    ap.add_argument("--content", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default=None)
    ap.add_argument("--pdf", action="store_true")
    ap.add_argument("--skip-precheck", action="store_true")
    args = ap.parse_args()

    if not args.skip_precheck:
        problems = precheck(verbose=True)
        # PDF backend missing is a warning; template missing is fatal
        fatal = [p for p in problems if "基础模板" in p or "Python 依赖" in p]
        if fatal:
            print("环境预检未通过，终止。", file=sys.stderr)
            sys.exit(2)

    meta = json.loads(Path(args.meta).read_text(encoding="utf-8"))
    content = json.loads(Path(args.content).read_text(encoding="utf-8"))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    base = args.name or _safe_name(meta.get("doc_title", "huaxun_doc"))
    out_docx = out_dir / f"{base}.docx"
    build_document(meta, content, out_docx)
    print("DOCX:", out_docx)
    if args.pdf:
        pdf = export_pdf(out_docx, out_dir)
        if pdf:
            print("PDF:", pdf)
        else:
            print("PDF: skipped or failed", file=sys.stderr)


if __name__ == "__main__":
    main()
