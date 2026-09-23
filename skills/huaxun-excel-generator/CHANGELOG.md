# Changelog

## 1.0.0 (2026-02-14)

首个正式归档版。对标 `huaxun-word-generator` 的交付技能形态。

### 能力

- 固定品牌页：「版本控制」（文档属性 + 变更记录）、「关于」（横幅/用途/索引/保密/联系）
- 8 种业务数据表预设 + 自定义 matrix
- 统一视觉：微软雅黑 10pt、表头 `#FF008080` 白字、细边框、短列居中
- 环境预检、生成后 QA、打印页眉页脚

### 迭代修复（打磨过程，已固化进脚本）

| 现象 | 根因 | 修复 |
|------|------|------|
| 「关于」页眉/横幅显示不完整 | 模板遗留 `sheetView.view=pageLayout` | 全表强制 `normal` |
| 数据表打开后“前几行不见了” | 冻结窗格 B3，但 selection 仍指向 A1/pane=None | selection 改为 `bottomRight` + `activeCell=B3` |
| 「关于」页眉条被删/不完整 | 重写时未稳定重建 A1:J1 | 强制重建合并横幅 + 标题；禁止取消合并 |
| 手机/邮箱被拦腰截断 | 列宽公式过保守，且“手机”误入短列窄宽 | 按内容估算宽度；手机≥15、邮箱≥30、IP≥15，优先单行 |
| 邮箱中间换行难看 | 全列默认 wrap | 仅备注/说明/描述等长文本列 wrap |

### 产物结构

```
huaxun-excel-generator/
├── SKILL.md
├── VERSION                 # 1.0.0
├── README.md
├── CHANGELOG.md
├── assets/huaxun_base_template.xlsx
├── references/format-spec.md
├── examples/{meta,content}.json + out/
└── scripts/{precheck_env,generate_huaxun_excel}.py
```
