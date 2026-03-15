# Diagram Builder — Interactive Editor

## Goal

Create `src/builder.html` — a full interactive diagram editor that lets users visually construct driving school diagrams by adding, configuring, and arranging elements via drag-and-drop and property panels. Outputs the same JSON config format consumed by the existing rendering engine.

---

## Architecture Overview

```
builder.html
  ├── primitives.js  (existing, unchanged)
  ├── diagram.js     (existing, unchanged)
  ├── builder.js     (NEW — editor state, interaction, auto-derivation)
  └── builder.css    (NEW — editor layout and styling)
```

**Key principle:** The builder maintains a *model* (the JSON config). On every change, it regenerates the config and calls `Diagram.render()` to re-draw. We overlay transparent hit-targets on top of the SVG for selection and dragging. The existing engine is NOT modified — the builder is a layer on top.

---

## Phase 1: Editor Shell & State Management

### 1.1 — HTML Layout (`src/builder.html`)
- **Toolbar** (top): Add Road, Add Parking Lot, Add Vehicle, Toggle Compass, Zoom slider, Import JSON, Export JSON, Export PNG
- **Canvas area** (center): SVG rendering + interaction overlay
- **Properties panel** (right sidebar): Context-sensitive form that changes based on selected element
- **Element list** (left sidebar, collapsible): Tree view of all elements (roads, lots, intersections, vehicles)

### 1.2 — State Manager (`EditorState` class in `builder.js`)
- Holds the current diagram config as a plain JS object
- Every mutation goes through `EditorState.update(path, value)` → triggers re-render
- Undo/redo stack (store config snapshots, cap at ~50)
- `EditorState.toJSON()` / `EditorState.fromJSON(json)` for import/export
- Auto-assigns unique IDs to new elements (e.g., `road_1`, `lot_1`, `ix_1`)

### 1.3 — Render Loop
- On any state change: `Diagram.render(container, config)` replaces the SVG
- After render: overlay hit-targets (transparent rects/circles) positioned over each element
- Hit-targets carry `data-type` and `data-id` attributes for identification

---

## Phase 2: Roads

### 2.1 — Add Road
- Click "Add Road" button → enters placement mode
- Click on canvas to place road center point
- Road created with defaults: `orientation: "vertical"`, `lanesPerDirection: 1`, extends full canvas
- Road gets a unique ID (e.g., `road_1`)

### 2.2 — Road Properties Panel
When a road is selected, the panel shows:
- **ID** (editable text)
- **Orientation** (toggle: vertical / horizontal)
- **Center** (number input — position on perpendicular axis)
- **From / To** (number inputs — start/end along road axis, or "edge" for canvas boundary)
- **Lanes per direction** (1–4 spinner)
- **Lane width** (number, default 50)
- **Center line style** (dropdown: dashed-yellow, solid-yellow, double-yellow, solid, none)
- **Lane line style** (dropdown: dashed, solid, none)
- **Shoulder** (number, -1 = none)
- **Median** (number, 0 = none)
- **Road color** (color picker)

### 2.3 — Road Dragging
- Drag road perpendicular to its orientation to change `center`
- Drag road endpoints to change `from`/`to`
- All connected intersections, entrances update automatically (they reference road IDs)

---

## Phase 3: Parking Lots

### 3.1 — Add Parking Lot
- Click "Add Parking Lot" → click canvas to place center
- Opens parking lot config dialog/panel:
  - **Rows**: add/remove rows, each with:
    - Type: single / double
    - Orientation: horizontal / vertical
    - Stalls count
    - Stall width, stall depth
    - Splits (driving lane positions)
  - **Lane gap** (driving aisle width)
  - **Edge margin** (close / far / custom)
- Lot dimensions auto-calculate from rows (same as existing engine)

### 3.2 — Parking Lot Dragging
- Drag lot to reposition (updates `x`, `y`)
- Connected entrance roads move with the lot

### 3.3 — Add Entrance to Lot
- Select a parking lot → "Add Entrance" button in panel
- Choose side (N/S/E/W) and position (-1 to 1)
- **Auto-road creation**: When an entrance is added:
  1. A new road element is created automatically
  2. Road orientation is orthogonal to the entrance side (e.g., entrance on "north" → vertical road going north)
  3. Road `center` aligns with the entrance position
  4. Road `from` = lot edge, road `to` = canvas edge
  5. An `entrances[]` config entry is created linking the road to the lot
  6. A `connectors[]` entry bridges the gap if needed
- The auto-created road is fully editable like any other road

---

## Phase 4: Auto-Intersections

### 4.1 — Intersection Detection
After every state change, run intersection detection:
- For each pair of roads (one vertical, one horizontal):
  - Compute crossing point: `(vertical.center, horizontal.center)`
  - Check if crossing point is within both roads' `from`/`to` ranges
  - If crossing exists and no intersection registered → auto-create intersection
  - If intersection exists but roads no longer cross → auto-remove intersection
- Intersection type:
  - If both roads extend through → `fourWay`
  - If one road ends at the crossing → `tJunction` (blocked side = direction road doesn't extend)

### 4.2 — Intersection Properties Panel
When intersection is selected:
- **Type** (auto-derived, read-only display)
- **Roads** (read-only, shows which roads form it)
- **Radius** (curb corner radius)
- **Curb color/width**
- **Stop Lines** section:
  - Add/remove stop lines per approach (N/S/E/W)
  - Each: offset, color, width
- **Signals** section:
  - Add/remove signals per approach
  - Type: traffic light / stop sign / lane arrow
  - Traffic light: active color, which lanes
  - Stop sign: scale, rotation
  - Lane arrow: direction, color, scale

### 4.3 — Intersection Movement
- Intersections are NOT directly draggable — they move when their roads move
- Moving a road automatically repositions all intersections on that road
- Stop lines and signals auto-reposition (they're defined relative to the intersection)

---

## Phase 5: Vehicles

### 5.1 — Add Vehicle
- Click "Add Vehicle" → click canvas to place
- Smart snapping:
  1. If clicked near a road lane → snap to lane center, assign `road`, `side`, `lane`, `t`
  2. If clicked near a parking stall → snap to stall center, assign `parkingLot`, `row`, `stall`
  3. Otherwise → place at absolute `x`, `y` with `direction: "north"`

### 5.2 — Vehicle Properties Panel
- **Placement mode** (toggle): Road / Parking Stall / Absolute
- Road mode: road selector, side, lane, t (slider 0–1)
- Stall mode: lot selector, row, stall, subRow
- Absolute mode: x, y, direction, rotation
- **Color** (dropdown of presets + custom hex)
- **Size** (small / medium / large / custom w×h)

### 5.3 — Vehicle Dragging
- Drag vehicle along road (updates `t`)
- Drag vehicle between lanes (updates `lane`/`side`)
- Drag vehicle off-road → switches to absolute placement
- Drag to parking stall → snaps and switches to stall placement
- Rotation handle (circular drag) for manual angle

---

## Phase 6: Zoom & Canvas

### 6.1 — Zoom Control
- Zoom slider in toolbar (range 0.25–4, step 0.05, default 1)
- Updates `config.zoom` and re-renders
- Mouse wheel zoom (Ctrl+scroll) centered on cursor
- Zoom indicator label showing current %

### 6.2 — Canvas Configuration
- Canvas width/height inputs in a settings panel
- Pan support: drag on empty canvas area to pan view (CSS transform, not config change)

---

## Phase 7: Compass

### 7.1 — Toggle Compass
- Toolbar button toggles compass on/off
- When on: `config.compass` = `{ x, y, size }` (default bottom-right)
- When off: `config.compass` = `false`
- Compass is draggable to reposition
- Size slider in properties panel when selected

---

## Phase 8: Import / Export

### 8.1 — Import JSON
- "Import" button → file picker for `.json`
- Parse → validate (check required fields) → load into EditorState
- Also support paste-from-clipboard into a modal textarea

### 8.2 — Export JSON
- "Export JSON" button → download current config as `.json`
- Pretty-printed with 2-space indent
- Strips internal fields (anything starting with `_`)
- Also copy-to-clipboard option

### 8.3 — Export PNG
- "Export PNG" button → same SVG-to-Canvas-to-PNG pipeline as viewer.html
- Filename from config title

---

## Phase 9: Selection & Interaction System

### 9.1 — Selection
- Click element → select it (blue highlight outline)
- Click empty space → deselect
- Selected element's properties shown in right panel
- Delete key → remove selected element (with confirmation for elements that have dependents)

### 9.2 — Hit Testing
- After each render, create an invisible overlay `<svg>` with hit-target shapes:
  - Roads: transparent rectangle over road extent
  - Parking lots: transparent rectangle over lot bounds
  - Intersections: transparent rectangle over junction area
  - Vehicles: transparent rectangle over car bounds
  - Compass: transparent circle
- Each hit-target has `data-type`, `data-id`, `pointer-events: all`
- Underlying diagram SVG has `pointer-events: none`

### 9.3 — Drag & Drop
- `mousedown` on hit-target → start drag
- `mousemove` → update element position in config, re-render
- `mouseup` → finalize position
- Throttle re-renders during drag to ~30fps for smoothness
- Show position tooltip during drag

### 9.4 — Keyboard Shortcuts
- `Delete` / `Backspace` → delete selected
- `Ctrl+Z` → undo
- `Ctrl+Shift+Z` / `Ctrl+Y` → redo
- `Ctrl+S` → export JSON
- `Ctrl+C` → copy selected element config
- `Ctrl+V` → paste element
- `Escape` → deselect / cancel placement mode
- Arrow keys → nudge selected element by 1px (Shift+arrow = 10px)

---

## Phase 10: Polish & UX

### 10.1 — Visual Feedback
- Hover highlights on elements
- Placement mode: ghost preview follows cursor
- Snap guides: dotted lines when aligning with other elements
- Selection: blue dashed outline around selected element

### 10.2 — Validation
- Warn if roads overlap without intersection
- Warn if vehicle is off-canvas
- Warn if parking lot has no entrances

### 10.3 — Responsive Layout
- Sidebar collapses on narrow screens
- Canvas auto-fits available space
- Min-width ~1024px for full editor experience

---

## Implementation Order

| Step | What | Files | Depends On |
|------|------|-------|------------|
| 1 | Editor shell: HTML layout, CSS, empty state manager | `builder.html`, `builder.css`, `builder.js` | — |
| 2 | State manager: config CRUD, undo/redo, re-render loop | `builder.js` | Step 1 |
| 3 | Selection system: hit-targets, click-to-select, properties panel framework | `builder.js` | Step 2 |
| 4 | Roads: add, select, edit properties, drag to move | `builder.js` | Step 3 |
| 5 | Parking lots: add, configure rows, drag to move | `builder.js` | Step 3 |
| 6 | Parking lot entrances: add entrance → auto-create road + connector | `builder.js` | Steps 4, 5 |
| 7 | Auto-intersections: detect crossings, create/remove intersections | `builder.js` | Step 4 |
| 8 | Intersection editing: stop lines, signals via properties panel | `builder.js` | Step 7 |
| 9 | Vehicles: add, snap to lanes/stalls, drag, rotate | `builder.js` | Steps 4, 5 |
| 10 | Zoom & canvas config | `builder.js` | Step 2 |
| 11 | Compass toggle & drag | `builder.js` | Step 3 |
| 12 | Import/export JSON & PNG | `builder.js` | Step 2 |
| 13 | Keyboard shortcuts | `builder.js` | Step 3 |
| 14 | Polish: hover, ghosts, snap guides, validation | `builder.js` | All above |

---

## File Structure (Final)

```
src/
  primitives.js      (existing, unchanged)
  diagram.js         (existing, unchanged)
  viewer.html        (existing, unchanged)
  builder.html       (NEW — editor HTML shell)
  builder.css        (NEW — editor styles)
  builder.js         (NEW — editor logic, ~1500-2500 lines)
  configs/           (existing, unchanged)
```

## Technical Notes

- **No framework**: Plain JS, same pattern as existing code (IIFE modules on `window`)
- **No build step**: Single `builder.js` file, loaded via `<script>` tag
- **Re-render strategy**: Full re-render on every change via `Diagram.render()`. This is fast enough for interactive use since SVG generation is <50ms for typical diagrams.
- **Overlay approach**: Two stacked SVGs — bottom one is the rendered diagram (`pointer-events: none`), top one has invisible hit-targets (`pointer-events: all`). This avoids modifying the rendering engine.
- **Coordinate system**: The canvas uses a coordinate system where (0,0) can be configured. The builder works in the same coordinate space as the config, translating mouse positions using the SVG viewBox.
