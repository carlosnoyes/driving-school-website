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

Configs live in `src/configs/`. Each defines a complete diagram with sections: `canvas`, `zoom`, `defaults`, `roads`, `intersections`, `parkingLots`, `connectors`, `entrances`, `vehicles`, `decorations`. Stop lines and signals are sub-elements of `intersections[].stopLines[]` — each stop line has an `approach` direction and an optional `signal` object.

### Key Patterns

- **Zoom scaling**: `applyDefaults()` multiplies all positional/dimensional values by the `zoom` factor
- **Auto-derivation**: Intersection centers, stop line positions, and signal positions are auto-calculated from the intersection's roads and `approach` direction — many coordinates are optional
- **No module bundler**: Plain JS with IIFE pattern, scripts attached to `window`

### Viewer UI (`src/viewer.html`)

Dropdown preset selector, custom JSON file loader, live JSON editor panel with real-time re-rendering, and PNG export.
