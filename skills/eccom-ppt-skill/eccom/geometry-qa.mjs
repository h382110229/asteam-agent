#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const EPSILON = 0.5;

// Conservative shell protection, not body layouts. Callers cannot widen it.
export const ROLE_BOUNDS = {
  cover: [96, 1040, 120, 510], contents: [500, 1120, 120, 650],
  section: [180, 1100, 170, 545], body: [80, 1120, 145, 650],
  closing: [480, 1120, 245, 500],
};
const SLOTS = {
  cover: {title:[96.3677,215.0993,916.4323,96.9375,72],subtitle:[96.3677,320.6383,518.7079,54.9312,37.3333],strapline:[107.4424,457.6087,459.73,47.2775,20]},
  section: {title:[194.07,296.44,884.93,74.32,53.3333]},
  body: {title:[145.8027,12.204,988.3955,114.9495,48]},
  closing: {title:[484.86,287.73,582.9,54.93,37.3333],subtitle:[484.86,342.66,556.29,54.93,37.3333]},
  contents: {},
};
const PAGE_NUMBER = [867.7639,676.9475,44.0843,38.3333,12];

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rect(value) {
  if (!value || !["x", "y", "w", "h"].every(k => typeof value[k] === "number" && Number.isFinite(value[k]))) return null;
  const r = {
    x: number(value.x),
    y: number(value.y),
    w: number(value.w),
    h: number(value.h),
  };
  return r.w >= 0 && r.h >= 0 ? r : null;
}

function intersects(a, b) {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return width > EPSILON && height > EPSILON;
}

function px(value) {
  return `${Math.round(value * 10) / 10}px`;
}

function issue(slide, role, code, element, message, details = {}) {
  return {
    slide,
    role,
    code,
    element: element ?? null,
    message,
    ...details,
  };
}

/**
 * Audit a DOM-rect manifest. The manifest is intentionally small so a browser
 * harness can collect it from data-eccom-dynamic elements without introducing
 * a validator framework or a layout model.
 */
export function auditDeckGeometry(input) {
  const canvas = {
    width: number(input?.canvas?.width),
    height: number(input?.canvas?.height),
  };
  const slides = Array.isArray(input?.slides) ? input.slides : [];
  const issues = [];

  if (canvas.width !== 1280 || canvas.height !== 720 || !slides.length) {
    issues.push(issue(0, "unknown", "INVALID_MANIFEST", null, "Expected 1280 x 720 canvas and nonempty slides"));
  }
  slides.forEach((slide, slideIndex) => {
    const slideNo = slideIndex + 1;
    const role = String(slide?.role ?? "unknown").toLowerCase();
    if ((slide.width !== undefined && slide.width !== 1280) || (slide.height !== undefined && slide.height !== 720)) issues.push(issue(slideNo,role,"INVALID_MANIFEST",null,"Slide authoring dimensions must be 1280 x 720"));
    const values = ROLE_BOUNDS[role];
    const safe = values ? {minX:values[0],maxX:values[1],minY:values[2],maxY:values[3]} : null;
    const protectedZones = role === "body" || role === "contents"
      ? [{id:"footer",rect:{x:0,y:665,w:1280,h:55}}, ...(role === "body" ? [{id:"title-band",rect:{x:0,y:0,w:1280,h:140}}] : [])]
      : [];
    if (!safe) issues.push(issue(slideNo,role,"INVALID_MANIFEST",null,"Unknown shell role"));
    const elements = Array.isArray(slide?.elements) ? slide.elements : [];

    if (!elements.length) issues.push(issue(slideNo,role,"INVALID_MANIFEST",null,"No measured elements"));
    const shells = elements.filter(e => e.kind === "shell");
    if (shells.length !== 1) issues.push(issue(slideNo,role,"SHELL_MISMATCH",null,"Expected exactly one measured shell image"));
    const required = ["cover","body","section","closing"].includes(role) ? ["title"] : [];
    if (["body","contents"].includes(role)) required.push("page-number");
    for (const slot of required) {
      if (elements.filter(e => e.slot === slot && e.text?.trim()).length !== 1) issues.push(issue(slideNo,role,"SLOT_MISMATCH",slot,`Expected one nonempty ${slot}`));
    }
    elements.forEach((element) => {
      const id = element?.id ?? `element-${elements.indexOf(element) + 1}`;
      const current = rect(element?.rect);
      if (!current) {
        issues.push(issue(slideNo,role,"INVALID_MANIFEST",id,"Invalid or missing rectangle")); return;
      }
      const isShell = element.kind === "shell";
      const slot = element.slot;
      if (isShell) {
        if (Math.abs(current.x)>EPSILON || Math.abs(current.y)>EPSILON || Math.abs(current.w-1280)>EPSILON || Math.abs(current.h-720)>EPSILON || !element.src?.endsWith(`/shells/${role}.png`) || element.loaded !== true || element.opacity !== 1 || element.filter !== "none" || element.clipPath !== "none" || element.blendMode !== "normal") {
          issues.push(issue(slideNo,role,"SHELL_MISMATCH",id,"Shell must be the loaded role PNG at 0,0,1280,720 with opacity 1"));
        }
      }
      if (slot) {
        const spec = slot === "page-number" && ["body","contents"].includes(role) ? PAGE_NUMBER : SLOTS[role]?.[slot];
        if (!spec || [current.x,current.y,current.w,current.h,element.fontSize].some((v,i)=>!Number.isFinite(v)||Math.abs(v-spec[i])>EPSILON)) {
          issues.push(issue(slideNo,role,"SLOT_MISMATCH",id,"Template slot position, size or font size differs from source"));
        }
      }
      if (slot) {
        const dark = ["cover", "closing"].includes(role);
        const expectedColor = slot === "page-number" ? "rgb(4, 179, 132)" : dark ? "rgb(255, 255, 255)" : "rgb(64, 64, 64)";
        const centered = slot === "page-number" || ["body", "section"].includes(role);
        const expectedWeight = slot === "page-number" || role === "closing" || slot === "strapline" ? "400" : "700";
        const tracking = slot === "page-number" || (role === "cover" && slot === "title") ? 0 : role === "body" || slot === "subtitle" && role === "cover" ? 8 : 4;
        const runs = element.runs ?? [element];
        const badRun = runs.some(run => Math.abs(run.fontSize - element.fontSize) > EPSILON || run.color !== expectedColor || run.fontWeight !== expectedWeight || Math.abs(run.letterSpacing-tracking)>EPSILON || !/Microsoft YaHei|微软雅黑|PingFang SC|Source Han Sans|思源黑体|Arial/.test(run.fontFamily ?? "") || (/[\u3400-\u9fff]/.test(run.text ?? "") && !/Microsoft YaHei|微软雅黑|PingFang SC|Source Han Sans|思源黑体/.test(run.fontFamily ?? "")));
        if (badRun || element.color !== expectedColor || element.fontWeight !== expectedWeight || element.textAlign !== (centered ? "center" : "left")) {
          issues.push(issue(slideNo,role,"SLOT_STYLE_MISMATCH",id,"Template slot color, weight or alignment differs"));
        }
      }
      if (safe && !isShell && !slot) {
        const violations = [];
        if (current.x < safe.minX - EPSILON) violations.push(`left by ${px(safe.minX - current.x)}`);
        if (current.x + current.w > safe.maxX + EPSILON) {
          violations.push(`right by ${px(current.x + current.w - safe.maxX)}`);
        }
        if (current.y < safe.minY - EPSILON) violations.push(`top by ${px(safe.minY - current.y)}`);
        if (current.y + current.h > safe.maxY + EPSILON) {
          violations.push(`bottom by ${px(current.y + current.h - safe.maxY)}`);
        }
        if (violations.length) {
          issues.push(
            issue(
              slideNo,
              role,
              "SAFE_ZONE_VIOLATION",
              id,
              `element ${id} exceeds safe ${violations.join(", ")}`,
              { violations },
            ),
          );
        }
      }

      (isShell || slot ? [] : protectedZones).forEach((zone, zoneIndex) => {
        const protectedRect = rect(zone?.rect ?? zone);
        if (!protectedRect || !intersects(current, protectedRect)) return;
        const zoneId = zone?.id ?? `protected-${zoneIndex + 1}`;
        issues.push(
          issue(
            slideNo,
            role,
            "PROTECTED_ZONE_COLLISION",
            id,
            `element ${id} overlaps protected ${zoneId}`,
            { protectedZone: zoneId },
          ),
        );
      });

      const metrics = element?.textMetrics;
      if (metrics && (number(metrics.scrollWidth) > number(metrics.clientWidth) + 2 ||
        number(metrics.scrollHeight) > number(metrics.clientHeight) + 2)) {
        const widthOverflow = Math.max(0, number(metrics.scrollWidth) - number(metrics.clientWidth));
        const heightOverflow = Math.max(0, number(metrics.scrollHeight) - number(metrics.clientHeight));
        issues.push(
          issue(
            slideNo,
            role,
            "TEXT_OVERFLOW",
            id,
            `element ${id} overflows its text box by ${px(Math.max(widthOverflow, heightOverflow))}`,
            { widthOverflow, heightOverflow },
          ),
        );
      }

      if (element.clipped === true) issues.push(issue(slideNo,role,"TEXT_OVERFLOW",id,"Content clipped by element or ancestor"));
      const clip = [];
      if (current.x < -EPSILON) clip.push(`left by ${px(-current.x)}`);
      if (current.y < -EPSILON) clip.push(`top by ${px(-current.y)}`);
      if (current.x + current.w > canvas.width + EPSILON) {
        clip.push(`right by ${px(current.x + current.w - canvas.width)}`);
      }
      if (current.y + current.h > canvas.height + EPSILON) {
        clip.push(`bottom by ${px(current.y + current.h - canvas.height)}`);
      }
      if (clip.length) {
        issues.push(
          issue(
            slideNo,
            role,
            "SLIDE_CLIPPING",
            id,
            `element ${id} exceeds slide canvas ${clip.join(", ")}`,
            { violations: clip },
          ),
        );
      }
    });
  });

  const counts = {
    safeZoneViolations: issues.filter((item) => item.code === "SAFE_ZONE_VIOLATION").length,
    protectedZoneCollisions: issues.filter((item) => item.code === "PROTECTED_ZONE_COLLISION").length,
    textOverflows: issues.filter((item) => item.code === "TEXT_OVERFLOW").length,
    slideClippings: issues.filter((item) => item.code === "SLIDE_CLIPPING").length,
  };
  return { ok: issues.length === 0, counts, issues };
}

/** Geometry feedback for the original author; it reports facts and leaves all
 * composition, typography, spacing, and structure decisions to that author. */
export function formatRevisionFeedback(result, revisionIndex = 0) {
  if (!result || result.ok) return "Geometry QA passed: no safe-zone, protected-zone, text-overflow, or slide-clipping issues detected.";
  const lines = [
    "The current composition violates the ECCOM content-safe region.",
    "",
    "Detected issues:",
    ...result.issues.map((item) => `- Slide ${item.slide}: ${item.message}`),
    "",
    `Revision ${revisionIndex + 1} of 2: revise the slide while preserving its proposition and visual intent.`,
    "You may change:",
    "- information density",
    "- typography",
    "- spacing",
    "- hierarchy",
    "- structure",
    "- element positions",
    "- visual composition",
    "",
    "Do not modify the ECCOM shell.",
    "Do not use predefined layouts.",
  ];
  return lines.join("\n");
}

export function revisionAllowed(revisionIndex) {
  return Number.isInteger(revisionIndex) && revisionIndex >= 0 && revisionIndex < 2;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("Usage: node eccom/geometry-qa.mjs <geometry-manifest.json>\n");
    process.exitCode = 64;
    return;
  }
  const fs = await import("node:fs/promises");
  const input = JSON.parse(await fs.readFile(file, "utf8"));
  const result = auditDeckGeometry(input);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
