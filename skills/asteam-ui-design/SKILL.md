---
name: asteam-ui-design
description: ASTeam 官方 UI 设计系统与视觉设计规范。用于前端界面、控制台、数据看板、HTML 交付大屏与多模态产物的色彩、排版、组件设计与代码生成。遵循 Pine Green (#006857) 品牌主色、Accent Red (#D31245) 强调红与企业级设计规约。
version: 2.0.1
triggers:
  - asteam ui
  - asteam ui 设计
  - asteam-ui
  - asteam设计
  - ui设计规范
  - 界面设计规范
  - asteam规范
  - 设计系统
recommended_tools:
  - write_file
  - view_file
---

# ASTeam UI 设计规范与视觉设计系统 (v2.0.1)

ASTeam 官方 UI 设计系统，基于 Next.js / React + Tailwind CSS + Lucide React 构建，适用于企业级 Windows 客户端、Web 控制台、数据可视化看板与 HTML 交付物页面。

## 1. 核心设计原则

1. **工业级沉稳与企业信赖感**：以松石墨绿（Pine Green `#006857`）作为核心品牌基调，传达专业、安全、可信的工程师文化；
2. **极简层次与精致微动效**：严禁过度炫技的重阴影与高饱和刺眼色彩，采用柔和浅阴影（`shadow-xs` / `shadow-sm`）与细腻圆角（`rounded-lg` / `rounded-xl`）；
3. **品牌强调色红线**：ASTeam 强调红（`#D31245`）是品牌尊贵象征，**绝对禁止用于错误/危险状态**！系统错误必须使用语义错误红（`#B42318` / `#F87171`）；
4. **全端双模自适应**：所有产物（React 组件、独立 HTML 页面、Mermaid 流程图、SVG 矢量）必须兼顾浅色（Light）与深色（Dark）模式的高对比度与易读性。

## 2. 品牌色板与 CSS 变量

### 品牌官方标准色
- `--asteam-brand-primary`: `#006857` (松石主绿)
- `--asteam-brand-accent`: `#D31245` (品牌强调红，仅用于徽标/高光徽标，绝不用于错误提示)
- `--asteam-brand-green-700`: `#017260`
- `--asteam-brand-green-600`: `#349182`
- `--asteam-brand-green-500`: `#3EB39C`
- `--asteam-brand-green-400`: `#6BC39C` (Dark 模式主文本/图标推荐)
- `--asteam-brand-green-200`: `#AAE4B4`
- `--asteam-neutral-0`: `#FFFFFF`
- `--asteam-neutral-200`: `#DDDDDD`
- `--asteam-neutral-500`: `#A5A5A5`

### 语义状态色板
- `--asteam-success`: `#15803D` (成功/通过绿)
- `--asteam-warning`: `#B45309` (警告/待确认橙)
- `--asteam-error`: `#B42318` (Light 错误红) / `#F87171` (Dark 错误红)
- `--asteam-info`: `#0369A1` (信息/指引蓝)

### Light 主题配色
- `--background`: `#F7F9F8`
- `--foreground`: `#18181B`
- `--card`: `#FFFFFF`
- `--primary`: `#006857`
- `--primary-foreground`: `#FFFFFF`
- `--accent`: `#AAE4B4`
- `--muted`: `#EEF3F1`
- `--border`: `#DDDDDD`

### Dark 主题配色
- `--background`: `#0A0A0B`
- `--foreground`: `#F5F7F6`
- `--card`: `#141716`
- `--primary`: `#6BC39C`
- `--primary-foreground`: `#0A0A0B`
- `--accent`: `#183C35`
- `--muted`: `#202523`
- `--border`: `#303735`

## 3. 圆角与阴影标准

```css
--radius-sm: 6px;   /* 徽章、微型按钮 */
--radius-md: 8px;   /* 普通按钮、输入框、表单控件 */
--radius-lg: 12px;  /* 卡片、面板、抽屉 */
--radius-pill: 999px; /* 状态胶囊、Pill 标签 */

--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
```

## 4. 图表与看板调色盘

```css
--chart-1: #006857;  /* 主绿 */
--chart-2: #3EB39C;  /* 浅绿 */
--chart-3: #D31245;  /* 品牌强调红 */
--chart-4: #0369A1;  /* 信息蓝 */
--chart-5: #B45309;  /* 警告橙 */
--chart-6: #6BC39C;  /* 薄荷绿 */
```

## 5. 交互与动效规范
- 快速反馈：`120ms` (按钮悬浮、微状态切换)
- 普通过渡：`180ms` (抽屉展开、模态框弹出)
- 缓动函数：`cubic-bezier(0.16, 1, 0.3, 1)`
- 遵循 `prefers-reduced-motion` 媒体查询，保障无障碍体验。

## 6. HTML/React 交付规范
1. 当生成 HTML 独立大屏交付物时，必须在 `<style>` 中直接注入上述 CSS 变量及 Inter / Noto Sans SC 字体回退；
2. 表格必须包含横向滚动容器 (`overflow-x: auto`)，最小宽度 `600px`；
3. 状态标签统一使用胶囊样式 (`rounded-full px-2 py-0.5 text-xs font-medium`)，文字与底色搭配符合 WCAG AA 级对比度。
