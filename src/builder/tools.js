// builder/tools.js — Toolbar placement modes, vehicle snap

(function () {
  'use strict';

  const PX = Diagram.RESOLUTION_SCALE;
  const SNAP_DISTANCE = 30 * PX;

  /** Handle overlay clicks: placement modes or select. */
  function onOverlayClick(e) {
    const state = Builder.state;
    const pt = Builder.svgPoint(e);
    const tgt = e.target;

    // Add Road
    if (state.mode === 'addRoad') {
      Builder.mutate(() => {
        state.config.roads.push({
          id: Builder.genId('road'),
          orientation: 'vertical',
          center: Math.round(pt.x),
          lanesPerDirection: 1, laneWidth: Diagram.DEFAULTS.laneWidth, shoulder: Diagram.DEFAULTS.shoulder,
        });
      });
      state.selected = { type: 'road', index: state.config.roads.length - 1 };
      state.mode = 'select'; Builder.updateToolbar(); Builder.rerender();
      Builder.setStatus('Road added — drag to move, edit properties on the right');
      return;
    }

    // Add Parking Lot
    if (state.mode === 'addLot') {
      Builder.mutate(() => {
        state.config.parkingLots.push({
          id: Builder.genId('lot'),
          x: Math.round(pt.x), y: Math.round(pt.y),
          rows: [{ type: 'double', orientation: 'horizontal', stallsPerRow: 5 }],
          entrances: [],
        });
      });
      state.selected = { type: 'lot', index: state.config.parkingLots.length - 1 };
      state.mode = 'select'; Builder.updateToolbar(); Builder.rerender();
      Builder.setStatus('Parking lot added — configure rows and entrances in the panel');
      return;
    }

    // Add Vehicle
    if (state.mode === 'addVehicle') {
      const snap = snapVehicle(pt.x, pt.y);
      Builder.mutate(() => { state.config.vehicles.push(snap); });
      state.selected = { type: 'vehicle', index: state.config.vehicles.length - 1 };
      state.mode = 'select'; Builder.updateToolbar(); Builder.rerender();
      Builder.setStatus('Vehicle placed');
      return;
    }

    // Select mode
    if (tgt.dataset.type) {
      Builder.selectElement(tgt.dataset.type, parseInt(tgt.dataset.index));
    } else {
      Builder.deselect();
    }
  }

  /** Snap a click position to the nearest road lane or parking stall. */
  function snapVehicle(x, y) {
    const state = Builder.state;
    const cfg = state.config;
    let best = null, bestDist = SNAP_DISTANCE;

    // Try road lanes
    cfg.roads.forEach(road => {
      const lw = road.laneWidth || Roads.D.laneWidth;
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

    // Try parking stalls (use processed lot geometry)
    if (state.processed && state.processed.parkingLots) {
      state.processed.parkingLots.forEach((lot, li) => {
        if (!lot._x || !(x >= lot._x && x <= lot._x + lot.width && y >= lot._y && y <= lot._y + lot.height)) return;
        (lot.rows || []).forEach((rw, ri) => {
          const sw = rw.stallWidth || Diagram.DEFAULTS.stallWidth;
          const sd = rw.stallDepth || Diagram.DEFAULTS.stallDepth;
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

  // Expose
  Builder.onOverlayClick = onOverlayClick;
})();
