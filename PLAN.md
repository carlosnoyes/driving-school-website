# Refactor Plan: Align JS Architecture with Builder UX

## Problem Summary

The builder HTML is cleanly structured — toolbar, element list, canvas, properties panel, status bar — each section has a clear purpose and boundary. The JavaScript behind it doesn't match that clarity:

- **builder.js is a 1,470-line monolith** — state management, rendering, drag logic, property panels, vehicle snapping, intersection detection, import/export all live in one IIFE
- **Duplicated logic** — vehicle positioning is computed independently in both `builder.js` (for overlay hit targets) and `diagram.js` (for rendering). Road width, intersection geometry, parking stall coordinates are all calculated in multiple places
- **`applyDefaults()` is a 370-line mega-function** — it handles roads, parking lots, intersections, vehicles, stop lines, and signals in one pass. Hard to understand, hard to test
- **Fragile linking** — vehicles reference parking lots by array index (`parkingLot: 0`) but roads by string ID (`road: "road_1"`). Inconsistent, error-prone when elements are reordered or deleted

## Design Principles

1. **Mirror the HTML** — each visual section of the builder maps to a JS module with clear inputs/outputs
2. **Single source of truth** — compute derived values once, in one place, and share them
3. **ID-based linking everywhere** — no array indices for cross-references
4. **Small focused functions** — each does one thing; composition over monoliths

## Refactor Steps

### Phase 1: Extract builder.js into focused modules

Split the monolith into files that match the UX sections. Each is a small IIFE on `window`, same pattern as primitives.js — no bundler needed.

| New file | Responsibility | Lines from builder.js |
|---|---|---|
| `builder/state.js` | Config state, undo/redo, `mutate()`, `deepClone()` | ~80 lines |
| `builder/canvas.js` | Canvas sizing, zoom, fit, scroll, grid overlay | ~100 lines |
| `builder/overlay.js` | Hit-target rects, selection highlight, SVG overlay | ~120 lines |
| `builder/drag.js` | Mouse drag logic, nudge (arrow keys), linked-element movement | ~140 lines |
| `builder/props.js` | Right-sidebar property panels (road, lot, intersection, vehicle, compass, canvas) | ~350 lines |
| `builder/elements.js` | Left-sidebar element list, selection | ~60 lines |
| `builder/tools.js` | Toolbar modes (addRoad, addLot, addVehicle), click-to-place, vehicle snap | ~150 lines |
| `builder/io.js` | Import/export JSON/PNG, JSON editor panel | ~100 lines |
| `builder.js` | Thin init: wire modules together, bind events | ~60 lines |

**Key rule**: Each module exposes a small public API. Dependencies flow one way: `state` is the root, other modules read/write through it.

### Phase 2: Break up applyDefaults into a pipeline

Replace the single `applyDefaults()` function with a sequence of focused transforms. Each one handles one config section and returns the enriched config.

```
applyDefaults(raw)
  -> applyCanvasDefaults(cfg)
  -> applyParkingDefaults(cfg, defaults)     // lot dimensions, entrances, row offsets
  -> applyRoadDefaults(cfg, defaults)        // resolve refs, fill from/to/laneWidth
  -> applyIntersectionDefaults(cfg, roads)   // derive centers, blocked sides
  -> applyEntranceDefaults(cfg, roads)       // derive center/shoulder from road
  -> applyVehicleDefaults(cfg)               // size presets
  -> applyStopLineDefaults(cfg, roads)       // positions from intersection geometry
  -> applySignalDefaults(cfg, roads)         // positions from intersection geometry
```

Each function is ~30-60 lines. Easy to read, easy to test, easy to extend.

### Phase 3: Eliminate duplicated position logic

The overlay (hit targets) and vehicle snap in builder.js independently recalculate positions that `applyDefaults` already computes. After Phase 2, these should **read from the processed config** instead of recomputing:

- `getVehiclePos()` -> read `state.processed.vehicles[i]._cx, ._cy` (computed by applyDefaults)
- Overlay hit rects for lots -> already uses `state.processed` (good), extend to roads/intersections
- Vehicle snap -> use processed parking lot geometry directly

This removes ~100 lines of duplicated math from builder.js.

### Phase 4: Consistent ID-based linking

Change vehicles to reference parking lots by ID instead of array index:

```json
// Before (fragile)
{ "parkingLot": 0, "row": 0, "stall": 3 }

// After (robust)
{ "parkingLot": "lot_1", "row": 0, "stall": 3 }
```

This matches how vehicles already reference roads (`"road": "road_1"`). Update `applyDefaults`, `renderStallVehicle`, and the builder property panel.

Similarly, give intersections stable IDs (they already have generated ones like `ix_road_1_road_2`) and use those consistently.

### Phase 5: Builder event bus (optional, if needed)

If module-to-module communication gets messy, add a simple event bus:

```js
const Bus = (() => {
  const listeners = {};
  return {
    on(event, fn) { (listeners[event] ||= []).push(fn); },
    emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); },
  };
})();
```

Events: `configChanged`, `selectionChanged`, `modeChanged`. This decouples modules — props panel listens for `selectionChanged` instead of being called directly by overlay click handler.

**Only add this if the direct function calls between modules become unwieldy.** Start without it.

## Execution Order

1. **Phase 2 first** (applyDefaults pipeline) — highest impact, zero UI changes, easy to verify by running existing configs
2. **Phase 3** (deduplicate positions) — directly enabled by Phase 2
3. **Phase 4** (ID-based linking) — small, focused change
4. **Phase 1** (split builder.js) — biggest file change but purely structural, no logic changes
5. **Phase 5** (event bus) — only if Phase 1 reveals the need

## Validation

After each phase:
- All existing configs in `src/configs/` render identically (run `node scripts/build-diagrams.js` and compare PNGs)
- Builder: add road, add lot with entrance, add vehicle, drag, undo/redo, import/export all work
- JSON editor round-trips cleanly (export -> import -> export produces identical JSON)
