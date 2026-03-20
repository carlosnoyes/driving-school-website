# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JSON-driven SVG diagram engine for creating driving school intersection and parking lot diagrams. Diagrams are fully defined by JSON config files and rendered as SVG in the browser.

## Development

Serve static files and open `src/viewer.html` for interactive editing. VS Code Live Server is configured on port 5501.

### PNG Export

Run `node scripts/build-diagrams.js` to export all configs as PNGs into `dist/`. Pass config names to build a subset:

```
node scripts/build-diagrams.js                    # all configs
node scripts/build-diagrams.js Parking_3 Stop_1   # specific configs only
```

Requires `npm install` (Puppeteer).

### IMPORTANT: Rebuild After Changes

Whenever you edit files, you MUST re-run the build script:

- **Config change** (any file in `src/configs/`): run `node scripts/build-diagrams.js <changed_config_names>` for only the affected configs.
- **Engine change** (`src/diagram.js`, `src/primitives.js`, or `scripts/build-diagrams.js`): run `node scripts/build-diagrams.js` with no arguments to rebuild ALL diagrams.

## Architecture

### Rendering Pipeline

Two core files power the engine:

- **`src/primitives.js`** — IIFE modules exposing SVG drawing primitives on `window`: `SVG`, `Terrain`, `Roads`, `Intersections`, `Vehicles`, `Signals`, `Parking`, `Compass`
- **`src/diagram.js`** — Orchestrates rendering via `Diagram.render()`: background → roads → parking lots → connectors → intersections → signals/stop lines → vehicles → decorations

### JSON Config Structure

Configs live in `src/configs/`. Each defines a complete diagram with sections: `canvas`, `defaults`, `roads`, `intersections`, `parkingLots`, `connectors`, `entrances`, `vehicles`, `decorations`. Stop lines and signals are sub-elements of `intersections[].stopLines[]` — each stop line has an `approach` direction and an optional `signal` object.

#### Canvas Object

The `canvas` object controls the diagram layout:

- `paneWidth` / `paneHeight` — single pane dimensions (default 1057 x 817)
- `columns` / `rows` — grid of panes (default 1 x 1). Total canvas = paneWidth x columns, paneHeight x rows
- `zoom` — scale factor for the viewBox (default 1). Also supported as legacy top-level `zoom`
- `grid` — show light grey dashed lines between panes (default false)
- `compass` — show compass rose (default true). Also supported as legacy top-level `compass`

#### Pane-Relative Positioning

Roads and parking lots support pane-relative coordinates as alternatives to pixel values:

- Roads: `centerPane`, `fromPane`, `toPane` — multiplied by the appropriate pane dimension and divided by zoom
- Parking lots: `xPane`, `yPane` — multiplied by paneWidth/paneHeight and divided by zoom

Example: `centerPane: 0.5` places a road at the center of the first pane. `centerPane: 1.5` places it at the center of the second pane (in a multi-column layout).

### Key Patterns

- **Defaults pipeline**: `applyDefaults()` runs 9 focused transform functions in sequence: canvas → parking → roads → intersections → entrances → vehicles → stop lines → signals → vehicle positions
- **Auto-derivation**: Intersection centers, stop line positions, and signal positions are auto-calculated from the intersection's roads and `approach` direction — many coordinates are optional
- **No module bundler**: Plain JS with IIFE pattern, scripts attached to `window`

### Builder (`src/builder.html`)

Interactive diagram editor with drag-and-drop. Code is split into focused modules in `src/builder/`:

- `state.js` — shared state, undo/redo, utilities
- `canvas.js` — sizing, zoom, render loop
- `overlay.js` — hit-targets, selection highlight
- `elements.js` — left sidebar element list
- `props.js` — right sidebar property panels, intersection detection
- `drag.js` — mouse drag, arrow-key nudge
- `tools.js` — placement modes, vehicle snap
- `io.js` — import/export JSON/PNG, JSON editor

### Viewer UI (`src/viewer.html`)

Dropdown preset selector, custom JSON file loader, live JSON editor panel with real-time re-rendering, and PNG export.
