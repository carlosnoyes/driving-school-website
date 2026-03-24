# PLAN.md

Active work plan for the CDS-diagrams project. Each sub-step has a status: `pending`, `in-progress`, or `completed`.

**Rule:** Always update PLAN.md incrementally as you work — mark steps `in-progress` before starting and `completed` when done. This way, if work stops unexpectedly, PLAN.md remains accurate and current.

Each collapsible `<summary>` includes a `[n/N Completed]` counter where `n` is the number of completed sub-steps and `N` is the total. The top-level section counts its WPs; each WP counts its own steps. Update these counters whenever a step status changes.

---

<details>
<summary><h3 style="display:inline">0. EXAMPLE — Add Roundabout Primitive — [0/3 Completed]</h3></summary>

> **This is an example subsection** illustrating the format, structure, and level of detail expected in a PLAN.md work package. It is not real work — use it as a template when adding new sections. A good plan gives enough implementation detail that work can resume in a new session without re-reading the entire codebase.

**Goal**: Add a `Roundabout` primitive so JSON configs can place a roundabout at an intersection, rendered as a circular island with approach/exit roads and optional yield signs.

**Why**: Roundabouts are common in driving school curriculum but currently must be faked with manual SVG decorations. A first-class primitive simplifies config authoring and ensures consistent styling.

**Key decisions & constraints**:
- Roundabout is a new intersection type, not a standalone element — it plugs into the existing `intersections[]` array in configs
- Rendered as a filled circle (island) with a dashed inner lane ring; approach roads connect via the existing road system
- Yield signs auto-placed at each approach using the same `stopLines[]` pattern (reuse signal positioning logic)
- No animated traffic flow — static diagram only

**Scope boundaries** (what this does NOT include):
- No multi-lane roundabouts (single lane only for v1)
- No builder drag-and-drop support yet — config-only
- No new config section — roundabouts live inside `intersections[]` with `type: "roundabout"`

**Files affected** (overview — WP-level detail below):

| Area | Files | Change type |
|------|-------|-------------|
| Primitives | `src/primitives.js` | Edit — add `Intersections.roundabout()` drawing function |
| Orchestrator | `src/diagram.js` | Edit — handle `type: "roundabout"` in intersection rendering step |
| Defaults | `src/diagram.js` (`applyDefaults`) | Edit — add default radius, lane width, and approach angles for roundabouts |
| Config | `src/configs/Roundabout_1.json` | New — example roundabout diagram |
| Build | `scripts/build-diagrams.js` | No change (auto-discovers configs) |

<details>
<summary><h4 style="display:inline">0.1 WP1: Primitive — Roundabout Drawing Function — [0/4 Completed]</h4></summary>

**Key file**: `src/primitives.js` — add a `roundabout(svg, cx, cy, opts)` method to the `Intersections` IIFE.

**Rendering approach**: Draw three concentric circles: outer road edge (dark grey fill), lane ring (light grey, dashed stroke), and center island (green fill). Use the same `SVG.circle()` and `SVG.path()` helpers already used by other primitives. The `opts` object accepts `radius`, `laneWidth`, and `islandColor`.

**Integration with roads**: Each approach road's endpoint should terminate at the outer edge of the roundabout circle. The `approach` direction in `stopLines[]` determines where yield signs are placed — reuse the existing angle-from-approach calculation in `Intersections`.

| # | Step | Status |
|---|------|--------|
| 1 | Add `Intersections.roundabout(svg, cx, cy, opts)` in `src/primitives.js`. Draw outer circle, lane ring, and island. Use existing `SVG.circle()` helper. Test by temporarily hardcoding a call in `diagram.js` | pending |
| 2 | Add approach connector arcs — for each road meeting the roundabout, draw a short curved entry/exit path from the road endpoint to the lane ring. Use `SVG.path()` with arc commands | pending |
| 3 | Add yield sign placement — reuse the stop-line angle logic to position small yield triangles at each approach. Follow the pattern of `Signals.stopSign()` for the SVG shape | pending |
| 4 | Test rendering: create a minimal test config with a roundabout and two roads, open in `viewer.html`, verify visual output. Run `node scripts/build-diagrams.js Roundabout_1` to confirm PNG export | pending |

</details>


<details>
<summary><h4 style="display:inline">0.2 WP2: Defaults & Config Integration — [0/3 Completed]</h4></summary>

**Key file**: `src/diagram.js` — extend `applyDefaults()` to handle roundabout-type intersections, and update the render pipeline to call the new primitive.

**Defaults to add**: In the intersection defaults transform, if `type === "roundabout"`, apply: `radius: 60`, `laneWidth: 20`, `islandColor: "#8BC34A"`. These can be overridden per-intersection in the config JSON.

| # | Step | Status |
|---|------|--------|
| 1 | In `applyDefaults()` intersection transform, detect `type: "roundabout"` and merge default values for `radius`, `laneWidth`, `islandColor`. Ensure existing intersection types are unaffected | pending |
| 2 | In `Diagram.render()`, update the intersection rendering step: if `type === "roundabout"`, call `Intersections.roundabout()` instead of the default cross-intersection renderer | pending |
| 3 | Create `src/configs/Roundabout_1.json` with a 4-approach roundabout. Include two roads (N-S and E-W) meeting at the roundabout center. Run `node scripts/build-diagrams.js Roundabout_1` and verify the PNG | pending |

</details>


<details>
<summary><h4 style="display:inline">0.3 WP3: Builder Support — [0/3 Completed]</h4></summary>

**Files touched**: `src/builder/tools.js` (placement mode), `src/builder/props.js` (property panel), `src/builder/overlay.js` (hit target).

| # | Step | Status |
|---|------|--------|
| 1 | Add a "Roundabout" option to the intersection type dropdown in `src/builder/props.js`. When selected, show radius/laneWidth/islandColor fields instead of the standard intersection fields | pending |
| 2 | In `src/builder/overlay.js`, add a circular hit target for roundabout intersections (instead of the default rectangular one). Use the roundabout's `radius` for the hit circle size | pending |
| 3 | In `src/builder/tools.js`, add a roundabout placement mode: click to place center point, then the intersection is created with default values. Test in `builder.html` — place a roundabout, edit its properties, verify re-render | pending |

</details>

</details>

---

<details>
<summary><h3 style="display:inline">1. Codebase Audit — Config Architecture & Engine Improvements — [8/8 Completed]</h3></summary>

> Audit findings and recommendations for making the config format more elegant, reducing duplication, and preparing the engine for growth.

**Goal**: Refactor the config format and engine internals so diagrams are easier to author, B&W variants don't require full duplication, multi-page layouts are intuitive, and the codebase is ready for a future front-end builder.

**Key decisions & constraints**:
- All changes must be backward-compatible with existing configs (no breakage)
- Builder UI is out of scope for now, but everything should be structured so a builder can consume it later
- Every canvas should be proportioned to 8.5×11 paper (portrait or landscape), with multi-canvas stitching for larger images
- The zoom/scale feature exists so we can zoom in on details (e.g. 2× a single intersection across 4 pages)

**Scope boundaries** (what this does NOT include):
- No builder UI work
- No new diagram primitives (roundabouts, crosswalks, etc.)
- No migration script for existing configs (changes are backward-compatible)

**Files affected** (overview):

| Area | Files | Change type |
|------|-------|-------------|
| Engine | `src/diagram.js` | Edit — config inheritance, canvas orientation, deduplicate junctions, remove duplicate RESOLUTION_SCALE |
| Primitives | `src/primitives.js` | Edit — minor (RESOLUTION_SCALE is the source of truth) |
| Configs | `src/configs/*_BW.json` | Edit — replace full copies with `extends` stubs |
| Configs | All configs | Edit — add `id` to elements missing one |
| Build | `scripts/build-diagrams.js` | Edit — resolve `extends` before rendering |

<details>
<summary><h4 style="display:inline">1.1 WP1: Config Inheritance (`extends`) — [4/4 Completed]</h4></summary>

**Problem**: B&W configs (e.g. `4-Way_1_BW.json`) are 100% copies of the original with only `"style": "lineDraw"` added. Every edit must be made in two places.

**Solution**: Add an `extends` field. The engine loads the base config, deep-merges the override on top. This eliminates all duplication and enables any kind of variant (zoomed, with vehicles, alternate signals, etc.).

**Example** — `4-Way_1_BW.json` becomes:
```json
{
  "extends": "4-Way_1",
  "title": "Empty 4-Way Intersection (Line Drawing)",
  "style": "lineDraw"
}
```

**Key file**: `src/diagram.js` — add a `resolveExtends(rawCfg, loader)` function called before `applyDefaults()`. `loader` is a function that reads a config by name (different implementations for browser vs Node). In the build script, `loader` reads from the filesystem. In the viewer, `loader` reads from a preloaded map or fetches.

| # | Step | Status |
|---|------|--------|
| 1 | Add `resolveExtends(rawCfg, loader)` in `diagram.js`. Deep-merge base config with overrides (overrides win). Handle missing base gracefully. Support one level of inheritance (no chaining needed yet) | completed |
| 2 | Update `scripts/build-diagrams.js` to call `resolveExtends` before rendering. The `loader` reads JSON from the configs directory by stem name | completed |
| 3 | Update `src/viewer.html` to support `extends` — preload all configs or fetch on demand | completed |
| 4 | Convert all `_BW.json` configs to use `extends`. Verify output PNGs are identical before and after. Delete duplicated content | completed |

</details>

<details>
<summary><h4 style="display:inline">1.2 WP2: Canvas Orientation (Portrait/Landscape) — [3/3 Completed]</h4></summary>

**Problem**: Default pane dimensions are 1057×817 (landscape 8.5×11). There's no way to declare portrait without manually setting `paneWidth: 817, paneHeight: 1057`.

**Solution**: Add `canvas.orientation` — `"landscape"` (default) or `"portrait"`. When portrait, the engine swaps `BASE_PANE_W` and `BASE_PANE_H` before applying canvas defaults.

| # | Step | Status |
|---|------|--------|
| 1 | In `applyCanvasDefaults()`, check `cfg.canvas.orientation`. If `"portrait"`, swap the default pane dimensions before applying. Preserve any explicit `paneWidth`/`paneHeight` overrides | completed |
| 2 | Add a comment documenting the 8.5×11 aspect ratio and the orientation toggle | completed |
| 3 | Create a test config `Stop_1_Portrait.json` to verify portrait rendering. Run build, confirm dimensions | completed |

</details>

<details>
<summary><h4 style="display:inline">1.3 WP3: Named Reference Points — [3/3 Completed]</h4></summary>

**Problem**: When two elements need to share a coordinate (e.g. two roads passing through the same point, a vehicle placed at a specific landmark), the coordinate is duplicated. Changing it requires updating multiple places.

**Solution**: Add an optional `references` section to configs. Each reference is a named point with `x`/`y` (or `xPane`/`yPane`). Other elements can reference them using `"@refName"` or `"@refName.x"` syntax.

**Example**:
```json
{
  "references": {
    "schoolZone": { "xPane": 0.3, "yPane": 0.7 }
  },
  "roads": [
    { "id": "mainSt", "orientation": "vertical", "center": "@schoolZone.x" }
  ]
}
```

**Scope**: Named lookups only — no expression evaluation (`@point.x + 100`). Keep it simple. Resolve references early in the defaults pipeline, before any other stage runs.

| # | Step | Status |
|---|------|--------|
| 1 | Add `resolveReferences(cfg)` as the first step in `applyDefaults()`. Walk the config tree and replace any string value starting with `@` with the resolved coordinate. Resolve `xPane`/`yPane` to pixels using canvas dimensions | completed |
| 2 | Extend `resolveRef()` in `applyRoadDefaults` to also check the references map, so roads can use `"center": "@refName"` alongside existing road/lot references | completed |
| 3 | Create a test config demonstrating two roads sharing a reference point. Move the reference, verify both roads update | completed |

</details>

<details>
<summary><h4 style="display:inline">1.4 WP4: Require IDs on All Elements — [2/2 Completed]</h4></summary>

**Problem**: Some parking lots and vehicles use array indices instead of IDs (`"parkingLot": 0`). This is fragile — reordering the array breaks references.

**Solution**: Add `id` to all top-level elements in existing configs. Keep array-index fallback working but prefer ID references everywhere.

| # | Step | Status |
|---|------|--------|
| 1 | Audit all configs and add `id` fields to any parking lot, intersection, or road missing one. Use descriptive names | completed |
| 2 | Update vehicle parking references in configs to use lot IDs instead of indices where possible (e.g. `"parkingLot": "lot1"` instead of `"parkingLot": 0`) | completed |

</details>

<details>
<summary><h4 style="display:inline">1.5 WP5: Engine Cleanup — [4/4 Completed]</h4></summary>

**Problem**: Several minor code quality issues that add friction as the codebase grows.

| # | Step | Status |
|---|------|--------|
| 1 | Remove duplicate `RESOLUTION_SCALE` from `diagram.js` — use the global from `primitives.js` instead. Remove `oddScale` if the odd-number constraint is unnecessary, or add a comment explaining why it exists | completed |
| 2 | Compute junction geometry once in `applyDefaults()`, store as `cfg._junctions`. Remove the duplicate computation in `render()` and `applyVehiclePositions()` | completed |
| 3 | Support top-level `signals[]` for standalone signal placement (crosswalk signals, speed signs, etc.) outside of intersections. Render them in the existing signals step | completed |
| 4 | Add a `page: [col, row]` property to roads, parking lots, and vehicles. When present, offset all pane-relative coordinates by the page position. This makes multi-page authoring explicit: `"centerPane": 0.5, "page": [1, 0]` places the road at the center of the second column | completed |

</details>

</details>

---

<details>
<summary><h3 style="display:inline">2. Export Overhaul — PNG + PDF Output with Print-Ready PDFs — [3/3 Completed]</h3></summary>

> Restructure the build output into `dist/png/` and `dist/pdf/` subdirectories. Add PDF export that produces print-ready 8.5×11 portrait pages — landscape diagrams are rotated 90° so they print correctly without manual orientation changes. Multi-pane configs (e.g. 2×2) produce multi-page PDFs, one pane per page.

**Goal**: Every config export produces both a PNG (full composite image, as today) and a PDF (print-optimized, one pane per page, always portrait 8.5×11).

**Key decisions & constraints**:
- PNGs go to `dist/png/`, PDFs go to `dist/pdf/` — flat structure within each
- PDF page size is always US Letter portrait (8.5 × 11 in = 612 × 792 pt)
- Single-pane landscape diagrams: rotate the image 90° so the long edge runs along the 11″ side, printing correctly in default portrait mode
- Single-pane portrait diagrams: no rotation needed, fit to page
- Multi-pane configs (columns × rows > 1): produce a multi-page PDF. Each pane becomes its own page. Page order: left-to-right, top-to-bottom (row-major). Each page follows the same rotation logic based on that individual pane's aspect ratio
- The composite PNG is still the full stitched image (unchanged behavior, just moved to `dist/png/`)
- Use `pdf-lib` (pure JS, no native deps) to assemble PDFs from the per-pane PNG images — avoids Puppeteer's `page.pdf()` which doesn't handle SVG-to-raster well

**Scope boundaries**:
- No changes to the rendering engine or config format
- No viewer UI changes (viewer PNG export stays as-is)
- Builder export is out of scope for now

**Files affected**:

| Area | Files | Change type |
|------|-------|-------------|
| Build script | `scripts/build-diagrams.js` | Edit — output to subdirs, add per-pane capture, add PDF assembly |
| Dependencies | `package.json` | Edit — add `pdf-lib` |
| Docs | `CLAUDE.md` | Edit — update output paths in build docs |
| Git | `.gitignore` | Check — ensure `dist/` is still ignored |

<details>
<summary><h4 style="display:inline">2.1 WP1: Restructure PNG Output into Subdirectory — [2/2 Completed]</h4></summary>

**Key file**: `scripts/build-diagrams.js`

Change `OUTPUT_DIR` from `dist/` to `dist/png/`. Update `fs.mkdirSync` to create the nested directory. Update the console output and CLAUDE.md references.

| # | Step | Status |
|---|------|--------|
| 1 | Change the PNG output path from `dist/` to `dist/png/`. Update `mkdirSync`, `outPath`, and the "Done" message. Verify existing PNG export still works | completed |
| 2 | Update CLAUDE.md to reflect new output paths (`dist/png/` and `dist/pdf/`) | completed |

</details>

<details>
<summary><h4 style="display:inline">2.2 WP2: Per-Pane Image Capture — [3/3 Completed]</h4></summary>

**Key file**: `scripts/build-diagrams.js`

For PDF generation, we need individual images of each pane (not the full composite). After rendering the full SVG, use the resolved config's `canvas.columns` and `canvas.rows` (defaulting to 1×1) to determine the pane grid. For each pane, capture a cropped region of the rendered image.

**Approach**: After the existing full-image PNG capture, use Puppeteer's `page.evaluate()` to draw cropped regions of the SVG onto separate canvases — one per pane. Each pane image is `paneWidth × paneHeight` pixels, clipped from the full SVG at the appropriate grid offset.

| # | Step | Status |
|---|------|--------|
| 1 | After rendering, read `columns` and `rows` from the resolved config's canvas object (default 1×1). Compute per-pane pixel dimensions from the full SVG size: `paneW = svgWidth / columns`, `paneH = svgHeight / rows` | completed |
| 2 | For each pane `[col, row]`, capture a cropped PNG by drawing the relevant region of the full image onto a new canvas of size `paneW × paneH`. Return an array of base64 PNG strings alongside the full composite PNG | completed |
| 3 | For single-pane diagrams (1×1), skip the per-pane capture — the full PNG is the only pane | completed |

</details>

<details>
<summary><h4 style="display:inline">2.3 WP3: PDF Assembly — [4/4 Completed]</h4></summary>

**Key files**: `scripts/build-diagrams.js`, `package.json`

Use `pdf-lib` to create a PDF document. For each pane image, create a US Letter portrait page (612 × 792 pt) and embed the pane PNG. If the pane is landscape (wider than tall), rotate it 90° on the page so the image fills the page correctly for default portrait printing.

**Rotation logic**:
- Pane aspect ratio > 1 (landscape): rotate 90° CW. Scale the image so its width (now running along the 11″ side) fits 792 pt, and its height fits 612 pt. Maintain aspect ratio, center on page.
- Pane aspect ratio ≤ 1 (portrait): no rotation. Scale to fit within 612 × 792 pt, maintain aspect ratio, center on page.
- Add a small margin (~18 pt / 0.25″) on all sides to avoid edge clipping when printing.

| # | Step | Status |
|---|------|--------|
| 1 | `npm install pdf-lib` and add to `package.json` dependencies | completed |
| 2 | Add a `buildPdf(stem, paneImages, paneW, paneH)` function. Create a `PDFDocument`, iterate pane images, embed each as a PNG, create a portrait Letter page, apply rotation/scaling logic, draw the image, and save to `dist/pdf/{stem}.pdf` | completed |
| 3 | Integrate `buildPdf` into the main build loop — call it after PNG export for each config. Log the PDF output with page count: `✓ Stem.pdf  (N pages)` | completed |
| 4 | Test with single-pane landscape (e.g. `4-Way_1`), single-pane portrait (e.g. `Stop_1_Portrait`), and multi-pane configs. Verify each PDF opens, prints correctly in portrait mode, and multi-pane PDFs have the right page count and order | completed |

</details>

</details>

---