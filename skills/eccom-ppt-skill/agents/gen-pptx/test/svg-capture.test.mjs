import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const exporterRoot = fileURLToPath(new URL("..", import.meta.url));

const fixture = `
  <style>
    :root { --brand: #017260; }
    #slide { width:1280px; height:720px; font-family:Arial,sans-serif; }
    .edge { stroke:var(--brand); stroke-width:3; fill:none; }
  </style>
  <div id="slide"><svg width="400" height="200" viewBox="0 0 400 200">
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0 0 L8 4 L0 8 Z" fill="var(--brand)"/>
    </marker></defs>
    <g transform="translate(10 10)">
      <ellipse cx="100" cy="80" rx="70" ry="50" class="edge"/>
      <path d="M170 80 L290 80" class="edge" stroke-dasharray="5 4" marker-end="url(#arrow)"/>
      <rect x="290" y="60" width="80" height="40" fill="var(--brand)"/>
      <text x="330" y="85" text-anchor="middle" fill="white">Loop</text>
    </g>
  </svg><svg width="20" height="20"><rect width="20" height="20" fill="#ff00aa"/></svg></div>`;

const findSvgs = (node, found = []) => {
  if (node.svg) found.push(node.svg);
  for (const child of node.children ?? []) findSvgs(child, found);
  return found;
};

test("captureEditable preserves computed SVG paint in an isolated raster", async () => {
  const bundled = await build({
    stdin: {
      contents:
        'import {captureEditable} from "./src/browser/capture-editable.ts"; window.captureForTest = captureEditable;',
      resolveDir: exporterRoot,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(fixture);
    const sourceOuterHtml = await page.locator("#slide > svg").first().evaluate((svg) => svg.outerHTML);
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    const captured = await page.evaluate(async () => {
      await document.fonts.ready;
      return window.captureForTest({ selector: "#slide", delay: 0 }, []);
    });
    assert.equal(
      await page.locator("#slide > svg").first().evaluate((svg) => svg.outerHTML),
      sourceOuterHtml,
      "capture must not mutate the authored SVG",
    );

    const [variableSvg, fixedSvg] = findSvgs(captured.slide.root);
    assert.ok(variableSvg, "captured tree must contain the variable-color SVG");
    assert.ok(fixedSvg, "captured tree must contain the fixed-color SVG");
    assert.match(fixedSvg, /#ff00aa/i, "fixed paint remains available as a control");

    const isolated = await browser.newPage({ viewport: { width: 420, height: 220 } });
    await isolated.setContent(`<body>${variableSvg}</body>`);
    const properties = await isolated.locator("svg").evaluate((svg) => {
      const ellipse = svg.querySelector("ellipse");
      const rect = svg.querySelector("rect");
      const path = svg.querySelector('path[marker-end]');
      const text = svg.querySelector("text");
      return {
        ellipseStroke: getComputedStyle(ellipse).stroke,
        rectFill: getComputedStyle(rect).fill,
        fontFamily: getComputedStyle(text).fontFamily,
        viewBox: svg.getAttribute("viewBox"),
        transform: svg.querySelector("g").getAttribute("transform"),
        textAnchor: text.getAttribute("text-anchor"),
        dasharray: path.getAttribute("stroke-dasharray"),
        marker: path.getAttribute("marker-end"),
        markerExists: Boolean(svg.querySelector("#arrow")),
      };
    });
    assert.equal(properties.ellipseStroke, "rgb(1, 114, 96)");
    assert.equal(properties.rectFill, "rgb(1, 114, 96)");
    assert.match(properties.fontFamily, /Arial/i);
    assert.equal(properties.viewBox, "0 0 400 200");
    assert.equal(properties.transform, "translate(10 10)");
    assert.equal(properties.textAnchor, "middle");
    assert.equal(properties.dasharray, "5 4");
    assert.equal(properties.marker, "url(#arrow)");
    assert.equal(properties.markerExists, true);

    const pixels = await isolated.locator("svg").evaluate(async (svg) => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 200;
      const image = new Image();
      const rasterSvg = svg.outerHTML.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rasterSvg)}`;
      await image.decode();
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const colorAt = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data);
      return { ellipseTop: colorAt(110, 40), nodeInterior: colorAt(310, 80) };
    });
    assert.deepEqual(pixels.ellipseTop.slice(0, 3), [1, 114, 96]);
    assert.deepEqual(pixels.nodeInterior.slice(0, 3), [1, 114, 96]);
    await isolated.close();
  } finally {
    await browser.close();
  }
});
