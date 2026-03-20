// builder/state.js — Shared state, undo/redo, core utilities
// Creates the global Builder namespace that all other modules extend.

const Builder = (() => {
  'use strict';

  const MAX_UNDO = 50;

  /* ── State ── */
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
    uiZoom: 1,
    showGrid: false,
    undoStack: [],
    redoStack: [],
    nextId: { road: 1, lot: 1, vehicle: 1 },
    processed: null,  // result of Diagram.applyDefaults
  };

  /* ── Utilities ── */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function genId(type) { return type + '_' + state.nextId[type]++; }

  function setStatus(msg) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = msg;
  }

  function svgPoint(e) {
    const ov = document.getElementById('overlay');
    if (!ov || !ov.getScreenCTM()) return { x: 0, y: 0 };
    const pt = ov.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ov.getScreenCTM().inverse());
  }

  function roadHalfWidth(r) {
    return Roads.roadWidth(
      r.laneWidth || 50,
      r.lanesPerDirection || 1,
      r.median || 0,
      r.shoulder
    ) / 2;
  }

  /* ── Undo / Redo ── */
  function pushUndo() {
    state.undoStack.push(deepClone(state.config));
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
  }

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

  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(deepClone(state.config));
    state.config = state.undoStack.pop();
    syncNextIds();
    Builder.rerender();
  }

  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(deepClone(state.config));
    state.config = state.redoStack.pop();
    syncNextIds();
    Builder.rerender();
  }

  /**
   * Wrap any config mutation: push undo, run fn(), detect intersections, re-render.
   */
  function mutate(fn) {
    pushUndo();
    fn();
    Builder.detectIntersections();
    Builder.rerender();
  }

  return {
    state,
    deepClone,
    genId,
    setStatus,
    svgPoint,
    roadHalfWidth,
    pushUndo,
    syncNextIds,
    undo,
    redo,
    mutate,
    // Placeholders — set by other modules before init()
    rerender: () => {},
    detectIntersections: () => {},
  };
})();
