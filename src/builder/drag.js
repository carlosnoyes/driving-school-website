// builder/drag.js — Mouse drag, arrow-key nudge

(function () {
  'use strict';

  const PX = Diagram.RESOLUTION_SCALE;

  let drag = null;
  let lastRender = 0;

  function onMouseDown(e) {
    const state = Builder.state;
    if (state.mode !== 'select') return;
    const tgt = e.target;
    if (!tgt.dataset.type) return;

    const pt = Builder.svgPoint(e);
    Builder.selectElement(tgt.dataset.type, parseInt(tgt.dataset.index));
    Builder.pushUndo();
    drag = { type: tgt.dataset.type, index: parseInt(tgt.dataset.index),
             sx: pt.x, sy: pt.y, moved: false };
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!drag) return;
    const now = Date.now();
    if (now - lastRender < Builder.DRAG_THROTTLE_MS) return;
    lastRender = now;

    const pt = Builder.svgPoint(e);
    const dx = pt.x - drag.sx, dy = pt.y - drag.sy;
    if (!drag.moved && Math.abs(dx) < 3 * PX && Math.abs(dy) < 3 * PX) return;
    drag.moved = true;

    const cfg = Builder.state.config;
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
      Builder.detectIntersections();
      Builder.rerenderFast();

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
      Builder.detectIntersections();
      Builder.rerenderFast();

    } else if (type === 'vehicle') {
      const v = cfg.vehicles[index];
      if (!v) return;
      if (v.x != null && !v.road && v.parkingLot == null) {
        v.x = Math.round(v.x + dx); v.y = Math.round(v.y + dy);
        drag.sx = pt.x; drag.sy = pt.y;
        Builder.rerenderFast();
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
          Builder.rerenderFast();
        }
      }

    } else if (type === 'compass') {
      if (typeof cfg.compass !== 'object') cfg.compass = {};
      const z = cfg.zoom || 1;
      const vbW = cfg.canvas.width / z, vbH = cfg.canvas.height / z;
      cfg.compass.x = (cfg.compass.x ?? (vbW - 50 * PX)) + dx;
      cfg.compass.y = (cfg.compass.y ?? (vbH - 50 * PX)) + dy;
      drag.sx = pt.x; drag.sy = pt.y;
      Builder.rerenderFast();
    }
  }

  function onMouseUp() {
    if (drag && !drag.moved) Builder.state.undoStack.pop();
    drag = null;
  }

  function nudge(e) {
    const state = Builder.state;
    if (!state.selected) return;
    const step = e.shiftKey ? 10 * PX : PX;
    const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dy = e.key === 'ArrowDown'  ? step : e.key === 'ArrowUp'   ? -step : 0;
    const { type, index } = state.selected;
    const cfg = state.config;

    Builder.mutate(() => {
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

  // Expose
  Builder.onDragMouseDown = onMouseDown;
  Builder.onDragMouseMove = onMouseMove;
  Builder.onDragMouseUp = onMouseUp;
  Builder.nudge = nudge;
})();
