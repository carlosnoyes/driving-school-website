// builder/overlay.js — Hit-target overlay and selection highlight

(function () {
  'use strict';

  const PX = Diagram.RESOLUTION_SCALE;

  function hitRect(x, y, w, h, type, index) {
    const NS = 'http://www.w3.org/2000/svg';
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', Math.max(w, 10 * PX));
    r.setAttribute('height', Math.max(h, 10 * PX));
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
    const sel = Builder.state.selected;
    if (!sel) return;
    const t = ov.querySelector(`[data-type="${sel.type}"][data-index="${sel.index}"]`);
    if (t) {
      t.setAttribute('stroke', '#2196F3');
      t.setAttribute('stroke-width', 3 * PX);
      t.setAttribute('stroke-dasharray', `${8 * PX},${4 * PX}`);
      t.setAttribute('fill', 'rgba(33,150,243,0.08)');
    }
  }

  /** Build the transparent overlay with hit-targets for all elements. */
  function buildOverlay(diagramSvg) {
    const state = Builder.state;
    const ov = document.getElementById('overlay');
    ov.setAttribute('viewBox', diagramSvg.getAttribute('viewBox'));
    ov.setAttribute('width', diagramSvg.getAttribute('width'));
    ov.setAttribute('height', diagramSvg.getAttribute('height'));
    ov.innerHTML = '';

    const cfg  = state.config;
    const proc = state.processed;
    const cW   = cfg.canvas.width;
    const cH   = cfg.canvas.height;

    // Roads
    cfg.roads.forEach((r, i) => {
      const hw = Builder.roadHalfWidth(r);
      let x, y, w, h;
      if (r.orientation === 'vertical') {
        const from = r.from ?? 0, to = r.to ?? cH;
        x = r.center - hw; y = from; w = hw * 2; h = to - from;
      } else {
        const from = r.from ?? 0, to = r.to ?? cW;
        x = from; y = r.center - hw; w = to - from; h = hw * 2;
      }
      ov.appendChild(hitRect(x, y, w, h, 'road', i));
    });

    // Parking lots
    if (proc && proc.parkingLots) {
      proc.parkingLots.forEach((lot, i) => {
        if (lot._x != null) {
          ov.appendChild(hitRect(lot._x, lot._y, lot.width, lot.height, 'lot', i));
        }
      });
    }

    // Intersections
    cfg.intersections.forEach((ix, i) => {
      if (!ix.center) return;
      const r0 = cfg.roads.find(r => r.id === (ix.roads && ix.roads[0]));
      const r1 = cfg.roads.find(r => r.id === (ix.roads && ix.roads[1]));
      let hw = 40 * PX, hh = 40 * PX;
      if (r0 && r1) {
        const vr = r0.orientation === 'vertical' ? r0 : r1;
        const hr = r0.orientation === 'horizontal' ? r0 : r1;
        hh = Builder.roadHalfWidth(vr);
        hw = Builder.roadHalfWidth(hr);
      }
      ov.appendChild(hitRect(ix.center[0] - hh, ix.center[1] - hw, hh * 2, hw * 2, 'intersection', i));
    });

    // Vehicles — use pre-computed positions from applyDefaults
    if (proc && proc.vehicles) {
      proc.vehicles.forEach((v, i) => {
        if (v._cx != null && v._cy != null) {
          ov.appendChild(hitRect(v._cx - 20 * PX, v._cy - 20 * PX, 40 * PX, 40 * PX, 'vehicle', i));
        }
      });
    }

    // Compass
    if (cfg.compass !== false) {
      const z = cfg.zoom || 1;
      const vbW = cW / z, vbH = cH / z;
      const comp = cfg.compass || {};
      const cx = comp.x ?? (vbW - (comp.margin ?? (50 * PX)) / z);
      const cy = comp.y ?? (vbH - (comp.margin ?? (50 * PX)) / z);
      ov.appendChild(hitRect(cx - 35 * PX, cy - 35 * PX, 70 * PX, 70 * PX, 'compass', 0));
    }

    // Grid
    if (state.showGrid) Builder.drawGrid(ov, cW, cH);

    // Highlight
    if (state.selected) highlightSelected();
  }

  // Expose
  Builder.buildOverlay = buildOverlay;
  Builder.highlightSelected = highlightSelected;
})();
