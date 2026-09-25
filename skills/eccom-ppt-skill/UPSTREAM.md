# Upstream

This package is a minimal ECCOM entrypoint overlay on the supplied Baoyu Design baseline.

## Source identity

- Upstream repository: `JimLiu/baoyu-design`
- Package version: `1.2.0` (recorded by the supplied implementation specification)
- Supplied source archive SHA-256: `ABE7AAA891748655596AC473CF235DB63FAE2C49226881B66BE7593283877AB7`
- GitHub reference commit: `026d4ea012bdd5cada72ac8cc13f21ba4edf2245`
- The source archive and GitHub commit are recorded separately; byte-for-byte identity has not been asserted.
- The original archive is not present in this delivery directory. The working baseline and input hashes are recorded in `../IMPLEMENTATION_INPUT_AUDIT.md`.

## ECCOM overlay

- `SKILL.md`: adds the ECCOM enterprise PPT entry path and keeps Baoyu's native creative/export flow.
- `eccom/presentation-contract.md`: the formal ECCOM Template Shell / Brand contract, including source-derived roles, safe bounds, and protected zones.
- `eccom/release-gates.md`: minimal enterprise delivery gates, including the bounded Geometry QA loop.
- `eccom/template.css`: template-derived native title and page-number slots, with baseline body typography only.
- `eccom/collect-geometry.mjs`: browser measurement including unmarked visible content and fixed chrome.
- `eccom/geometry-qa.mjs`: dependency-free detector and factual revision-feedback formatter; it never changes the authored composition.
- `eccom/assets/`: the necessary Logo assets and five shell-only PNGs extracted from the supplied template.
- `eccom/shell-provenance.json`: source hash, extraction method, retained fixed elements, and artifact hashes.

The CJK fallback fix is contract-level: the authoring guidance uses an explicit Windows/macOS/source-font stack instead of bare `sans-serif`, which the existing capture resolver maps to Arial after its Latin canvas probe. No Baoyu exporter file was changed in this revision.

- `agents/gen-pptx/src/browser/capture-editable.ts` and `test/svg-capture.test.mjs`: inline computed SVG paint and text styles on the captured clone because CSS variables were lost after isolated rasterization. Reapply this narrow patch with the `svg-capture` browser regression; remove it only after an upstream capture path preserves computed SVG styles in isolation.

## Upstream protection

No Baoyu Creative Core or exporter patch is included. Keep these paths byte-identical on future upgrades unless a separate, reproduced failure proves a minimal patch is required:

```text
system-prompt.md
project-types.json
agents/**
built-in-skills/**
starter-components/**
references/**
```

Any future patch must record its failure case, root cause, narrow diff, independent regression, and reapplication procedure. Do not use an ECCOM brand requirement as justification for changing Baoyu narrative planning, visual composition, layout selection, or the exporter.
