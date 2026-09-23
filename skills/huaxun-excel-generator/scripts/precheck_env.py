#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Environment precheck for huaxun-excel-generator skill."""
from __future__ import annotations

import os
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS = SKILL_DIR / "assets"
BASE = ASSETS / "huaxun_base_template.xlsx"


def main() -> int:
    problems: list[str] = []

    print("=== huaxun-excel-generator 环境预检 ===")
    print(f"Python: {sys.executable}")
    print(f"MIMO_PYTHON: {os.environ.get('MIMO_PYTHON', '(未设置)')}")

    try:
        import openpyxl  # noqa: F401

        print(f"openpyxl: OK ({openpyxl.__version__})")
    except Exception as exc:
        problems.append(f"缺少 openpyxl: {exc}")
        print("openpyxl: FAIL", exc)

    try:
        from openpyxl.styles import Border, Font, PatternFill  # noqa: F401

        print("openpyxl.styles: OK")
    except Exception as exc:
        problems.append(f"openpyxl.styles 不可用: {exc}")

    ok = BASE.is_file()
    print(f"基础模板: {'OK' if ok else '缺失'} -> {BASE}")
    if not ok:
        problems.append(f"缺失基础模板: {BASE}")
        problems.append("修复: 将公司 Excel模板（暂定）.xlsx 复制为 assets/huaxun_base_template.xlsx")

    print("中文字体: 请确认已安装「微软雅黑」（Windows 默认具备）")

    print("=== 结果 ===")
    if not problems:
        print("通过，可以生成工作簿。")
        return 0
    for p in problems:
        print("[问题]", p)
    if any("缺少" in p or "缺失基础模板" in p for p in problems):
        print("存在致命问题，请先修复。")
        return 2
    print("存在警告。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
