// builder.js — Interactive diagram editor
// Depends on: primitives.js, diagram.js (Diagram.render, Diagram.applyDefaults)

(function () {
  'use strict';

  /* ================================================================
   *  CONSTANTS
   * ================================================================ */
  const SNAP_DISTANCE = 30;
  const MAX_UNDO = 50;
  const DRAG_THROTTLE_MS = 33; // ~30 fps

  /* ================================================================
   *  STATE
   * ================================================================ */
  const state = {
    config: {
      title: 'New Diagram',
      canvas: { width: 1057, height: 817 },
      zoom: 1,
      roads: [],
      intersections: [],
      parkingLots: [],
      connectors: [],
      entrances: [],
      vehicles: [],
      decorations: [],
      compass: { size: 30 },
    },
    selected: null,   // { type, index }
    mode: 'select',   // 'select' | 'addRoad' | 'addLot' | 'addVehicle'
    uiZoom: 1,        // builder viewport zoom (CSS scale, separate from config.zoom)
    showGrid: false,  // show canvas cell borders
    undoStack: [],
    redoStack: [],
    nextId: { road: 1, lot: 1, vehicle: 1 },
    processed: null,  // result of Diagram.applyDefaults
  };

  /* ================================================================
   *  UTILITIES
   * ================================================================ */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function genId(type) { return type + '_' + state.nextId[type]++; }

  /** Convert mouse event → SVG-space point using the overlay CTM. */
  function svgPoint(e) {
    const ov = document.getElementById('overlay');
    if (!ov || !ov.getScreenCTM()) return { x: 0, y: 0 };
    const pt = ov.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ov.getScreenCTM().inverse());
  }

  /** Half-width of a road (total width / 2). */
  function roadHalfWidth(r) {
    return Roads.roadWidth(
      r.laneWidth || 50,
      r.lanesPerDirection || 1,
      r.median || 0,
      r.shoulder
    ) / 2;
  }

  function setStatus(msg) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = msg;
  }

  /* ================================================================
   *  STATE MANAGEMENT  (undo / redo / mutate)
   * ================================================================ */
  function pushUndo() {
    state.undoStack.push(deepClone(state.config));
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
  }

  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(deepClone(state.config));
    state.config = state.undoStack.pop();
    syncNextIds();
    rerender();
  }

  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(deepClone(state.config));
    state.config = state.redoStack.pop();
    syncNextIds();
    rerender();
  }

  /** Make sure auto-ID counters stay above existing IDs. */
  function syncNextIds() {
    state.config.roads.forEach(r => {
      const m = r.id && r.id.match(/^road_(\d+)$/);
      if (m) state.nextId.road = Math.max(state.nextId.road, +m[1] + 1);
    });
    state.config.parkingLots.forEach(l => {
      const m = l.id && l.id.match(/^lot_(\d+)$/);
      if (m) state.nextId.lot = Math.max(state.nextId.lot, +m[1] + 1);
    });
    state.nextId.vehicle = Math.max(state.nextId.vehicle, (state.config.vehicles || []).length + 1);
  }

  /**
   * Wrap any config mutation: push undo, run fn(), detect intersections, re-render.
   */
  function mutate(fn) {
    pushUndo();
    fn();
    detectIntersections();
    rerender();
  }

  /* ================================================================
   *  RENDER
   * ================================================================ */
  function rerender() {
    const container = document.getElementById('diagram-container');
    container.innerHTML = '';
    try {
      state.processed = Diagram.applyDefaults(deepClone(state.config));
      Diagram.render(container, deepClone(state.config));
    } catch (e) {
      console.error('Render error:', e);
    }
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.pointerEvents = 'none';
      buildOverlay(svg);
    }
    fitCanvas();
    refreshElementList();
    refreshProps();
  }

  /** Size the SVG to fit the wrapper at zoom=1, scale up/down with zoom. */
  function fitCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    const svg = document.querySelector('#diagram-container svg');
    const ov = document.getElementById('overlay');
    if (!wrapper || !svg) return;

    const natW = state.config.canvas.width;
    const natH = state.config.canvas.height;
    const wrapW = wrapper.clientWidth;
    const wrapH = wrapper.clientHeight;

    // At zoom=1, fit the full diagram into the wrapper
    const fitScale = Math.min(wrapW / natW, wrapH / natH);
    const zoom = state.uiZoom || 1;
    const displayW = natW * fitScale * zoom;
    const displayH = natH * fitScale * zoom;

    // Set actual pixel dimensions — no CSS transform needed
    svg.setAttribute('width', displayW);
    svg.setAttribute('height', displayH);
    if (ov) {
      ov.setAttribute('width', displayW);
      ov.setAttribute('height', displayH);
    }

    // Scroll when larger than wrapper, otherwise no overflow
    wrapper.style.overflow = (displayW > wrapW || displayH > wrapH) ? 'auto' : 'hidden';
  }

  /* ================================================================
   *  OVERLAY  (transparent hit-targets stacked on top of the diagram)
   * ================================================================ */
  function buildOverlay(diagramSvg) {
    const ov = document.getElementById('overlay');
    ov.setAttribute('viewBox', diagramSvg.getAttribute('viewBox'));
    ov.setAttribute('width', diagramSvg.getAttribute('width'));
    ov.setAttribute('height', diagramSvg.getAttribute('height'));
    ov.innerHTML = '';

    const cfg  = state.config;
    const proc = state.processed;
    const cW   = cfg.canvas.width;
    const cH   = cfg.canvas.height;

    // — Roads —
    cfg.roads.forEach((r, i) => {
      const hw = roadHalfWidth(r);
      let x, y, w, h;
      if (r.orientation === 'vertical') {
        const from = r.from ?? 0;
        const to   = r.to   ?? cH;
        x = r.center - hw; y = from; w = hw * 2; h = to - from;
      } else {
        const from = r.from ?? 0;
        const to   = r.to   ?? cW;
        x = from; y = r.center - hw; w = to - from; h = hw * 2;
      }
      ov.appendChild(hitRect(x, y, w, h, 'road', i));
    });

    // — Parking lots —
    if (proc && proc.parkingLots) {
      proc.parkingLots.forEach((lot, i) => {
        if (lot._x != null) {
          ov.appendChild(hitRect(lot._x, lot._y, lot.width, lot.height, 'lot', i));
        }
      });
    }

    // — Intersections —
    cfg.intersections.forEach((ix, i) => {
      if (!ix.center) return;
      const r0 = cfg.roads.find(r => r.id === (ix.roads && ix.roads[0]));
      const r1 = cfg.roads.find(r => r.id === (ix.roads && ix.roads[1]));
      let hw = 40, hh = 40;
      if (r0 && r1) {
        const vr = r0.orientation === 'vertical' ? r0 : r1;
        const hr = r0.orientation === 'horizontal' ? r0 : r1;
        hh = roadHalfWidth(vr);
        hw = roadHalfWidth(hr);
      }
      ov.appendChild(hitRect(ix.center[0] - hh, ix.center[1] - hw, hh * 2, hw * 2, 'intersection', i));
    });

    // — Vehicles —
    cfg.vehicles.forEach((v, i) => {
      const pos = getVehiclePos(v);
      if (pos) ov.appendChild(hitRect(pos.x - 20, pos.y - 20, 40, 40, 'vehicle', i));
    });

    // — Compass —
    if (cfg.compass !== false) {
      const z = cfg.zoom || 1;
      const vbW = cW / z, vbH = cH / z;
      const comp = cfg.compass || {};
      const cx = comp.x ?? (vbW - (comp.margin ?? 50) / z);
      const cy = comp.y ?? (vbH - (comp.margin ?? 50) / z);
      ov.appendChild(hitRect(cx - 35, cy - 35, 70, 70, 'compass', 0));
    }

    // — Grid lines (canvas cell borders) —
    if (state.showGrid) {
      const NS = 'http://www.w3.org/2000/svg';
      const portrait = cW < cH;
      const cellW = portrait ? BASE_H : BASE_W;
      const cellH = portrait ? BASE_W : BASE_H;
      const cols = Math.round(cW / cellW);
      const rows = Math.round(cH / cellH);
      const gridStyle = { stroke: 'rgba(255,255,255,0.4)', 'stroke-width': '2', 'stroke-dasharray': '8,4', fill: 'none' };
      // Outer border
      const border = document.createElementNS(NS, 'rect');
      border.setAttribute('x', 0); border.setAttribute('y', 0);
      border.setAttribute('width', cW); border.setAttribute('height', cH);
      Object.entries(gridStyle).forEach(([k, v]) => border.setAttribute(k, v));
      border.style.pointerEvents = 'none';
      ov.appendChild(border);
      // Vertical dividers
      for (let c = 1; c < cols; c++) {
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('x1', c * cellW); ln.setAttribute('y1', 0);
        ln.setAttribute('x2', c * cellW); ln.setAttribute('y2', cH);
        Object.entries(gridStyle).forEach(([k, v]) => ln.setAttribute(k, v));
        ln.style.pointerEvents = 'none';
        ov.appendChild(ln);
      }
      // Horizontal dividers
      for (let r = 1; r < rows; r++) {
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('x1', 0); ln.setAttribute('y1', r * cellH);
        ln.setAttribute('x2', cW); ln.setAttribute('y2', r * cellH);
        Object.entries(gridStyle).forEach(([k, v]) => ln.setAttribute(k, v));
        ln.style.pointerEvents = 'none';
        ov.appendChild(ln);
      }
    }

    // Highlight selection
    if (state.selected) highlightSelected();
  }

  function hitRect(x, y, w, h, type, index) {
    const NS = 'http://www.w3.org/2000/svg';
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', Math.max(w, 10));
    r.setAttribute('height', Math.max(h, 10));
    r.setAttribute('fill', 'transparent');
    r.setAttribute('stroke', 'none');
    r.setAttribute('pointer-events', 'all');
    r.setAttribute('cursor', 'pointer');
    r.dataset.type  = type;
    r.dataset.index = index;
    return r;
  }

  function highlightSelected() {
    const ov  = document.getElementById('overlay');
    const sel = state.selected;
    if (!sel) return;
    const t = ov.querySelector(`[data-type="${sel.type}"][data-index="${sel.index}"]`);
    if (t) {
      t.setAttribute('stroke', '#2196F3');
      t.setAttribute('stroke-width', '3');
      t.setAttribute('stroke-dasharray', '8,4');
      t.setAttribute('fill', 'rgba(33,150,243,0.08)');
    }
  }

  /* ================================================================
   *  VEHICLE POSITION (for overlay hit-targets)
   * ================================================================ */
  function getVehiclePos(v) {
    if (v.x != null && v.y != null && !v.road && v.parkingLot == null) {
      return { x: v.x, y: v.y };
    }
    if (v.road) {
      const road = state.config.roads.find(r => r.id === v.road);
      if (!road) return null;
      const lw = road.laneWidth || 50;
      const laneOff = lw / 2 + (v.lane || 0) * lw;
      const t = v.t ?? 0.5;
      if (road.orientation === 'vertical') {
        const from = road.from ?? -state.config.canvas.height / 2;
        const to   = road.to   ??  state.config.canvas.height / 2;
        return {
          x: road.center + (v.side === 'right' ? laneOff : -laneOff),
          y: from + t * (to - from),
        };
      } else {
        const from = road.from ?? -state.config.canvas.width / 2;
        const to   = road.to   ??  state.config.canvas.width / 2;
        return {
          x: from + t * (to - from),
          y: road.center + (v.side === 'right' ? laneOff : -laneOff),
        };
      }
    }
    if (v.parkingLot != null && state.processed && state.processed.parkingLots) {
      const lot = state.processed.parkingLots[v.parkingLot];
      if (!lot) return null;
      const row = (lot.rows || [])[v.row || 0];
      if (!row) return null;
      const sw = row.stallWidth || 50;
      const sd = row.stallDepth || 100;
      const rx = row.x ?? lot._x + (row.offsetX || 0);
      const ry = row.y ?? lot._y + (row.offsetY || 0);
      const si = v.stall || 0;
      if (row.orientation === 'vertical') {
        let cx = rx + sd / 2;
        if (row.type === 'double' && v.subRow === 'right') cx = rx + sd * 1.5;
        return { x: cx, y: ry + si * sw + sw / 2 };
      } else {
        let cy = ry + sd / 2;
        if (row.type === 'double' && v.subRow === 'bottom') cy = ry + sd * 1.5;
        return { x: rx + si * sw + sw / 2, y: cy };
      }
    }
    return null;
  }

  /* ================================================================
   *  AUTO-DERIVATION  (intersection detection, entrance road creation)
   * ================================================================ */
  function detectIntersections() {
    const cfg = state.config;
    const vRoads = cfg.roads.filter(r => r.orientation === 'vertical');
    const hRoads = cfg.roads.filter(r => r.orientation === 'horizontal');
    const cW = cfg.canvas.width, cH = cfg.canvas.height;

    // Build set of currently-needed intersection keys
    const needed = new Set();
    const existing = new Map();
    cfg.intersections.forEach((ix, i) => {
      if (ix.roads) existing.set(ix.roads.slice().sort().join(','), i);
    });

    vRoads.forEach(vr => {
      hRoads.forEach(hr => {
        const cx = vr.center, cy = hr.center;
        const vFrom = Math.min(vr.from ?? 0, vr.to ?? cH);
        const vTo   = Math.max(vr.from ?? 0, vr.to ?? cH);
        const hFrom = Math.min(hr.from ?? 0, hr.to ?? cW);
        const hTo   = Math.max(hr.from ?? 0, hr.to ?? cW);

        if (cx >= hFrom && cx <= hTo && cy >= vFrom && cy <= vTo) {
          const key = [vr.id, hr.id].sort().join(',');
          needed.add(key);

          if (!existing.has(key)) {
            // Determine type
            const vHW = roadHalfWidth(vr), hHW = roadHalfWidth(hr);
            const tol = Math.max(vHW, hHW);
            let type = 'fourWay', blocked = null;

            if (Math.abs((vr.from ?? 0) - cy) < tol)       { blocked = 'north'; type = 'tJunction'; }
            else if (Math.abs((vr.to ?? cH) - cy) < tol)     { blocked = 'south'; type = 'tJunction'; }
            else if (Math.abs((hr.from ?? 0) - cx) < tol)  { blocked = 'west';  type = 'tJunction'; }
            else if (Math.abs((hr.to ?? cW) - cx) < tol)     { blocked = 'east';  type = 'tJunction'; }

            const ix = {
              id: 'ix_' + vr.id + '_' + hr.id,
              type,
              roads: [vr.id, hr.id],
              center: [cx, cy],
              radius: 25,
              stopLines: [],
              signals: [],
            };
            if (blocked) ix.blockedSide = blocked;
            cfg.intersections.push(ix);
          }
        }
      });
    });

    // Prune dead intersections
    cfg.intersections = cfg.intersections.filter(ix => {
      if (!ix.roads) return true;
      return needed.has(ix.roads.slice().sort().join(','));
    });

    // Update centers for existing intersections whose roads moved
    cfg.intersections.forEach(ix => {
      if (!ix.roads || ix.roads.length < 2) return;
      const r0 = cfg.roads.find(r => r.id === ix.roads[0]);
      const r1 = cfg.roads.find(r => r.id === ix.roads[1]);
      if (r0 && r1) {
        const vr = r0.orientation === 'vertical' ? r0 : r1;
        const hr = r0.orientation === 'horizontal' ? r0 : r1;
        ix.center = [vr.center, hr.center];
      }
    });
  }

  /**
   * Auto-create a road + entrance-junction when an entrance is added to a lot.
   */
  function createEntranceRoad(lotIndex, side) {
    const cfg = state.config;
    const lot = cfg.parkingLots[lotIndex];
    if (!lot) return null;

    // We need derived lot dimensions — run applyDefaults on a temp clone
    const tmp = Diagram.applyDefaults(deepClone(cfg));
    const pLot = tmp.parkingLots[lotIndex];
    if (!pLot) return null;

    const cx = lot.x ?? 0, cy = lot.y ?? 0;
    const halfW = pLot.width / 2, halfH = pLot.height / 2;
    const ent = (lot.entrances || [])[(lot.entrances || []).length - 1];
    const pos = ent ? (ent.position ?? 0) : 0;
    const cWidth = cfg.canvas.width, cHeight = cfg.canvas.height;
    const roadId = genId('road');

    let road;
    const bleed = 5; // extend past canvas edge to hide line ends
    if (side === 'north') {
      road = { id: roadId, orientation: 'vertical', center: cx + pos * halfW,
               from: -bleed, to: cy - halfH, lanesPerDirection: 1, laneWidth: 50, shoulder: 10 };
    } else if (side === 'south') {
      road = { id: roadId, orientation: 'vertical', center: cx + pos * halfW,
               from: cy + halfH, to: cHeight + bleed, lanesPerDirection: 1, laneWidth: 50, shoulder: 10 };
    } else if (side === 'west') {
      road = { id: roadId, orientation: 'horizontal', center: cy + pos * halfH,
               from: -bleed, to: cx - halfW, lanesPerDirection: 1, laneWidth: 50, shoulder: 10 };
    } else if (side === 'east') {
      road = { id: roadId, orientation: 'horizontal', center: cy + pos * halfH,
               from: cx + halfW, to: cWidth + bleed, lanesPerDirection: 1, laneWidth: 50, shoulder: 10 };
    }
    if (!road) return null;

    cfg.roads.push(road);
    cfg.entrances.push({ road: roadId, side });
    return roadId;
  }

  /* ================================================================
   *  PROPERTIES PANEL
   * ================================================================ */
  function refreshProps() {
    if (state.selected) {
      showProperties(state.selected.type, state.selected.index);
    } else {
      document.getElementById('props-content').innerHTML = '';
    }
  }

  function showProperties(type, index) {
    const panel = document.getElementById('props-content');
    panel.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'props-title';

    switch (type) {
      case 'road':
        title.textContent = 'Road ' + (index + 1); panel.appendChild(title); buildRoadPanel(panel, index); break;
      case 'lot':
        title.textContent = 'Parking Lot ' + (index + 1); panel.appendChild(title); buildLotPanel(panel, index); break;
      case 'intersection':
        title.textContent = 'Intersection ' + (index + 1); panel.appendChild(title); buildIntersectionPanel(panel, index); break;
      case 'vehicle':
        title.textContent = 'Vehicle ' + (index + 1); panel.appendChild(title); buildVehiclePanel(panel, index); break;
      case 'canvas':
        title.textContent = 'Canvas'; panel.appendChild(title); buildCanvasPanel(panel); break;
      case 'compass':
        title.textContent = 'Compass'; panel.appendChild(title); buildCompassPanel(panel); break;
    }

    // Delete button (not for compass or canvas)
    if (type !== 'compass' && type !== 'canvas') {
      const del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.textContent = 'Delete';
      del.style.marginTop = '16px';
      del.onclick = deleteSelected;
      panel.appendChild(del);
    }
  }

  const BASE_W = 1057, BASE_H = 817;

  function buildCanvasPanel(panel) {
    const c = state.config;
    const portrait = c.canvas.width < c.canvas.height;
    const unitW = portrait ? BASE_H : BASE_W;
    const unitH = portrait ? BASE_W : BASE_H;
    const cols = Math.max(1, Math.round(c.canvas.width / unitW));
    const rows = Math.max(1, Math.round(c.canvas.height / unitH));

    row(panel, 'Title', textInp(c.title || '', v => mutate(() => c.title = v)));
    row(panel, 'Layout', selInp(
      [{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }],
      portrait ? 'portrait' : 'landscape',
      v => mutate(() => {
        const p = v === 'portrait';
        const uW = p ? BASE_H : BASE_W;
        const uH = p ? BASE_W : BASE_H;
        c.canvas.width = uW * cols;
        c.canvas.height = uH * rows;
      })));
    row(panel, 'Columns', numInp(cols, v => mutate(() => {
      c.canvas.width = unitW * Math.max(1, Math.round(v));
    })));
    row(panel, 'Rows', numInp(rows, v => mutate(() => {
      c.canvas.height = unitH * Math.max(1, Math.round(v));
    })));
  }

  /* ── tiny helpers for property rows ── */
  function row(panel, label, input) {
    const d = document.createElement('div');
    d.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    d.appendChild(l);
    d.appendChild(input);
    panel.appendChild(d);
  }

  function section(panel, text) {
    const h = document.createElement('h4');
    h.className = 'props-section';
    h.textContent = text;
    panel.appendChild(h);
  }

  function textInp(val, onChange) {
    const i = document.createElement('input');
    i.type = 'text'; i.value = val ?? '';
    i.addEventListener('change', () => onChange(i.value));
    return i;
  }

  function numInp(val, onChange, step) {
    const i = document.createElement('input');
    i.type = 'number'; i.value = val ?? ''; i.step = step || 1;
    i.addEventListener('change', () => {
      onChange(i.value === '' ? undefined : parseFloat(i.value));
    });
    return i;
  }

  function selInp(opts, val, onChange) {
    const s = document.createElement('select');
    opts.forEach(o => {
      const opt = document.createElement('option');
      if (typeof o === 'object') { opt.value = o.value; opt.textContent = o.label; }
      else { opt.value = o; opt.textContent = o; }
      s.appendChild(opt);
    });
    s.value = val ?? '';
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  function colorInp(val, onChange) {
    const i = document.createElement('input');
    i.type = 'color'; i.value = val || '#333333';
    i.addEventListener('change', () => onChange(i.value));
    return i;
  }

  function checkInp(val, onChange) {
    const i = document.createElement('input');
    i.type = 'checkbox'; i.checked = !!val;
    i.addEventListener('change', () => onChange(i.checked));
    return i;
  }

  /* ── Road panel ── */
  function buildRoadPanel(panel, idx) {
    const r = state.config.roads[idx];
    if (!r) return;

    row(panel, 'Orientation', selInp(['vertical', 'horizontal'], r.orientation,
      v => mutate(() => { r.orientation = v; })));
    row(panel, 'Center', numInp(r.center, v => mutate(() => r.center = v)));
    row(panel, 'Lanes/Dir', numInp(r.lanesPerDirection || 1, v => mutate(() => r.lanesPerDirection = v)));
    row(panel, 'Center Line', selInp(
      ['dashed-yellow', 'solid-yellow', 'double-yellow', 'solid', 'none'],
      r.centerLineStyle || 'double-yellow',
      v => mutate(() => r.centerLineStyle = v)));
    row(panel, 'Lane Line', selInp(['dashed', 'solid', 'none'], r.laneLine || 'dashed',
      v => mutate(() => r.laneLine = v)));
    row(panel, 'Median', checkInp(!!r.median, v => mutate(() => { r.median = v ? 12 : 0; })));
  }

  /* ── Parking lot panel ── */
  function buildLotPanel(panel, idx) {
    const lot = state.config.parkingLots[idx];
    if (!lot) return;

    row(panel, 'X',  numInp(lot.x ?? 0,  v => mutate(() => lot.x = v)));
    row(panel, 'Y',  numInp(lot.y ?? 0,  v => mutate(() => lot.y = v)));
    // ── Rows ──
    section(panel, 'Rows');
    (lot.rows || []).forEach((rw, ri) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';

      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      hdr.innerHTML = '<strong>Row ' + (ri + 1) + '</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => mutate(() => { lot.rows.splice(ri, 1); clearAutoSize(lot); });
      hdr.appendChild(rm);
      box.appendChild(hdr);

      row(box, 'Orient', selInp(['horizontal', 'vertical'], rw.orientation || 'horizontal',
        v => mutate(() => { rw.orientation = v; clearAutoSize(lot); })));

      // Combined type+direction
      const isVert = rw.orientation === 'vertical';
      const typeOpts = isVert
        ? [{ value: 'half-left', label: 'Half - Left' }, { value: 'half-right', label: 'Half - Right' }, { value: 'double', label: 'Double' }]
        : [{ value: 'half-up', label: 'Half - Up' }, { value: 'half-down', label: 'Half - Down' }, { value: 'double', label: 'Double' }];
      // Derive current combined value
      let typeVal = 'double';
      if (rw.type === 'single') {
        if (isVert) typeVal = 'half-' + (rw.direction || 'right');
        else typeVal = 'half-' + (rw.direction || 'up');
      }
      row(box, 'Type', selInp(typeOpts, typeVal, v => mutate(() => {
        if (v === 'double') {
          rw.type = 'double'; delete rw.direction;
        } else {
          rw.type = 'single';
          rw.direction = v.replace('half-', '');
        }
        clearAutoSize(lot);
      })));

      if (isVert) {
        row(box, 'Stalls', numInp(rw.stallsPerColumn || 1, v => mutate(() => { rw.stallsPerColumn = v; clearAutoSize(lot); })));
      } else {
        row(box, 'Stalls', numInp(rw.stallsPerRow || 1,    v => mutate(() => { rw.stallsPerRow = v; clearAutoSize(lot); })));
      }
      const splitsInp = textInp((rw.splits || []).join(', '),
        v => mutate(() => {
          rw.splits = v.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          clearAutoSize(lot);
        }));
      splitsInp.placeholder = '5, 10';
      row(box, 'Splits', splitsInp);

      panel.appendChild(box);
    });

    const addR = document.createElement('button');
    addR.className = 'btn btn-small'; addR.textContent = '+ Add Row';
    addR.onclick = () => mutate(() => {
      if (!lot.rows) lot.rows = [];
      const prev = lot.rows[lot.rows.length - 1];
      const orient = prev?.orientation || 'horizontal';
      const newRow = { type: 'double', orientation: orient };
      if (orient === 'vertical') {
        newRow.stallsPerColumn = prev?.stallsPerColumn || 5;
      } else {
        newRow.stallsPerRow = prev?.stallsPerRow || 5;
      }
      if (prev?.splits?.length) newRow.splits = prev.splits.slice();
      lot.rows.push(newRow);
      clearAutoSize(lot);
    });
    panel.appendChild(addR);

    // ── Entrances ──
    section(panel, 'Entrances');
    (lot.entrances || []).forEach((ent, ei) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';
      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      hdr.innerHTML = '<strong>Ent ' + (ei + 1) + ' (' + (ent.side || '?') + ')</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => mutate(() => { lot.entrances.splice(ei, 1); clearAutoSize(lot); });
      hdr.appendChild(rm);
      box.appendChild(hdr);

      row(box, 'Side', selInp(['north', 'south', 'east', 'west'], ent.side || 'west',
        v => mutate(() => { ent.side = v; clearAutoSize(lot); })));
      row(box, 'Pos (-1..1)', numInp(ent.position ?? 0, v => mutate(() => ent.position = v), 0.1));
      panel.appendChild(box);
    });

    const addE = document.createElement('button');
    addE.className = 'btn btn-small'; addE.textContent = '+ Entrance + Road';
    addE.onclick = () => {
      const usedSides = new Set((lot.entrances || []).map(e => e.side));
      const side = ['west', 'east', 'north', 'south'].find(s => !usedSides.has(s)) || 'west';
      mutate(() => {
        if (!lot.entrances) lot.entrances = [];
        lot.entrances.push({ side, position: 0 });
        clearAutoSize(lot);
        createEntranceRoad(idx, side);
      });
    };
    panel.appendChild(addE);
  }

  /** Remove auto-calculated dimensions so applyDefaults re-derives them. */
  function clearAutoSize(lot) {
    delete lot.width;
    delete lot.height;
    (lot.rows || []).forEach(r => { delete r.offsetX; delete r.offsetY; delete r.x; delete r.y; });
  }

  /* ── Intersection panel ── */
  /** Return the active approach directions for an intersection based on its type. */
  function getApproaches(ix) {
    const all = ['north', 'south', 'east', 'west'];
    if (ix.type === 'tJunction') return all.filter(a => a !== (ix.blockedSide || 'north'));
    if (ix.type === 'turn') {
      const map = { ne: ['north', 'east'], nw: ['north', 'west'], se: ['south', 'east'], sw: ['south', 'west'] };
      return map[ix.openSides || 'ne'] || all;
    }
    return all;
  }

  function buildIntersectionPanel(panel, idx) {
    const ix = state.config.intersections[idx];
    if (!ix) return;

    row(panel, 'Type',  selInp(
      [{ value: 'fourWay', label: '4-Way' }, { value: 'tJunction', label: '3-Way' }, { value: 'turn', label: 'Turn' }],
      ix.type, v => mutate(() => {
        ix.type = v;
        if (v === 'tJunction' && !ix.blockedSide) ix.blockedSide = 'north';
        if (v === 'turn' && !ix.openSides) ix.openSides = 'ne';
        if (v === 'fourWay') { delete ix.blockedSide; delete ix.openSides; }
      })));

    if (ix.type === 'tJunction') {
      row(panel, 'Blocked', selInp(['north', 'south', 'east', 'west'],
        ix.blockedSide || 'north', v => mutate(() => ix.blockedSide = v)));
    }
    if (ix.type === 'turn') {
      row(panel, 'Open Sides', selInp(
        [{ value: 'ne', label: 'North + East' }, { value: 'nw', label: 'North + West' },
         { value: 'se', label: 'South + East' }, { value: 'sw', label: 'South + West' }],
        ix.openSides || 'ne', v => mutate(() => ix.openSides = v)));
    }

    // ── Lines ──
    section(panel, 'Lines');
    (ix.stopLines || []).forEach((sl, si) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';
      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      hdr.innerHTML = '<strong>' + (sl.approach || '?') + '</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => mutate(() => ix.stopLines.splice(si, 1));
      hdr.appendChild(rm); box.appendChild(hdr);
      panel.appendChild(box);
    });

    const addSL = document.createElement('button');
    addSL.className = 'btn btn-small'; addSL.textContent = '+ Stop Lines';
    addSL.onclick = () => {
      mutate(() => {
        if (!ix.stopLines) ix.stopLines = [];
        const existing = new Set(ix.stopLines.map(s => s.approach));
        getApproaches(ix).forEach(a => {
          if (!existing.has(a)) ix.stopLines.push({ approach: a, offset: 15 });
        });
      });
    };
    panel.appendChild(addSL);

    // ── Signals ──
    section(panel, 'Signals');
    (ix.signals || []).forEach((sig, si) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';
      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      hdr.innerHTML = '<strong>' + (sig.approach || '?') + ' ' + (sig.type === 'trafficLight' ? 'light' : 'stop sign') + '</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => mutate(() => ix.signals.splice(si, 1));
      hdr.appendChild(rm); box.appendChild(hdr);

      if (sig.type === 'trafficLight') {
        row(box, 'Active', selInp(['red', 'yellow', 'green'], sig.activeLight || 'red',
          v => mutate(() => sig.activeLight = v)));
      }
      panel.appendChild(box);
    });

    const addSigRow = document.createElement('div');
    addSigRow.style.cssText = 'display:flex;gap:4px;padding:4px 0;flex-wrap:wrap';

    ['trafficLight', 'stopSign'].forEach(sigType => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-small';
      btn.textContent = '+ ' + (sigType === 'trafficLight' ? 'Lights' : 'Stop Signs');
      btn.onclick = () => {
        mutate(() => {
          if (!ix.signals) ix.signals = [];
          const existing = new Set(ix.signals.filter(s => s.type === sigType).map(s => s.approach));
          getApproaches(ix).forEach(a => {
            if (!existing.has(a)) ix.signals.push({ approach: a, type: sigType });
          });
        });
      };
      addSigRow.appendChild(btn);
    });
    panel.appendChild(addSigRow);
  }

  /* ── Vehicle panel ── */
  function buildVehiclePanel(panel, idx) {
    const v = state.config.vehicles[idx];
    if (!v) return;

    const mode = v.road ? 'road' : (v.parkingLot != null ? 'stall' : 'absolute');

    row(panel, 'Mode', selInp(
      [{ value: 'road', label: 'On Road' }, { value: 'stall', label: 'In Stall' }, { value: 'absolute', label: 'Absolute' }],
      mode,
      nm => mutate(() => {
        // clear old fields
        delete v.road; delete v.side; delete v.t; delete v.lane; delete v.arm;
        delete v.parkingLot; delete v.row; delete v.stall; delete v.subRow;
        delete v.x; delete v.y;
        if (nm === 'road') {
          v.road = state.config.roads[0]?.id || ''; v.side = 'right'; v.t = 0.5; v.lane = 0;
        } else if (nm === 'stall') {
          v.parkingLot = 0; v.row = 0; v.stall = 0;
        } else {
          v.x = 0; v.y = 0;
        }
      })));

    if (mode === 'road') {
      row(panel, 'Road', selInp(state.config.roads.map(r => r.id), v.road,
        val => mutate(() => v.road = val)));
      row(panel, 'Side', selInp(['left', 'right'], v.side || 'right',
        val => mutate(() => v.side = val)));
      row(panel, 'Lane',  numInp(v.lane || 0,  val => mutate(() => v.lane = val)));
      row(panel, 'T 0-1', numInp(v.t ?? 0.5,   val => mutate(() => v.t = val), 0.05));
      row(panel, 'Arm', selInp(['', 'north', 'south', 'east', 'west'], v.arm || '',
        val => mutate(() => v.arm = val || undefined)));
    } else if (mode === 'stall') {
      row(panel, 'Lot #',   numInp(v.parkingLot ?? 0, val => mutate(() => v.parkingLot = val)));
      row(panel, 'Row #',   numInp(v.row ?? 0,        val => mutate(() => v.row = val)));
      row(panel, 'Stall #', numInp(v.stall ?? 0,      val => mutate(() => v.stall = val)));
      row(panel, 'Sub-row', selInp(['top', 'bottom', 'left', 'right'], v.subRow || 'top',
        val => mutate(() => v.subRow = val)));
    } else {
      row(panel, 'X', numInp(v.x ?? 0, val => mutate(() => v.x = val)));
      row(panel, 'Y', numInp(v.y ?? 0, val => mutate(() => v.y = val)));
    }

    row(panel, 'Color', selInp(
      ['gray', 'red', 'blue', 'green', 'white', 'black', 'yellow', 'orange'],
      v.color || 'gray', val => mutate(() => v.color = val)));
    row(panel, 'Size', selInp(['small', 'medium', 'large'], v.size || 'medium',
      val => mutate(() => { v.size = val; delete v.width; delete v.height; })));
    row(panel, 'Direction', selInp(['', 'north', 'south', 'east', 'west'], v.direction || '',
      val => mutate(() => v.direction = val || undefined)));
    row(panel, 'Rotation', numInp(v.rotation || 0, val => mutate(() => v.rotation = val)));
  }

  /* ── Compass panel ── */
  function buildCompassPanel(panel) {
    const c = state.config;
    const comp = (typeof c.compass === 'object' && c.compass) ? c.compass : {};
    row(panel, 'Size', numInp(comp.size ?? 30, v => mutate(() => {
      if (!c.compass || typeof c.compass !== 'object') c.compass = {};
      c.compass.size = v;
    })));

    const tog = document.createElement('button');
    tog.className = 'btn btn-danger'; tog.textContent = 'Remove Compass';
    tog.style.marginTop = '12px';
    tog.onclick = () => mutate(() => { c.compass = false; state.selected = null; });
    panel.appendChild(tog);
  }

  /* ================================================================
   *  ELEMENT LIST  (left sidebar)
   * ================================================================ */
  function refreshElementList() {
    const list = document.getElementById('element-list');
    list.innerHTML = '';

    function item(label, type, index) {
      const d = document.createElement('div');
      d.className = 'el-item' + (state.selected?.type === type && state.selected?.index === index ? ' selected' : '');
      d.textContent = label;
      d.onclick = () => { state.selected = { type, index }; rerender(); };
      return d;
    }

    function header(text) {
      const h = document.createElement('div');
      h.className = 'el-header'; h.textContent = text;
      list.appendChild(h);
    }

    // Canvas item always at top
    const canvasItem = document.createElement('div');
    canvasItem.className = 'el-item' + (state.selected?.type === 'canvas' ? ' selected' : '');
    canvasItem.textContent = 'Canvas';
    canvasItem.onclick = () => { state.selected = { type: 'canvas' }; rerender(); };
    list.appendChild(canvasItem);

    if (state.config.roads.length) {
      header('Roads');
      state.config.roads.forEach((r, i) => list.appendChild(item('Road ' + (i + 1) + ' (' + r.orientation + ')', 'road', i)));
    }
    if (state.config.parkingLots.length) {
      header('Parking Lots');
      state.config.parkingLots.forEach((l, i) => list.appendChild(item('Lot ' + (i + 1), 'lot', i)));
    }
    if (state.config.intersections.length) {
      header('Intersections');
      const ixLabels = { fourWay: '4-Way', tJunction: '3-Way', turn: 'Turn' };
      state.config.intersections.forEach((ix, i) => list.appendChild(item('Intersection ' + (i + 1) + ' (' + (ixLabels[ix.type] || '4-Way') + ')', 'intersection', i)));
    }
    if (state.config.vehicles.length) {
      header('Vehicles');
      state.config.vehicles.forEach((v, i) => list.appendChild(item(
        'Vehicle ' + (i + 1) + ' (' + (v.color || 'gray') + ')', 'vehicle', i)));
    }
  }

  /* ================================================================
   *  INTERACTION  (select, click, drag, keyboard)
   * ================================================================ */
  function selectElement(type, index) {
    state.selected = { type, index };
    rerender();
  }

  function deselect() {
    state.selected = null;
    rerender();
  }

  function deleteSelected() {
    if (!state.selected) return;
    const { type, index } = state.selected;
    mutate(() => {
      const cfg = state.config;
      if (type === 'road') {
        const id = cfg.roads[index]?.id;
        cfg.roads.splice(index, 1);
        cfg.intersections = cfg.intersections.filter(ix => !ix.roads || !ix.roads.includes(id));
        cfg.entrances = cfg.entrances.filter(e => e.road !== id);
        cfg.vehicles = cfg.vehicles.filter(v => v.road !== id);
      } else if (type === 'lot') {
        cfg.parkingLots.splice(index, 1);
      } else if (type === 'intersection') {
        cfg.intersections.splice(index, 1);
      } else if (type === 'vehicle') {
        cfg.vehicles.splice(index, 1);
      }
    });
    state.selected = null;
    rerender();
  }

  /* ── Click on overlay ── */
  function onOverlayClick(e) {
    const pt = svgPoint(e);
    const tgt = e.target;

    // Placement modes
    if (state.mode === 'addRoad') {
      mutate(() => {
        state.config.roads.push({
          id: genId('road'),
          orientation: 'vertical',
          center: Math.round(pt.x),
          lanesPerDirection: 1, laneWidth: 50, shoulder: 10,
        });
      });
      state.selected = { type: 'road', index: state.config.roads.length - 1 };
      state.mode = 'select'; updateToolbar(); rerender();
      setStatus('Road added — drag to move, edit properties on the right');
      return;
    }

    if (state.mode === 'addLot') {
      mutate(() => {
        state.config.parkingLots.push({
          id: genId('lot'),
          x: Math.round(pt.x), y: Math.round(pt.y),
          rows: [{ type: 'double', orientation: 'horizontal', stallsPerRow: 5 }],
          entrances: [],
        });
      });
      state.selected = { type: 'lot', index: state.config.parkingLots.length - 1 };
      state.mode = 'select'; updateToolbar(); rerender();
      setStatus('Parking lot added — configure rows and entrances in the panel');
      return;
    }

    if (state.mode === 'addVehicle') {
      const snap = snapVehicle(pt.x, pt.y);
      mutate(() => { state.config.vehicles.push(snap); });
      state.selected = { type: 'vehicle', index: state.config.vehicles.length - 1 };
      state.mode = 'select'; updateToolbar(); rerender();
      setStatus('Vehicle placed');
      return;
    }

    // Select mode
    if (tgt.dataset.type) {
      selectElement(tgt.dataset.type, parseInt(tgt.dataset.index));
    } else {
      deselect();
    }
  }

  /* ── Drag ── */
  let drag = null;
  let lastRender = 0;

  function onOverlayMouseDown(e) {
    if (state.mode !== 'select') return;
    const tgt = e.target;
    if (!tgt.dataset.type) return;

    const pt = svgPoint(e);
    selectElement(tgt.dataset.type, parseInt(tgt.dataset.index));
    pushUndo();
    drag = { type: tgt.dataset.type, index: parseInt(tgt.dataset.index),
             sx: pt.x, sy: pt.y, moved: false };
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!drag) return;
    const now = Date.now();
    if (now - lastRender < DRAG_THROTTLE_MS) return;
    lastRender = now;

    const pt = svgPoint(e);
    const dx = pt.x - drag.sx, dy = pt.y - drag.sy;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    drag.moved = true;

    const cfg = state.config;
    const { type, index } = drag;

    if (type === 'road') {
      const r = cfg.roads[index];
      if (!r) return;
      if (r.orientation === 'vertical') r.center = Math.round(r.center + dx);
      else r.center = Math.round(r.center + dy);
      // Move linked lot entrances with the road
      const linked = cfg.entrances.find(e => e.road === r.id);
      if (linked) {
        cfg.parkingLots.forEach(lot => {
          const ent = (lot.entrances || []).find(e => e.side === linked.side);
          if (!ent) return;
          if (r.orientation === 'vertical') lot.x = Math.round((lot.x ?? 0) + dx);
          else lot.y = Math.round((lot.y ?? 0) + dy);
        });
      }
      drag.sx = pt.x; drag.sy = pt.y;
      detectIntersections();
      rerenderFast();
    } else if (type === 'lot') {
      const lot = cfg.parkingLots[index];
      if (!lot) return;
      const rdx = Math.round(dx), rdy = Math.round(dy);
      lot.x = Math.round((lot.x ?? 0) + dx);
      lot.y = Math.round((lot.y ?? 0) + dy);
      // Move linked entrance roads with the lot
      (lot.entrances || []).forEach(ent => {
        const linked = cfg.entrances.find(e => e.side === ent.side);
        if (!linked) return;
        const road = cfg.roads.find(r => r.id === linked.road);
        if (!road) return;
        if (road.orientation === 'vertical') {
          road.center += rdx;
          if (ent.side === 'north' && typeof road.to === 'number') road.to += rdy;
          if (ent.side === 'south' && typeof road.from === 'number') road.from += rdy;
        } else {
          road.center += rdy;
          if (ent.side === 'west' && typeof road.to === 'number') road.to += rdx;
          if (ent.side === 'east' && typeof road.from === 'number') road.from += rdx;
        }
      });
      drag.sx = pt.x; drag.sy = pt.y;
      detectIntersections();
      rerenderFast();
    } else if (type === 'vehicle') {
      const v = cfg.vehicles[index];
      if (!v) return;
      if (v.x != null && !v.road && v.parkingLot == null) {
        v.x = Math.round(v.x + dx); v.y = Math.round(v.y + dy);
        drag.sx = pt.x; drag.sy = pt.y;
        rerenderFast();
      } else if (v.road) {
        const road = cfg.roads.find(r => r.id === v.road);
        if (road) {
          const cH = cfg.canvas.height, cW = cfg.canvas.width;
          if (road.orientation === 'vertical') {
            const from = road.from ?? 0, to = road.to ?? cH;
            v.t = Math.max(0, Math.min(1, (pt.y - from) / (to - from)));
          } else {
            const from = road.from ?? 0, to = road.to ?? cW;
            v.t = Math.max(0, Math.min(1, (pt.x - from) / (to - from)));
          }
          drag.sx = pt.x; drag.sy = pt.y;
          rerenderFast();
        }
      }
    } else if (type === 'compass') {
      if (typeof cfg.compass !== 'object') cfg.compass = {};
      const z = cfg.zoom || 1;
      const vbW = cfg.canvas.width / z, vbH = cfg.canvas.height / z;
      cfg.compass.x = (cfg.compass.x ?? (vbW - 50)) + dx;
      cfg.compass.y = (cfg.compass.y ?? (vbH - 50)) + dy;
      drag.sx = pt.x; drag.sy = pt.y;
      rerenderFast();
    }
  }

  /** Lightweight re-render (skip element list rebuild during drag for perf). */
  function rerenderFast() {
    const container = document.getElementById('diagram-container');
    container.innerHTML = '';
    try {
      state.processed = Diagram.applyDefaults(deepClone(state.config));
      Diagram.render(container, deepClone(state.config));
    } catch (e) { /* ignore during drag */ }
    const svg = container.querySelector('svg');
    if (svg) { svg.style.pointerEvents = 'none'; buildOverlay(svg); }
  }

  function onMouseUp() {
    if (drag && !drag.moved) state.undoStack.pop(); // just a click, not a real drag
    drag = null;
  }

  /* ── Keyboard ── */
  function onKeyDown(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); e.preventDefault(); }
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { undo(); e.preventDefault(); }
    else if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
             (e.key === 'y' && (e.ctrlKey || e.metaKey))) { redo(); e.preventDefault(); }
    else if (e.key === 'Escape') { state.mode = 'select'; deselect(); updateToolbar(); }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) nudge(e);
  }

  function nudge(e) {
    if (!state.selected) return;
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dy = e.key === 'ArrowDown'  ? step : e.key === 'ArrowUp'   ? -step : 0;
    const { type, index } = state.selected;
    const cfg = state.config;

    mutate(() => {
      if (type === 'road') {
        const r = cfg.roads[index];
        if (r) { if (r.orientation === 'vertical') r.center += dx; else r.center += dy; }
      } else if (type === 'lot') {
        const l = cfg.parkingLots[index];
        if (l) { l.x = (l.x ?? 0) + dx; l.y = (l.y ?? 0) + dy; }
      } else if (type === 'vehicle') {
        const v = cfg.vehicles[index];
        if (v && v.x != null) { v.x += dx; v.y += dy; }
      }
    });
    e.preventDefault();
  }

  /* ================================================================
   *  VEHICLE SNAP
   * ================================================================ */
  function snapVehicle(x, y) {
    const cfg = state.config;
    let best = null, bestDist = SNAP_DISTANCE;

    // Try road lanes
    cfg.roads.forEach(road => {
      const lw = road.laneWidth || 50;
      const lpd = road.lanesPerDirection || 1;
      const cH = cfg.canvas.height, cW = cfg.canvas.width;

      for (const side of ['left', 'right']) {
        for (let lane = 0; lane < lpd; lane++) {
          const off = lw / 2 + lane * lw;
          if (road.orientation === 'vertical') {
            const lx = road.center + (side === 'right' ? off : -off);
            const d = Math.abs(x - lx);
            if (d < bestDist) {
              const from = road.from ?? 0, to = road.to ?? cH;
              bestDist = d;
              best = { road: road.id, side, lane, t: Math.max(0, Math.min(1, (y - from) / (to - from))),
                       color: 'gray', size: 'medium' };
            }
          } else {
            const ly = road.center + (side === 'right' ? off : -off);
            const d = Math.abs(y - ly);
            if (d < bestDist) {
              const from = road.from ?? 0, to = road.to ?? cW;
              bestDist = d;
              best = { road: road.id, side, lane, t: Math.max(0, Math.min(1, (x - from) / (to - from))),
                       color: 'gray', size: 'medium' };
            }
          }
        }
      }
    });

    // Try parking stalls
    if (state.processed && state.processed.parkingLots) {
      state.processed.parkingLots.forEach((lot, li) => {
        if (!lot._x || !(x >= lot._x && x <= lot._x + lot.width && y >= lot._y && y <= lot._y + lot.height)) return;
        (lot.rows || []).forEach((rw, ri) => {
          const sw = rw.stallWidth || 50, sd = rw.stallDepth || 100;
          const rx = rw.x ?? lot._x + (rw.offsetX || 0);
          const ry = rw.y ?? lot._y + (rw.offsetY || 0);
          const isV = rw.orientation === 'vertical';
          const cnt = isV ? (rw.stallsPerColumn || 1) : (rw.stallsPerRow || 1);
          for (let si = 0; si < cnt; si++) {
            let sx, sy;
            if (isV) { sx = rx + sd / 2; sy = ry + si * sw + sw / 2; }
            else     { sx = rx + si * sw + sw / 2; sy = ry + sd / 2; }
            const d = Math.hypot(x - sx, y - sy);
            if (d < bestDist) { bestDist = d; best = { parkingLot: li, row: ri, stall: si, color: 'gray', size: 'medium' }; }
            // check double-row second half
            if (rw.type === 'double') {
              let sx2, sy2;
              if (isV) { sx2 = rx + sd * 1.5; sy2 = sy; }
              else     { sx2 = sx; sy2 = ry + sd * 1.5; }
              const d2 = Math.hypot(x - sx2, y - sy2);
              if (d2 < bestDist) { bestDist = d2; best = { parkingLot: li, row: ri, stall: si,
                subRow: isV ? 'right' : 'bottom', color: 'gray', size: 'medium' }; }
            }
          }
        });
      });
    }

    return best || { x: Math.round(x), y: Math.round(y), direction: 'north', color: 'gray', size: 'medium' };
  }

  /* ================================================================
   *  IMPORT / EXPORT
   * ================================================================ */
  function cleanConfig(obj) {
    if (Array.isArray(obj)) return obj.map(cleanConfig);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (!k.startsWith('_')) out[k] = cleanConfig(v);
      }
      return out;
    }
    return obj;
  }

  function exportJSON() { return JSON.stringify(cleanConfig(state.config), null, 2); }

  function doImportJSON() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const cfg = JSON.parse(r.result);
          pushUndo();
          state.config = cfg;
          state.selected = null;
          syncNextIds();
          rerender();
          setStatus('Imported: ' + (cfg.title || f.name));
        } catch (e) { alert('Invalid JSON: ' + e.message); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  function doExportJSON() {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = (state.config.title || 'diagram').replace(/\s+/g, '_') + '.json';
    a.href = url; a.click();
    URL.revokeObjectURL(url);
    setStatus('JSON exported');
  }

  function doExportPNG() {
    const svgEl = document.querySelector('#diagram-container svg');
    if (!svgEl) return;
    const data = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = parseInt(svgEl.getAttribute('width'));
      c.height = parseInt(svgEl.getAttribute('height'));
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = (state.config.title || 'diagram').replace(/\s+/g, '_') + '.png';
      a.href = c.toDataURL('image/png'); a.click();
      setStatus('PNG exported');
    };
    img.src = url;
  }

  /* ================================================================
   *  JSON EDITOR
   * ================================================================ */
  function toggleJsonEditor() {
    const p = document.getElementById('json-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) {
      document.getElementById('json-editor').value = exportJSON();
    }
  }

  function applyJsonEditor() {
    try {
      const cfg = JSON.parse(document.getElementById('json-editor').value);
      pushUndo();
      state.config = cfg;
      state.selected = null;
      syncNextIds();
      rerender();
      setStatus('JSON applied');
    } catch (e) { alert('Invalid JSON: ' + e.message); }
  }

  /* ================================================================
   *  TOOLBAR
   * ================================================================ */
  function updateToolbar() {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const active = document.querySelector('[data-mode="' + state.mode + '"]');
    if (active) active.classList.add('active');
    // body class for cursor
    document.body.className = state.mode !== 'select' ? 'mode-' + state.mode : '';
  }

  function updateZoom(val) {
    const v = parseFloat(val);
    state.uiZoom = v;
    fitCanvas();
    document.getElementById('zoom-value').textContent = Math.round(v * 100) + '%';
  }

  /* ================================================================
   *  INIT
   * ================================================================ */
  function init() {
    // Toolbar wiring
    const setMode = m => () => { state.mode = state.mode === m ? 'select' : m; updateToolbar();
      if (state.mode !== 'select') setStatus('Click on canvas to place ' + m.replace('add', '').toLowerCase()); };

    document.getElementById('btn-select').onclick      = () => { state.mode = 'select'; updateToolbar(); };
    document.getElementById('btn-add-road').onclick     = setMode('addRoad');
    document.getElementById('btn-add-lot').onclick      = setMode('addLot');
    document.getElementById('btn-add-vehicle').onclick  = setMode('addVehicle');
    document.getElementById('btn-compass').onclick      = () => mutate(() => {
      state.config.compass = state.config.compass === false ? { size: 30 } : false;
    });
    document.getElementById('btn-grid').onclick         = () => { state.showGrid = !state.showGrid; rerender(); };
    document.getElementById('btn-undo').onclick         = undo;
    document.getElementById('btn-redo').onclick         = redo;
    document.getElementById('btn-import').onclick       = doImportJSON;
    document.getElementById('btn-export-json').onclick  = doExportJSON;
    document.getElementById('btn-export-png').onclick   = doExportPNG;
    document.getElementById('btn-json-editor').onclick  = toggleJsonEditor;
    document.getElementById('btn-apply-json').onclick   = applyJsonEditor;
    document.getElementById('btn-close-json').onclick   = () => document.getElementById('json-panel').classList.add('hidden');

    // Zoom slider
    const zs = document.getElementById('zoom-slider');
    zs.oninput = () => updateZoom(zs.value);

    // Overlay events
    const ov = document.getElementById('overlay');
    ov.addEventListener('click', onOverlayClick);
    ov.addEventListener('mousedown', onOverlayMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    // Ctrl+scroll zoom
    document.getElementById('canvas-wrapper').addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const nz = Math.max(0.25, Math.min(4, (state.uiZoom || 1) + delta));
      zs.value = nz;
      updateZoom(nz);
    }, { passive: false });

    // Initial render
    rerender();
    setStatus('Ready — click "+ Road" or "+ Lot" to start building');
  }

  window.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', fitCanvas);
})();
