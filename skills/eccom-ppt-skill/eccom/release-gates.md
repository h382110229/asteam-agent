# ECCOM Enterprise Release Gates

This file defines whether an authored deck is safe to deliver. It is not a design prompt and does not redesign slides.

Run shared gates on the previewed deck and final deliverable. HTML delivery follows R1, the shared parts of R4 and the HTML delivery checks below; it does not require a PPTX export. When PPTX is requested, retain the editable route and all R1–R4 PPTX checks. Record evidence for every required gate and keep results separate when both formats are requested.

## Status vocabulary

- `PASS`: the required check ran and its acceptance condition is met.
- `WARN`: a non-blocking limitation is recorded with evidence.
- `FAIL`: a required condition is not met; fix and rerun before delivery.
- `NOT_RUN`: a required check was not performed, including environment limitations; do not describe the deck as fully accepted.
- `NOT_APPLICABLE`: the format or capability is not part of this request. Never use it for an applicable check that was not performed. An unexecuted authoring test is `AUTHORING_NOT_RUN`, not a pass.

Do not turn a warning, conditional result, or missing target-environment check into a release-ready claim.

## Gate R1 — Brand and Template Shell

Check the authored role and the final deliverable:

- Canvas is `1280 × 720`, `16:9` in HTML; the PPTX target is `13.333 × 7.5 inch`.
- The authored role uses the matching prepared shell from `eccom/assets/shells/`: `cover`, `contents`, `section`, `body`, or `closing`.
- Verify each shell SHA-256 against `shell-provenance.json`: HTML uses the referenced asset bytes or decoded inline bytes; PPTX uses exported shell media. Inlining must not change asset bytes. Wrong or stale images fail R1. Compare all role renders with the supplied template, including green cover/closing overlays, title rule, footer and number arrows.
- The shell asset is a fixed background layer; the original `PPT模板.pptx` is not loaded or parsed during runtime.
- The correct supplied Logo artwork is used with the correct light/dark contrast rule.
- Logo, Footer, and Page Number are present and legible where the authored shell role requires them.
- Logo, Footer, Page Number, and the title-safe area have no obvious collision with body content.
- Brand colors and typography are compatible with `presentation-contract.md`.

Use DOM inspection and rendered pages for HTML; include PPTX XML and rendered PPTX when requested. Do not require a new validator framework.

## Gate R2 — Editable Export

PPTX delivery only; HTML-only delivery reports R2 as `NOT_APPLICABLE`. Confirm that the deliverable is the editable PPTX export, not a screenshot deck:

- Record native PowerPoint text, native shapes, independent image objects, and rasterized SVG images separately.
- Text remains native PowerPoint text where authored as text; shapes remain native shapes where authored as shapes; images remain independent image objects where used.
- The deck is not flattened into one full-slide bitmap. A rasterized gradient or decorative effect may remain an image if the main content stays editable.

Do not use the presence of an `a:t` element to prove that a page or diagram is editable. If the delivery requires a key chart to be natively editable and it remains a rasterized SVG image, that requirement is `FAIL`; do not silently lower it or build a general SVG conversion engine in this workflow. Record the observed object-level evidence. A successful HTML preview or a downloaded file alone is insufficient.

## Gate R3 — PPTX Package Integrity

PPTX delivery only; HTML-only delivery reports R3 as `NOT_APPLICABLE`. Run the smallest checks that catch known delivery failures:

- `unzip -t <deck.pptx>` succeeds.
- Every slide relationship target resolves inside the PPTX package.
- Every embedded image reference (`a:blip` with `r:embed`) resolves to a valid image relationship and media part.
- Relationship IDs are unique within each relationship part; shape IDs are unique within each slide.
- No obvious duplicate or missing media/relationship entry is present.

Reuse Baoyu's exporter validation and small existing package checks when available. Do not add a general OOXML validator merely to satisfy this gate.

## Gate R4 — Geometry, Visual, and PowerPoint

For both formats, before packaging or export, load [`collect-geometry.mjs`](collect-geometry.mjs) in the served browser page and call `collectGeometry(document)` after `await document.fonts.ready`, all images load and charts/Canvas settle. Save its actual output as JSON; do not hand-author rectangles. Every `.slide` must have a role and be included in the manifest. Capture slides in their untransformed 1280 × 720 authoring state; when deck-stage hides inactive slides, activate and collect each one separately, then concatenate in deck order. Compare manifest count and order against the complete HTML deck and, when requested, exported slide count. Hidden content is not evidence of a checked slide.

The collector includes visible unmarked text/media/painted objects and tests text ranges and clipping ancestors. The audit requires a measured role PNG, required native slots, finite rectangles and the source slot styles. It uses its own role bounds; caller-supplied safe zones cannot weaken checks. Shell and slot failures also block release even if the four geometry counters are zero.

```js
// Serve the deck and its eccom/ directory over HTTP; run in that page.
const {collectGeometry} = await import('./eccom/collect-geometry.mjs');
await customElements.whenDefined('deck-stage');
const stage = document.querySelector('deck-stage');
// Match the existing editable export's resetTransformSelector preparation.
stage.setAttribute('noscale', '');
stage.setAttribute('width', '1280');
stage.setAttribute('height', '720');
Object.assign(stage.style, {transform:'none', transition:'none', width:'1280px', height:'720px'});
const slides = [...document.querySelectorAll('.slide')];
const manifest = {canvas:{width:1280,height:720}, slides:[]};
for (let i = 0; i < slides.length; i++) {
  stage.goTo(i);
  await document.fonts.ready;
  await Promise.all([...slides[i].querySelectorAll('img')].map(img => img.decode()));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  // The collector includes hidden slides too. Keep only the activated page.
  const measured = collectGeometry(document).slides[i];
  if (!slides[i].hasAttribute('data-deck-active') ||
      measured.role !== slides[i].dataset.eccomRole ||
      measured.width !== 1280 || measured.height !== 720 || !measured.elements.length) {
    throw new Error(`Invalid measurement for slide ${i + 1}`);
  }
  manifest.slides.push(measured);
}
// Persist JSON.stringify(manifest); compare all roles/order and the selected final deck count.
```

Run:

```bash
node eccom/geometry-qa.mjs <geometry-manifest.json>
```

Require exit status `0`, `ok === true`, and an empty `issues` array, in addition to all four zero counters. Preserve the full JSON and exit status as evidence. `INVALID_MANIFEST`, `SHELL_MISMATCH`, `SLOT_MISMATCH`, and `SLOT_STYLE_MISMATCH` are failures even when the counters below are zero.

The required counters are:

```text
safe-zone violations = 0
protected-zone collisions = 0
text overflow = 0
slide clipping = 0
```

If the result is not clean, pass [`formatRevisionFeedback()`](geometry-qa.mjs) to the original Baoyu author. The author may revise information density, typography, spacing, hierarchy, structure, positions, or composition while preserving the proposition and leaving the ECCOM shell fixed. Allow no more than two revision rounds; after that, mark release `FAIL`.

For HTML, render and review every page of the final deliverable. For PPTX, render and review every page of the final exported PPTX, not only HTML or a montage. Keep per-page evidence; inspect dense pages at readable size and compare with the corresponding HTML. After a revision, rebuild the selected deliverable and recheck affected pages and final page count; for PPTX also re-export and recheck package integrity.

### Content fidelity

For each selected source chart or other key source item, compare its necessary semantics across source, scratchpad/blueprint, HTML, and final PPTX when requested. Check selected dimensions, labels, level definitions, and relationships; ordinary prose does not require word-for-word copying. Missing key content or an incorrect relationship is `FAIL`.

Review every rendered page for:

- clipping or overflow;
- unintended overlap or shell collision;
- abnormal line wrapping;
- distorted or incorrectly fitted images;
- mixed CJK/Latin font anomalies;
- inconsistent Logo/Footer/Page Number treatment.

### Visual communication

For every body page, record `page / focus / observation / consequence / action-or-accepted-reason / status` in the existing verification report. Each observation must correspond to a rendered screenshot; do not invent scores, reading times, or audience-test results.

Check:

- Is the first-glance focus clear?
- Do graphics communicate an evidenced relationship rather than decorate text?
- Are key words and labels readable at normal presentation size?
- Is there unnecessary duplication between text and graphics?
- Does the composition serve this page's speaking task?
- Does the deck contain repetition without semantic reason?

Pure-text pages, card pages, and deliberate whitespace are not automatic failures. Visual variety follows meaning, not a quota of layouts. The author may perform no more than two complete feedback-revision rounds; after that, retain the evidence and report the partial result rather than tuning prompts indefinitely. Representative-slide review does not replace the geometry gate.

SVG/Canvas outer bounds alone do not verify internal labels or relationships. Read each rendered diagram; check default and meaningful reachable interaction states, including visible final reveal states. Hidden content or an empty measured rectangle is not evidence of a completed review.

### HTML delivery

For HTML delivery, follow [`html-delivery.md`](html-delivery.md) to check final-file loading, resource closure, page navigation, zoom, console errors and necessary interactions. Record source, packaged and delivered hashes and the artifact each runtime result covers. Offline opening, file double-click, fullscreen and printing require actual execution; otherwise record `NOT_RUN`. Interaction is `NOT_APPLICABLE` only if none is provided or requested. A clean source preview does not prove a packaged file works.

The existing geometry checker requires shell paths ending in `/shells/<role>.png`. Do not alter a measured manifest to disguise inline data URLs. For a single-file HTML, retain the source Geometry QA and separately verify decoded shell hashes, final DOM geometry/slots and every final page; report any final collector limitation. A local resource package preserving the supported shell paths is also valid. Do not claim the unchanged checker passed a file it rejected.

### Export fidelity

This subsection, including OOXML fonts and PowerPoint operations, applies only to PPTX delivery. For HTML-only delivery report Export fidelity, Editability, PPTX Package Integrity and PowerPoint as `NOT_APPLICABLE`; browser font/readability checks remain required.

Compare the same page in the final HTML and rendered PPTX. Save page-level observations and identify the final-file hash corresponding to each screenshot. Record material differences in glyphs, font size, line wrapping, object positions, image clarity, and semantic relationships. Geometry counters of zero, a valid package, or a correct canvas alone are not export-fidelity evidence. OOXML font names are not evidence of target-machine rendering, and an HTML fallback stack is not the PPTX fallback strategy.

Report these statuses separately: `Geometry`, `Content fidelity`, `Visual communication`, `Export fidelity`, `Editability`, and `PowerPoint`. Key content that is unreadable or whose relationship is wrong is `FAIL`; missing final rendering or comparison is `NOT_RUN`. Do not merge these statuses into “all passed”. Include Brand/Shell, PPTX Package Integrity and HTML delivery where applicable. HTML passing never offsets PPTX failure. If the font-difference root cause is unconfirmed, state that plainly and do not bypass the gate for this round.

For the font check, record both the browser computed family and the exported OOXML `a:latin`, `a:ea`, and `a:cs` typefaces for a Chinese, English, and mixed CJK/Latin sample. A bare generic-family fallback to Arial is a failure for Chinese text; an unavailable target-host font is a `WARN`/`NOT_RUN` limitation, not a silent pass.

When Microsoft PowerPoint is available, run:

```text
Open → no Repair → Save → Close → Reopen → no Repair
```

When Microsoft PowerPoint is unavailable, mark `POWERPOINT_GATE_NOT_RUN`. LibreOffice rendering is useful local evidence but is not PowerPoint acceptance.

## Failure policy

- If the deck is not compelling, inspect source quality, narrative, and Baoyu composition first. Do not add a Layout Router.
- If Logo/Footer/Page Number repeatedly fail across the fixed Cover/Body/Closing stability check, inspect the supplied CSS, slot markers, shell hashes and collector output. Fix the measured failure; do not invent a new body layout.
- If fonts fail, isolate whether the cause is HTML, capture, exporter XML, or the target host before proposing a font patch.
- If PowerPoint repairs the file, investigate package relationships/exporter behavior; do not redraw the body.
