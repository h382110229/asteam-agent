# ECCOM HTML delivery

HTML is an independent presentation deliverable for browser presentation and local sharing, including requests without a specified file format. Explicit PPTX or editable-slide requests follow the PPTX branch in SKILL.md. Apply the shared contract and R1/R4; HTML does not require a trial PPTX export.

## 1. Keep the presentation and company shell intact

Use the existing deck-stage, 1280 × 720 canvas, unchanged template.css, prepared role PNGs, title/page-number slots and protected zones. Keep static readable slide content and free body composition. Add behaviour only when it serves the content. Copy authoring assets into the output directory. Preserve labels, units, source facts and the default visible meaning; inspect meaningful interaction states at normal presentation size.

## 2. Account for the actual resource closure

Prefer a single `.html` with CSS, scripts and images inlined. Inventory all actual dependencies, not only HTML src/href attributes:

- CSS imports, url(), inline styles and background images;
- JavaScript imports, dynamic resource strings, fetch/XHR and worker or module dependencies;
- images/srcset, SVG image/use references, fonts and their licenses;
- Canvas/chart libraries, data, textures and any resources loaded after interaction.

If a chart needs a library, pin its version and include its dependencies and necessary license notices. Do not run from a CDN by default. Record any remaining external requests and required system fonts; a fallback stack is not a bundled font. Wait for fonts, image decoding and chart drawing before inspection. A blank Canvas or loaded chart container alone does not demonstrate correct content.

## 3. Package with tools that actually exist

Use a host-provided standalone tool only after verifying it is callable. The upstream standalone guide describes one host's tools; do not call nonexistent `super_inline_html` or download tools. If unavailable, inline the actual known resource graph using available local tooling, then verify it. Do not introduce a general bundler or put candidate test scripts into this Skill.

When actual dependencies cannot be safely inlined, report the specific reason and deliver a clear local resource package with relative paths and startup instructions. A directory package does not automatically support double-click execution. Preserve the shell image bytes whether copied or inlined. Follow R4's distinction between source geometry evidence and final inline-shell checks; never rewrite a measured manifest to fabricate a checker pass.

## 4. Test the final artifact

Serve the packaged deliverable over HTTP using an available local server and record the URL and file hash tested. Actually activate every slide, wait for stable rendering, inspect the Shell, Logo, title, page number, protected zones, CJK text, image/chart labels, geometry and content relationships. Test navigation, zoom at a smaller viewport, meaningful interactive states and returning to a slide. Inspect console errors and failed network/resource requests, including dependencies triggered by interaction.

Test offline loading, file double-click, fullscreen and printing separately when available. Record each unexecuted check as `NOT_RUN`, with its limitation; HTTP preview and a static dependency scan do not prove offline or double-click operation. A failed applicable check is `FAIL`, not `NOT_APPLICABLE`. Do not work around a host's blocked operation through another channel.

## 5. Identify the delivered version

Record absolute paths and SHA-256 for source files, packaged files and the final delivered artifact; for a resource package include a file manifest and the ZIP hash. Identify which hash each preview or screenshot represents. Recheck final files after any change. Provide the portable file or package through available download tooling or an absolute local file link; a localhost preview URL alone is not delivery. Exclude test scripts, logs and temporary server dependencies from the deliverable.
