# huaxun-excel-generator

**Version 1.0.0**（归档版）

按华讯（ECCOM）Excel 模板（暂定）规范，生成交付用 **Excel（.xlsx）** 的 MiMo Desktop / Claude Code 技能。  
对标同目录 `huaxun-word-generator`：预检 → 收集元数据 → 脚本生成 → QA → 交付。

## 功能

- 固定品牌页：「版本控制」（文档属性 + 变更记录）、「关于」（横幅标题/用途/索引/保密/联系）
- 数据表预设：通讯录 / 设备清单 / IP 规划 / 验收检查表 / 问题跟踪 / 进度计划 / 资产清单 / 参数配置
- 统一样式：微软雅黑 10pt、表头 `#FF008080` 白字加粗、细边框、短列居中
- **列宽自适应**：手机/邮箱/IP 优先单行；仅备注类长文本换行
- 视图与冻结：强制 `normal`；冻结窗格 selection 对齐，避免“打开丢表头”
- 环境预检 + 生成后 QA + 打印页眉页脚

## 目录结构

```
huaxun-excel-generator/
├── SKILL.md                      # 技能入口（agent 读这个）
├── VERSION                       # 1.0.0
├── README.md                     # 安装与使用说明
├── CHANGELOG.md                  # 版本与打磨记录
├── assets/
│   └── huaxun_base_template.xlsx # 公司模板副本（生成基底）
├── references/
│   └── format-spec.md            # 颜色/布局/列宽/预设表规范
├── examples/
│   ├── meta.json
│   ├── content.json
│   └── out/                      # 样例输出
└── scripts/
    ├── precheck_env.py
    └── generate_huaxun_excel.py  # 唯一生成入口
```

## 系统要求

| 项 | 要求 |
|----|------|
| OS | Windows / 跨平台 |
| Python | MiMo `MIMO_PYTHON`，或 3.10+ + `openpyxl` |
| 字体 | 微软雅黑（Windows 默认通常具备） |

## 安装

### 方式 A：MiMo Desktop 技能目录（推荐）

1. 复制整个文件夹到：

   `C:\Users\<用户名>\.claude\skills\huaxun-excel-generator`

2. **新开对话**（或重启 MiMo Desktop）加载技能。
3. 验证：

```powershell
& $env:MIMO_PYTHON "$env:USERPROFILE\.claude\skills\huaxun-excel-generator\scripts\precheck_env.py"
```

也可使用归档包：`D:\ASTeamAIProject\Skills\dist\huaxun-excel-generator-v1.0.0.zip`。

### 方式 B：仅命令行（不依赖技能加载）

```powershell
& $env:MIMO_PYTHON "<路径>\scripts\generate_huaxun_excel.py" `
  --meta meta.json --content content.json --out .\out
```

## 快速使用

对话中说：

> 按华讯 Excel 模板出一份项目通讯录和设备清单，项目名同标题，作者张三。

技能会预检环境，收集标题/项目/表结构，生成 xlsx 并 QA。

## 输入示例

- `meta.json` / `content.json`：见 `examples/`
- 预设 `type` 与列宽规则：见 `references/format-spec.md`

## 升级 / 卸载

- 升级：新版本文件夹覆盖 `~/.claude/skills/huaxun-excel-generator`
- 卸载：删除该文件夹后新开对话

## 版本历史

| 版本 | 说明 |
|------|------|
| 1.0.0 | 首个正式归档版：品牌页 + 8 预设表 + 列宽/换行/视图/冻结打磨完成 |

详见 `CHANGELOG.md`。

## 许可与来源

内部交付模板衍生；基于公司《Excel模板（暂定）》。请遵守公司文档与品牌规范。
