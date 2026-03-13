#!/usr/bin/env node
// build-diagrams.js — Headless PNG export for all (or a subset of) diagram configs.
//
// Usage:
//   node build-diagrams.js                        # build ALL configs
//   node build-diagrams.js Parking_3 Stop_1       # build only these configs

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ENGINE_DIR = path.join(__dirname, '..', 'src');
const CONFIGS_DIR = path.join(ENGINE_DIR, 'configs');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist');

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

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Read the engine source files once
  const primitivesJS = fs.readFileSync(path.join(ENGINE_DIR, 'primitives.js'), 'utf-8');
  const diagramJS = fs.readFileSync(path.join(ENGINE_DIR, 'diagram.js'), 'utf-8');

  // Launch headless browser
  const browser = await puppeteer.launch();

  console.log(`Building ${configFiles.length} diagram(s)...\n`);

  for (const file of configFiles) {
    const stem = path.basename(file, '.json');
    const configJSON = fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf-8');

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

    // Render SVG to canvas → PNG using the same approach as the viewer
    const pngBase64 = await page.evaluate(({ width, height, markup }) => {
      return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }, svgInfo);

    if (!pngBase64) {
      console.error(`  ✗ ${stem} — PNG conversion failed`);
      await page.close();
      continue;
    }

    const outPath = path.join(OUTPUT_DIR, stem + '.png');
    fs.writeFileSync(outPath, Buffer.from(pngBase64, 'base64'));
    console.log(`  ✓ ${stem}.png  (${svgInfo.width}×${svgInfo.height})`);

    await page.close();
  }

  await browser.close();
  console.log(`\nDone. Output in: ${path.relative(__dirname, OUTPUT_DIR)}/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
