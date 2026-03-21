// builder/props.js — Right sidebar property panels

(function () {
  'use strict';

  const PX = Diagram.RESOLUTION_SCALE;

  /* ── Tiny UI helpers for property rows ── */
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

  function checkInp(val, onChange) {
    const i = document.createElement('input');
    i.type = 'checkbox'; i.checked = !!val;
    i.addEventListener('change', () => onChange(i.checked));
    return i;
  }

  /* ── Auto-derive intersections from road overlap ── */
  function detectIntersections() {
    const cfg = Builder.state.config;
    const vRoads = cfg.roads.filter(r => r.orientation === 'vertical');
    const hRoads = cfg.roads.filter(r => r.orientation === 'horizontal');
    const cW = cfg.canvas.width, cH = cfg.canvas.height;

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
            const vHW = Builder.roadHalfWidth(vr), hHW = Builder.roadHalfWidth(hr);
            const tol = Math.max(vHW, hHW);
            let type = 'fourWay', blocked = null;

            if (Math.abs((vr.from ?? 0) - cy) < tol)       { blocked = 'north'; type = 'tJunction'; }
            else if (Math.abs((vr.to ?? cH) - cy) < tol)    { blocked = 'south'; type = 'tJunction'; }
            else if (Math.abs((hr.from ?? 0) - cx) < tol)   { blocked = 'west';  type = 'tJunction'; }
            else if (Math.abs((hr.to ?? cW) - cx) < tol)    { blocked = 'east';  type = 'tJunction'; }

            const ix = {
              id: 'ix_' + vr.id + '_' + hr.id,
              type,
              roads: [vr.id, hr.id],
              center: [cx, cy],
              radius: Diagram.DEFAULTS.radius,
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

  /** Auto-create a road + entrance-junction when an entrance is added to a lot. */
  function createEntranceRoad(lotIndex, side) {
    const cfg = Builder.state.config;
    const lot = cfg.parkingLots[lotIndex];
    if (!lot) return null;

    const tmp = Diagram.applyDefaults(Builder.deepClone(cfg));
    const pLot = tmp.parkingLots[lotIndex];
    if (!pLot) return null;

    const cx = lot.x ?? 0, cy = lot.y ?? 0;
    const halfW = pLot.width / 2, halfH = pLot.height / 2;
    const ent = (lot.entrances || [])[(lot.entrances || []).length - 1];
    const pos = ent ? (ent.position ?? 0) : 0;
    const cWidth = cfg.canvas.width, cHeight = cfg.canvas.height;
    const roadId = Builder.genId('road');
    const bleed = 5 * PX;

    let road;
    if (side === 'north') {
      road = { id: roadId, orientation: 'vertical', center: cx + pos * halfW,
               from: -bleed, to: cy - halfH, lanesPerDirection: 1, laneWidth: Diagram.DEFAULTS.laneWidth, shoulder: Diagram.DEFAULTS.shoulder };
    } else if (side === 'south') {
      road = { id: roadId, orientation: 'vertical', center: cx + pos * halfW,
               from: cy + halfH, to: cHeight + bleed, lanesPerDirection: 1, laneWidth: Diagram.DEFAULTS.laneWidth, shoulder: Diagram.DEFAULTS.shoulder };
    } else if (side === 'west') {
      road = { id: roadId, orientation: 'horizontal', center: cy + pos * halfH,
               from: -bleed, to: cx - halfW, lanesPerDirection: 1, laneWidth: Diagram.DEFAULTS.laneWidth, shoulder: Diagram.DEFAULTS.shoulder };
    } else if (side === 'east') {
      road = { id: roadId, orientation: 'horizontal', center: cy + pos * halfH,
               from: cx + halfW, to: cWidth + bleed, lanesPerDirection: 1, laneWidth: Diagram.DEFAULTS.laneWidth, shoulder: Diagram.DEFAULTS.shoulder };
    }
    if (!road) return null;

    cfg.roads.push(road);
    cfg.entrances.push({ road: roadId, side });
    return roadId;
  }

  /** Remove auto-calculated dimensions so applyDefaults re-derives them. */
  function clearAutoSize(lot) {
    delete lot.width;
    delete lot.height;
    (lot.rows || []).forEach(r => { delete r.offsetX; delete r.offsetY; delete r.x; delete r.y; });
  }

  /** Return the active approach directions for an intersection. */
  function getApproaches(ix) {
    const all = ['north', 'south', 'east', 'west'];
    if (ix.type === 'tJunction') return all.filter(a => a !== (ix.blockedSide || 'north'));
    if (ix.type === 'turn') {
      const map = { ne: ['north', 'east'], nw: ['north', 'west'], se: ['south', 'east'], sw: ['south', 'west'] };
      return map[ix.openSides || 'ne'] || all;
    }
    return all;
  }

  /* ── Panel Builders ── */

  function buildCanvasPanel(panel) {
    const c = Builder.state.config;
    if (!c.canvas) c.canvas = {};

    // Derive current pane dimensions and grid size
    const pW = c.canvas.paneWidth || Builder.BASE_W;
    const pH = c.canvas.paneHeight || Builder.BASE_H;
    const portrait = pW < pH;
    const cols = c.canvas.columns || Math.max(1, Math.round((c.canvas.width || pW) / pW));
    const rows = c.canvas.rows || Math.max(1, Math.round((c.canvas.height || pH) / pH));

    row(panel, 'Title', textInp(c.title || '', v => Builder.mutate(() => c.title = v)));
    row(panel, 'Layout', selInp(
      [{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }],
      portrait ? 'portrait' : 'landscape',
      v => Builder.mutate(() => {
        const p = v === 'portrait';
        c.canvas.paneWidth = p ? Builder.BASE_H : Builder.BASE_W;
        c.canvas.paneHeight = p ? Builder.BASE_W : Builder.BASE_H;
        delete c.canvas.width; delete c.canvas.height;
      })));
    row(panel, 'Columns', numInp(cols, v => Builder.mutate(() => {
      c.canvas.columns = Math.max(1, Math.round(v));
      delete c.canvas.width;
    })));
    row(panel, 'Rows', numInp(rows, v => Builder.mutate(() => {
      c.canvas.rows = Math.max(1, Math.round(v));
      delete c.canvas.height;
    })));

    section(panel, 'Display');
    row(panel, 'Zoom', numInp(c.canvas.zoom ?? c.zoom ?? 1, v => Builder.mutate(() => {
      c.canvas.zoom = v; delete c.zoom;
    }), 0.25));
    row(panel, 'Grid', checkInp(c.canvas.grid ?? false,
      v => Builder.mutate(() => c.canvas.grid = v)));
    row(panel, 'Compass', checkInp(c.canvas.compass !== false && c.compass !== false,
      v => Builder.mutate(() => { c.canvas.compass = v; c.compass = v ? (c.compass || { size: 30 * PX }) : false; })));
  }

  function buildRoadPanel(panel, idx) {
    const r = Builder.state.config.roads[idx];
    if (!r) return;

    row(panel, 'Orientation', selInp(['vertical', 'horizontal'], r.orientation,
      v => Builder.mutate(() => { r.orientation = v; })));
    row(panel, 'Center', numInp(r.center, v => Builder.mutate(() => r.center = v)));
    row(panel, 'Lanes/Dir', numInp(r.lanesPerDirection || 1, v => Builder.mutate(() => r.lanesPerDirection = v)));
    row(panel, 'Center Line', selInp(
      ['dashed-yellow', 'solid-yellow', 'double-yellow', 'solid', 'none'],
      r.centerLineStyle || 'double-yellow',
      v => Builder.mutate(() => r.centerLineStyle = v)));
    row(panel, 'Lane Line', selInp(['dashed', 'solid', 'none'], r.laneLine || 'dashed',
      v => Builder.mutate(() => r.laneLine = v)));
    row(panel, 'Median', checkInp(!!r.median, v => Builder.mutate(() => { r.median = v ? 12 * PX : 0; })));
  }

  function buildLotPanel(panel, idx) {
    const lot = Builder.state.config.parkingLots[idx];
    if (!lot) return;

    row(panel, 'X',  numInp(lot.x ?? 0,  v => Builder.mutate(() => lot.x = v)));
    row(panel, 'Y',  numInp(lot.y ?? 0,  v => Builder.mutate(() => lot.y = v)));

    // Rows
    section(panel, 'Rows');
    (lot.rows || []).forEach((rw, ri) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';

      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      hdr.innerHTML = '<strong>Row ' + (ri + 1) + '</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => Builder.mutate(() => { lot.rows.splice(ri, 1); clearAutoSize(lot); });
      hdr.appendChild(rm);
      box.appendChild(hdr);

      row(box, 'Orient', selInp(['horizontal', 'vertical'], rw.orientation || 'horizontal',
        v => Builder.mutate(() => { rw.orientation = v; clearAutoSize(lot); })));

      const isVert = rw.orientation === 'vertical';
      const typeOpts = isVert
        ? [{ value: 'half-left', label: 'Half - Left' }, { value: 'half-right', label: 'Half - Right' }, { value: 'double', label: 'Double' }]
        : [{ value: 'half-up', label: 'Half - Up' }, { value: 'half-down', label: 'Half - Down' }, { value: 'double', label: 'Double' }];
      let typeVal = 'double';
      if (rw.type === 'single') {
        if (isVert) typeVal = 'half-' + (rw.direction || 'right');
        else typeVal = 'half-' + (rw.direction || 'up');
      }
      row(box, 'Type', selInp(typeOpts, typeVal, v => Builder.mutate(() => {
        if (v === 'double') { rw.type = 'double'; delete rw.direction; }
        else { rw.type = 'single'; rw.direction = v.replace('half-', ''); }
        clearAutoSize(lot);
      })));

      if (isVert) {
        row(box, 'Stalls', numInp(rw.stallsPerColumn || 1, v => Builder.mutate(() => { rw.stallsPerColumn = v; clearAutoSize(lot); })));
      } else {
        row(box, 'Stalls', numInp(rw.stallsPerRow || 1, v => Builder.mutate(() => { rw.stallsPerRow = v; clearAutoSize(lot); })));
      }
      const splitsInp = textInp((rw.splits || []).join(', '),
        v => Builder.mutate(() => {
          rw.splits = v.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          clearAutoSize(lot);
        }));
      splitsInp.placeholder = '5, 10';
      row(box, 'Splits', splitsInp);

      panel.appendChild(box);
    });

    const addR = document.createElement('button');
    addR.className = 'btn btn-small'; addR.textContent = '+ Add Row';
    addR.onclick = () => Builder.mutate(() => {
      if (!lot.rows) lot.rows = [];
      const prev = lot.rows[lot.rows.length - 1];
      const orient = prev?.orientation || 'horizontal';
      const newRow = { type: 'double', orientation: orient };
      if (orient === 'vertical') newRow.stallsPerColumn = prev?.stallsPerColumn || 5;
      else newRow.stallsPerRow = prev?.stallsPerRow || 5;
      if (prev?.splits?.length) newRow.splits = prev.splits.slice();
      lot.rows.push(newRow);
      clearAutoSize(lot);
    });
    panel.appendChild(addR);

    // Entrances
    section(panel, 'Entrances');
    (lot.entrances || []).forEach((ent, ei) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';
      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      hdr.innerHTML = '<strong>Ent ' + (ei + 1) + ' (' + (ent.side || '?') + ')</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => Builder.mutate(() => { lot.entrances.splice(ei, 1); clearAutoSize(lot); });
      hdr.appendChild(rm);
      box.appendChild(hdr);

      row(box, 'Side', selInp(['north', 'south', 'east', 'west'], ent.side || 'west',
        v => Builder.mutate(() => { ent.side = v; clearAutoSize(lot); })));
      row(box, 'Pos (-1..1)', numInp(ent.position ?? 0, v => Builder.mutate(() => ent.position = v), 0.1));
      panel.appendChild(box);
    });

    const addE = document.createElement('button');
    addE.className = 'btn btn-small'; addE.textContent = '+ Entrance + Road';
    addE.onclick = () => {
      const usedSides = new Set((lot.entrances || []).map(e => e.side));
      const side = ['west', 'east', 'north', 'south'].find(s => !usedSides.has(s)) || 'west';
      Builder.mutate(() => {
        if (!lot.entrances) lot.entrances = [];
        lot.entrances.push({ side, position: 0 });
        clearAutoSize(lot);
        createEntranceRoad(idx, side);
      });
    };
    panel.appendChild(addE);
  }

  function buildIntersectionPanel(panel, idx) {
    const ix = Builder.state.config.intersections[idx];
    if (!ix) return;

    row(panel, 'Type', selInp(
      [{ value: 'fourWay', label: '4-Way' }, { value: 'tJunction', label: '3-Way' }, { value: 'turn', label: 'Turn' }],
      ix.type, v => Builder.mutate(() => {
        ix.type = v;
        if (v === 'tJunction' && !ix.blockedSide) ix.blockedSide = 'north';
        if (v === 'turn' && !ix.openSides) ix.openSides = 'ne';
        if (v === 'fourWay') { delete ix.blockedSide; delete ix.openSides; }
      })));

    if (ix.type === 'tJunction') {
      row(panel, 'Blocked', selInp(['north', 'south', 'east', 'west'],
        ix.blockedSide || 'north', v => Builder.mutate(() => ix.blockedSide = v)));
    }
    if (ix.type === 'turn') {
      row(panel, 'Open Sides', selInp(
        [{ value: 'ne', label: 'North + East' }, { value: 'nw', label: 'North + West' },
         { value: 'se', label: 'South + East' }, { value: 'sw', label: 'South + West' }],
        ix.openSides || 'ne', v => Builder.mutate(() => ix.openSides = v)));
    }

    // Stop Lines
    section(panel, 'Lines');
    (ix.stopLines || []).forEach((sl, si) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';
      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      const laneLabel = sl.lane ? ' ' + sl.lane : '';
      const turnLabel = sl.turnLane ? ' turn' : '';
      hdr.innerHTML = '<strong>' + (sl.approach || '?') + laneLabel + turnLabel + '</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => Builder.mutate(() => ix.stopLines.splice(si, 1));
      hdr.appendChild(rm); box.appendChild(hdr);

      row(box, 'Approach', selInp(getApproaches(ix), sl.approach || 'north',
        v => Builder.mutate(() => sl.approach = v)));
      row(box, 'Lane', selInp(
        [{ value: 'all', label: 'All lanes' }, { value: 'left', label: 'Left / inner' }, { value: 'right', label: 'Right / outer' }],
        sl.lane || 'all',
        v => Builder.mutate(() => {
          delete sl.lanes;
          if (v === 'all') delete sl.lane;
          else sl.lane = v;
        })));
      row(box, 'Offset', numInp(sl.offset ?? (15 * PX),
        v => Builder.mutate(() => {
          if (v == null || v === 15 * PX) delete sl.offset;
          else sl.offset = v;
        })));
      row(box, 'Turn Lane', checkInp(sl.turnLane,
        v => Builder.mutate(() => {
          if (v) sl.turnLane = true;
          else delete sl.turnLane;
        })));
      row(box, 'Turn Setback', numInp(sl.turnLaneOffset ?? (50 * PX),
        v => Builder.mutate(() => {
          if (v == null || v === 50 * PX) delete sl.turnLaneOffset;
          else sl.turnLaneOffset = v;
        })));
      panel.appendChild(box);
    });

    const addSL = document.createElement('button');
    addSL.className = 'btn btn-small'; addSL.textContent = '+ Stop Line';
    addSL.onclick = () => {
      Builder.mutate(() => {
        if (!ix.stopLines) ix.stopLines = [];
        ix.stopLines.push({ approach: getApproaches(ix)[0] || 'north', offset: 15 * PX });
      });
    };
    panel.appendChild(addSL);

    // Signals
    section(panel, 'Signals');
    (ix.signals || []).forEach((sig, si) => {
      const box = document.createElement('div');
      box.className = 'prop-subgroup';
      const hdr = document.createElement('div');
      hdr.className = 'prop-row-header';
      const sigLabel = sig.type === 'trafficLight'
        ? 'light'
        : (sig.type === 'stopSign4Way' ? '4-way stop sign' : 'stop sign');
      hdr.innerHTML = '<strong>' + (sig.approach || '?') + ' ' + sigLabel + '</strong>';
      const rm = document.createElement('button');
      rm.className = 'btn btn-small btn-danger'; rm.textContent = 'X';
      rm.onclick = () => Builder.mutate(() => ix.signals.splice(si, 1));
      hdr.appendChild(rm); box.appendChild(hdr);

      if (sig.type === 'trafficLight') {
        row(box, 'Active', selInp(['red', 'yellow', 'green'], sig.activeLight || 'red',
          v => Builder.mutate(() => sig.activeLight = v)));
      }
      panel.appendChild(box);
    });

    const addSigRow = document.createElement('div');
    addSigRow.style.cssText = 'display:flex;gap:4px;padding:4px 0;flex-wrap:wrap';

    ['trafficLight', 'stopSign', 'stopSign4Way'].forEach(sigType => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-small';
      btn.textContent = '+ ' + (
        sigType === 'trafficLight'
          ? 'Lights'
          : (sigType === 'stopSign4Way' ? '4-Way Stop Signs' : 'Stop Signs')
      );
      btn.onclick = () => {
        Builder.mutate(() => {
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

  function buildVehiclePanel(panel, idx) {
    const state = Builder.state;
    const v = state.config.vehicles[idx];
    if (!v) return;

    const mode = v.road ? 'road' : (v.parkingLot != null ? 'stall' : 'absolute');

    row(panel, 'Mode', selInp(
      [{ value: 'road', label: 'On Road' }, { value: 'stall', label: 'In Stall' }, { value: 'absolute', label: 'Absolute' }],
      mode,
      nm => Builder.mutate(() => {
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
        val => Builder.mutate(() => v.road = val)));
      row(panel, 'Side', selInp(['left', 'right'], v.side || 'right',
        val => Builder.mutate(() => v.side = val)));
      row(panel, 'Lane',  numInp(v.lane || 0,  val => Builder.mutate(() => v.lane = val)));
      row(panel, 'T 0-1', numInp(v.t ?? 0.5,   val => Builder.mutate(() => v.t = val), 0.05));
      row(panel, 'Arm', selInp(['', 'north', 'south', 'east', 'west'], v.arm || '',
        val => Builder.mutate(() => v.arm = val || undefined)));
    } else if (mode === 'stall') {
      row(panel, 'Lot #',   numInp(v.parkingLot ?? 0, val => Builder.mutate(() => v.parkingLot = val)));
      row(panel, 'Row #',   numInp(v.row ?? 0,        val => Builder.mutate(() => v.row = val)));
      row(panel, 'Stall #', numInp(v.stall ?? 0,      val => Builder.mutate(() => v.stall = val)));
      row(panel, 'Sub-row', selInp(['top', 'bottom', 'left', 'right'], v.subRow || 'top',
        val => Builder.mutate(() => v.subRow = val)));
    } else {
      row(panel, 'X', numInp(v.x ?? 0, val => Builder.mutate(() => v.x = val)));
      row(panel, 'Y', numInp(v.y ?? 0, val => Builder.mutate(() => v.y = val)));
    }

    row(panel, 'Color', selInp(
      ['gray', 'red', 'blue', 'green', 'white', 'black', 'yellow', 'orange'],
      v.color || 'gray', val => Builder.mutate(() => v.color = val)));
    row(panel, 'Size', selInp(['small', 'medium', 'large'], v.size || 'medium',
      val => Builder.mutate(() => { v.size = val; delete v.width; delete v.height; })));
    row(panel, 'Direction', selInp(['', 'north', 'south', 'east', 'west'], v.direction || '',
      val => Builder.mutate(() => v.direction = val || undefined)));
    row(panel, 'Rotation', numInp(v.rotation || 0, val => Builder.mutate(() => v.rotation = val)));
  }

  function buildCompassPanel(panel) {
    const c = Builder.state.config;
    const comp = (typeof c.compass === 'object' && c.compass) ? c.compass : {};
    row(panel, 'Size', numInp(comp.size ?? (30 * PX), v => Builder.mutate(() => {
      if (!c.compass || typeof c.compass !== 'object') c.compass = {};
      c.compass.size = v;
    })));

    const tog = document.createElement('button');
    tog.className = 'btn btn-danger'; tog.textContent = 'Remove Compass';
    tog.style.marginTop = '12px';
    tog.onclick = () => Builder.mutate(() => { c.compass = false; Builder.state.selected = null; });
    panel.appendChild(tog);
  }

  /* ── Main property panel controller ── */

  function refreshProps() {
    const state = Builder.state;
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
      del.onclick = Builder.deleteSelected;
      panel.appendChild(del);
    }
  }

  // Expose
  Builder.detectIntersections = detectIntersections;
  Builder.refreshProps = refreshProps;
})();
