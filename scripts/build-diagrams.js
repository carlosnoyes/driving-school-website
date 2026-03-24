#!/usr/bin/env node
// build-diagrams.js — Headless PNG + PDF export for all (or a subset of) diagram configs.
//
// Usage:
//   node build-diagrams.js                        # build ALL configs
//   node build-diagrams.js Parking_3 Stop_1       # build only these configs
//
// Output:
//   dist/png/<name>.png  — full composite PNG (unchanged from before)
//   dist/pdf/<name>.pdf  — print-ready PDF: portrait 8.5×11, one pane per page

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

const ENGINE_DIR = path.join(__dirname, '..', 'src');
const CONFIGS_DIR = path.join(ENGINE_DIR, 'configs');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PNG_DIR = path.join(DIST_DIR, 'png');
const PDF_DIR = path.join(DIST_DIR, 'pdf');

// US Letter in points (portrait)
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 18; // 0.25 inch

async function main() {
  // Determine which configs to build
  const args = process.argv.slice(2);
  let configFiles;

  if (args.length > 0) {
    // Build only the specified configs (match by stem name, with or without .json)
    configFiles = args.map(name => {
      const stem = name.replace(/\.json$/i, '');
      const file = stem + '.json';
      const full = path.join(CONFIGS_DIR, file);
      if (!fs.existsSync(full)) {
        console.error(`Config not found: ${file}`);
        process.exit(1);
      }
      return file;
    });
  } else {
    // Build all .json files in configs/
    configFiles = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
  }

  if (configFiles.length === 0) {
    console.log('No config files found.');
    return;
  }

  // Ensure output directories exist
  fs.mkdirSync(PNG_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });

  // Read the engine source files once
  const primitivesJS = fs.readFileSync(path.join(ENGINE_DIR, 'primitives.js'), 'utf-8');
  const diagramJS = fs.readFileSync(path.join(ENGINE_DIR, 'diagram.js'), 'utf-8');

  // Config loader for resolving `extends` references
  const configCache = {};
  function loadConfig(name) {
    const stem = name.replace(/\.json$/i, '');
    if (configCache[stem]) return configCache[stem];
    const file = path.join(CONFIGS_DIR, stem + '.json');
    if (!fs.existsSync(file)) return null;
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    configCache[stem] = cfg;
    return cfg;
  }

  /**
   * Resolve `extends` in a config object (mirrors Diagram.resolveExtends
   * but runs in Node before the browser page is created).
   */
  function resolveExtends(rawCfg) {
    if (!rawCfg.extends) return rawCfg;
    const baseName = rawCfg.extends;
    const baseRaw = loadConfig(baseName);
    if (!baseRaw) {
      console.warn(`  ⚠ extends: base config "${baseName}" not found — ignoring`);
      const { extends: _, ...rest } = rawCfg;
      return rest;
    }
    const resolvedBase = resolveExtends(baseRaw);
    const { extends: _, ...overrides } = rawCfg;
    return deepMerge(resolvedBase, overrides);
  }

  function deepMerge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      const bVal = base[key];
      const oVal = override[key];
      if (
        oVal && typeof oVal === 'object' && !Array.isArray(oVal) &&
        bVal && typeof bVal === 'object' && !Array.isArray(bVal)
      ) {
        result[key] = deepMerge(bVal, oVal);
      } else {
        result[key] = oVal;
      }
    }
    return result;
  }

  /**
   * Build a print-ready PDF from per-pane PNG buffers.
   * Each pane becomes a portrait US Letter page. Landscape panes are rotated 90° CW.
   */
  async function buildPdf(stem, paneBuffers, paneW, paneH) {
    const pdf = await PDFDocument.create();

    for (const buf of paneBuffers) {
      const img = await pdf.embedPng(buf);
      const page = pdf.addPage([PAGE_W, PAGE_H]);

      const drawW = PAGE_W - 2 * MARGIN;
      const drawH = PAGE_H - 2 * MARGIN;
      const isLandscape = paneW > paneH;

      if (isLandscape) {
        // Rotate 90° CW: image width fits along page height, image height fits along page width
        const scale = Math.min(drawH / paneW, drawW / paneH);
        const scaledW = paneW * scale; // runs along page height after rotation
        const scaledH = paneH * scale; // runs along page width after rotation

        // Translate + rotate: move origin to where top-left of rotated image should be
        const x = MARGIN + (drawW - scaledH) / 2;
        const y = MARGIN + (drawH - scaledW) / 2;

        page.drawImage(img, {
          x: x + scaledH,
          y: y,
          width: scaledW,
          height: scaledH,
          rotate: { type: 'degrees', angle: 90 },
        });
      } else {
        // Portrait — fit directly
        const scale = Math.min(drawW / paneW, drawH / paneH);
        const scaledW = paneW * scale;
        const scaledH = paneH * scale;
        const x = MARGIN + (drawW - scaledW) / 2;
        const y = MARGIN + (drawH - scaledH) / 2;

        page.drawImage(img, {
          x,
          y,
          width: scaledW,
          height: scaledH,
        });
      }
    }

    const pdfBytes = await pdf.save();
    const outPath = path.join(PDF_DIR, stem + '.pdf');
    fs.writeFileSync(outPath, pdfBytes);
    return paneBuffers.length;
  }

  // Launch headless browser
  const browser = await puppeteer.launch();

  console.log(`Building ${configFiles.length} diagram(s)...\n`);

  for (const file of configFiles) {
    const stem = path.basename(file, '.json');
    const rawCfg = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf-8'));
    const resolvedCfg = resolveExtends(rawCfg);
    const configJSON = JSON.stringify(resolvedCfg);

    const page = await browser.newPage();

    // Minimal HTML page that loads the engine and renders the diagram
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body>
<div id="container"></div>
<script>${primitivesJS}</script>
<script>${diagramJS}</script>
<script>
  const cfg = ${configJSON};
  Diagram.render(document.getElementById('container'), cfg);
</script>
</body></html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Get the SVG dimensions and serialized content
    const svgInfo = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return null;
      return {
        width: +svg.getAttribute('width'),
        height: +svg.getAttribute('height'),
        markup: new XMLSerializer().serializeToString(svg),
      };
    });

    if (!svgInfo) {
      console.error(`  ✗ ${stem} — no SVG produced`);
      await page.close();
      continue;
    }

    // Determine pane grid from resolved config
    const canvas = resolvedCfg.canvas || {};
    const cols = canvas.columns || 1;
    const rows = canvas.rows || 1;
    const paneW = svgInfo.width / cols;
    const paneH = svgInfo.height / rows;

    // Render full SVG to composite PNG + per-pane PNGs for PDF
    const exportData = await page.evaluate(({ width, height, markup, cols, rows, paneW, paneH }) => {
      return new Promise(resolve => {
        const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);

          // Full composite PNG
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = width;
          fullCanvas.height = height;
          const fullCtx = fullCanvas.getContext('2d');
          fullCtx.drawImage(img, 0, 0);
          const fullPng = fullCanvas.toDataURL('image/png').split(',')[1];

          // Per-pane PNGs (row-major order)
          const panePngs = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (cols === 1 && rows === 1) {
                // Single pane — reuse the full image
                panePngs.push(fullPng);
              } else {
                const pc = document.createElement('canvas');
                pc.width = paneW;
                pc.height = paneH;
                const pctx = pc.getContext('2d');
                pctx.drawImage(img, c * paneW, r * paneH, paneW, paneH, 0, 0, paneW, paneH);
                panePngs.push(pc.toDataURL('image/png').split(',')[1]);
              }
            }
          }

          resolve({ fullPng, panePngs });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }, { ...svgInfo, cols, rows, paneW, paneH });

    if (!exportData) {
      console.error(`  ✗ ${stem} — PNG conversion failed`);
      await page.close();
      continue;
    }

    // Write composite PNG
    const pngPath = path.join(PNG_DIR, stem + '.png');
    fs.writeFileSync(pngPath, Buffer.from(exportData.fullPng, 'base64'));
    console.log(`  ✓ ${stem}.png  (${svgInfo.width}×${svgInfo.height})`);

    // Build PDF from per-pane images
    const paneBuffers = exportData.panePngs.map(b64 => Buffer.from(b64, 'base64'));
    const pageCount = await buildPdf(stem, paneBuffers, paneW, paneH);
    console.log(`  ✓ ${stem}.pdf  (${pageCount} page${pageCount > 1 ? 's' : ''})`);

    await page.close();
  }

  await browser.close();
  console.log(`\nDone. Output in: ${path.relative(__dirname, DIST_DIR)}/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
