# ECCOM Template Shell Contract

This is a Presentation Brand / Template Shell Contract, not a Design System and not a Layout Library. It fixes the company identity and delivery frame; Baoyu Design remains responsible for source understanding, narrative, propositions, visual reasoning, composition, and body content.

The shell, Logo, title and page-number slots, fonts, canvas, protected zones, geometry, content and visual checks apply to both HTML and PPTX delivery. OOXML, native PowerPoint objects and PowerPoint open/save checks apply only when PPTX is requested.

## Formal source and runtime boundary

- Development source: the supplied `PPT模板.pptx` (SHA-256: `8108b1c1c2ca20f1548911c5799771faabdc3c52eed55cba9b0137a91d13026c`).
- Source facts: 5 slides, 1 master, 7 layouts, `13.333 × 7.500 inch`, `16:9`.
- Shell extraction is a Skill-production step. Runtime uses the prepared PNGs below and never parses, merges, or loads the original PPTX.
- Extraction details and per-asset hashes are recorded in [`shell-provenance.json`](shell-provenance.json).

## Canvas

- HTML authoring canvas: `1280 × 720`.
- For PPTX delivery, final canvas: `13.333 × 7.5 inch`.
- Aspect ratio: `16:9`.
- Use Baoyu's `deck-stage` and static slide-structured HTML. The canvas and shell bounds do not prescribe the internal composition.

## Brand facts from the supplied template

| Role | Value / rule |
|---|---|
| Primary brand green | `#017260` |
| Secondary greens | `#6BC39C`, `#3EB39C`, `#AAE4B4`, `#349182` |
| Neutral template gray | `#A5A5A5` |
| Logo intrinsic green | `#006857` |
| Logo red | `#D31245` |
| Logo gray | `#4D4D4D` |
| Body text | Template default black; `#32425B` is case-only evidence, not a template default |

These are source facts, not a component-token system. Do not invent additional ECCOM palettes when the source material does not require them.

## Template typography and native slots

Copy [`template.css`](template.css) unchanged into the output's `eccom/` directory and load it after generic deck styles. Copy `assets/shells/` alongside it. Use lowercase `data-eccom-role` values on every `.slide`, and `<html lang="zh-CN">` with `<meta charset="UTF-8">` in the head. The template contract takes precedence over generic deck title styles and theme exploration. No extra Design System is needed.

Generic wrapper-fill rules must exclude ECCOM content containers and native slots. A broad `section[data-label] > * ... { height:100% }` can override an authored body height by selector specificity; loading the template last alone does not fix that body rule. Mark authored body containers with `data-eccom-content` and exclude both markers from the existing generic selector:

```css
section[data-label] > *:not(img):not(picture):not(video):not(svg):not(canvas):not([data-eccom-content]):not([data-eccom-slot]) {
  height: 100%;
  box-sizing: border-box;
}
```

Keep each author's body dimensions and composition. This exclusion does not prohibit flex/grid or percentage heights inside the body. Measure computed body sizes in preview and export preparation; a full-height child followed by a sibling still needs room for that sibling and must be checked separately.

The CSS fixes only chrome and baseline typography; it does not position body content. Source coordinates use `EMU / 9525` for this 1280 × 720 canvas, and source point sizes use `pt × 4/3` for CSS pixels. Do not treat 36pt as 36px.

| Native slot | Source | Default style |
|---|---|---|
| Body title | slide 4 → slideLayout3 title placeholder | 36pt / 48px, bold, centered, `#404040`, 6pt / 8px tracking; exact source box in CSS |
| Cover title / subtitle | slide1 shapes 18 / 17 | 54pt / 28pt, white, bold; source boxes |
| Section title | slide3 text | 40pt, bold, centered, `#404040` |
| Closing title / subtitle | slide5 text | 28pt, white; source boxes |
| Page number (Body / Contents) | slideMaster1 shape 12 field | Arial 9pt / 12px, `#04B384`, source slot |
| Ordinary body text levels | slideLayout3 content overrides | 20 / 18 / 16pt (26.667 / 24 / 21.333px) |

The example text *says* 24/20/18pt, but the actual layout overrides are 20/18/16pt. Default to the actual layout; do not mix the two scales. Body composition may use purposeful data emphasis, but keep ordinary text on a consistent hierarchy. Never use the company case to override template chrome.

Title wording remains the author's decision; its shell position, color and typography do not. If a title does not fit, shorten it while preserving the proposition or move details into the body; do not move it into the body safe zone, arbitrarily shrink it, or cover the title rule. Mark each title with `data-eccom-slot="title"`. Cover subtitle/strapline and Closing subtitle are optional native slots with their source CSS. Body and Contents each require one native `data-eccom-slot="page-number"`. Do not add a second footer: the exact company name is already in the PNG.

Minimal Body structure (the content is composed independently):

```html
<link rel="stylesheet" href="eccom/template.css">
<section class="slide" data-eccom-role="body">
  <img data-eccom-shell src="eccom/assets/shells/body.png" alt="">
  <h1 data-eccom-slot="title">业务与技术协同</h1>
  <div data-eccom-content style="left:100px;top:180px;width:980px;height:420px">
    <!-- Author this page's content freely; this example box is not a layout. -->
  </div>
  <span data-eccom-slot="page-number">4</span>
</section>
```

Use a real `<img>` for the fixed shell, not a CSS background, to preserve it as an independent image in editable export. Do not filter, tint, crop, scale independently, redraw, cover, or replace the shell. Keep it first in DOM order, with no opaque full-slide layer above it. Keep key content in measurable, reviewable elements, not solely in pseudo-elements, hover or transient animation. HTML may use semantic SVG, Canvas and charts where needed, with readable labels and reviewable states. Non-semantic decoration need not become native objects. For PPTX delivery, use the supported editable export path and verify required native objects under R2.

## CJK and target fonts

- Chinese text: use the explicit stack `"Microsoft YaHei", "微软雅黑", "PingFang SC", "Source Han Sans CN", "思源黑体 CN", Arial, sans-serif`.
- English and numerals: use `Arial`.
- For a mixed run that must preserve separate font faces, split the CJK and Latin spans explicitly; otherwise keep the explicit CJK stack on the run so capture does not reduce it to generic `sans-serif`.
- Do not use bare `sans-serif` as the only CJK family. The current capture resolver uses a Latin canvas probe and maps the generic family to `Arial`, which was the observed source of the fallback.
- A contract font declaration is not proof that a target host has the face installed. For both formats, report the browser computed family and inspect rendered CJK/Latin text; a CSS stack alone does not prove the rendered face. For PPTX delivery, also report the exported OOXML family and target-host rendering.

## Shell assets and roles

Use one prepared shell as a fixed background layer (`position: absolute; inset: 0; pointer-events: none`) and put the page's authored content above it. Use native slot markers for chrome. The supplied collector inspects visible content including unmarked elements; `data-eccom-dynamic` is optional and cannot exempt content from checks. The shell is fixed; the content above it is not.

| Role | Shell asset | Fixed enterprise elements | Dynamic content safe bounds (1280 × 720 px) |
|---|---|---|---|
| Cover | `assets/shells/cover.png` | dark wave background, white Logo | `minX=96, maxX=1040, minY=120, maxY=510` |
| Contents | `assets/shells/contents.png` | left wave panel, `目录 / CONTENTS`, color Logo, footer and page-number slot | `minX=500, maxX=1120, minY=120, maxY=650` |
| Section | `assets/shells/section.png` | color Logo and bottom wave decoration | `minX=180, maxX=1100, minY=170, maxY=545` |
| Body | `assets/shells/body.png` | color Logo, gray curved content field, green title rule, footer and page-number slot | `minX=80, maxX=1120, minY=145, maxY=650` |
| Closing | `assets/shells/closing.png` | dark wave background and white Logo | `minX=480, maxX=1120, minY=245, maxY=500` |

These are conservative authoring bounds around the rendered shell, not numerical safe zones explicitly declared by the original PPTX. Native title/page-number slots are checked separately against source geometry. Bounds do not prescribe body columns, cards, or diagrams. `geometry-qa.mjs` owns the executable role bounds; manifests cannot override them.

## Protected zones

Dynamic content must not overlap the fixed regions below. Coordinates are conservative checks in the same `1280 × 720` authoring space.

| Role | Protected regions |
|---|---|
| Cover | white Logo `x=1088..1250, y=20..100`; bottom wave/decor below the content-safe region |
| Contents | left shell panel `x=0..460, y=0..720`; color Logo `x=1120..1250, y=20..100`; footer/page slot `y=665..720` |
| Section | color Logo `x=1120..1250, y=20..100`; bottom wave/decor `y=580..720` |
| Body | color Logo `x=1120..1250, y=20..100`; title band `y=0..140`; footer/page slot `y=665..720` |
| Closing | white Logo `x=240..450, y=295..385`; bottom wave/decor below the content-safe region |

The page number is dynamic and must use the native page-number slot in `template.css`. The static footer company name remains part of the prepared shell where shown.

## Narrative and composition boundary

Role choice is a storytelling decision. Contents and Section are optional; do not require a contents page, a section per chapter, a fixed chapter count, or a fixed page count. All Body pages use the same Body shell by default, while their internal composition remains Baoyu's decision.

The contract does not define columns, cards, grids, process or architecture structures, visual patterns, spacing/radius/shadow systems, a body renderer, a planner, a component library, a template parser, or a constraint solver. ECCOM constrains brand, shell, geometry boundaries, and release only.
