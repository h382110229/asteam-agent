#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Environment precheck for huaxun-word-generator skill."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS = SKILL_DIR / "assets"
BASE = ASSETS / "huaxun_base_template.docx"


def main() -> int:
    problems = []

    print("=== huaxun-word-generator 环境预检 ===")
    print(f"Python: {sys.executable}")
    print(f"MIMO_PYTHON: {os.environ.get('MIMO_PYTHON', '(未设置)')}")

    try:
        import docx
        from lxml import etree  # noqa: F401
        print("python-docx / lxml: OK")
    except Exception as exc:
        problems.append(f"缺少 python-docx/lxml: {exc}")
        print("python-docx / lxml: FAIL", exc)

    try:
        from PIL import Image  # noqa: F401
        print("Pillow: OK")
    except Exception:
        print("Pillow: 缺失（客户 logo 缩放将不可用）")
        problems.append("建议安装 Pillow（客户 logo 处理）")

    has_word = False
    if os.name == "nt":
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "try { $w=New-Object -ComObject Word.Application; $w.Quit(); 'YES' } catch { 'NO' }"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        has_word = "YES" in (r.stdout or "")
    print(f"Microsoft Word COM: {'OK' if has_word else '不可用'}")
    if not has_word:
        problems.append("Word COM 不可用（PDF 导出优先依赖 Word）")

    soffice = os.environ.get("MIMO_SOFFICE")
    soffice_ok = bool(soffice and Path(soffice).is_file())
    print(f"MIMO_SOFFICE: {soffice if soffice_ok else '不可用'}")
    if not has_word and not soffice_ok:
        problems.append("无 PDF 后端：请安装 Word，或配置 MIMO_SOFFICE 指向 LibreOffice soffice")

    for name in (
        "huaxun_base_template.docx",
        "logo_eccom_cn.png",
        "cover_banner_city.png",
    ):
        p = ASSETS / name
        ok = p.is_file()
        print(f"asset {name}: {'OK' if ok else '缺失'}")
        if not ok:
            problems.append(f"缺失资产: {p}")

    # fonts hint (Windows)
    fonts_dir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    for font in ("msyh.ttc", "simsun.ttc", "simhei.ttf", "Deng.ttf"):
        # 等线/雅黑/宋体/黑体 common files vary; just hint
        pass
    print("中文字体: 请确认已安装 宋体/黑体/等线（Windows 默认通常具备）")

    print("=== 结果 ===")
    if not problems:
        print("通过，可以生成文档。")
        return 0
    for p in problems:
        print("[问题]", p)
    # fatal?
    fatal = any("缺失资产" in p or "python-docx" in p for p in problems)
    if fatal:
        print("存在致命问题，请先修复。")
        return 2
    print("存在警告（可能仍可生成 Word，PDF 视后端而定）。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
