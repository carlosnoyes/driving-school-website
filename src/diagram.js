// diagram.js — JSON-driven diagram engine
// Reads a diagram config object and renders a complete SVG driving diagram.
//
// Depends on: primitives.js (SVG, Terrain, Roads, Intersections, Vehicles, Signals, Parking, Compass)

const Diagram = (() => {

  /* ── Default values ── */
  const DEFAULTS = {
    laneWidth: 50,
    shoulder: -1,          // -1 = no shoulder
    radius: 25,
    stallWidth: 50,
    stallDepth: 100,
    vehicleWidth: 30,      // 0.6 × laneWidth
    vehicleHeight: 75,     // 1.5 × laneWidth (medium)
  };

  // Vehicle sizes: width is always 0.6 × laneWidth, length varies
  const VEHICLE_SIZES = {
    small:  { width: 30, height: 60 },   // 1.2 × laneWidth
    medium: { width: 30, height: 75 },   // 1.5 × laneWidth
    large:  { width: 30, height: 90 },   // 1.8 × laneWidth
  };

  /**
   * Apply defaults to a config — fills in missing values so individual
   * configs can omit common parameters.  Also handles the `zoom` parameter:
   * a multiplier applied to ALL positional / dimensional values.
   *
   * @param {object} raw - the raw JSON config
   * @returns {object} config with defaults merged and zoom applied
   */
  function applyDefaults(raw) {
    const d = { ...DEFAULTS, ...(raw.defaults || {}) };

    // Deep-clone to avoid mutating the original
    const cfg = JSON.parse(JSON.stringify(raw));

    // Canvas
    cfg.canvas = cfg.canvas || {};
    cfg.canvas.width = cfg.canvas.width || 816;
    cfg.canvas.height = cfg.canvas.height || 1056;
    const cW = cfg.canvas.width;
    const cH = cfg.canvas.height;

    // Roads
    (cfg.roads || []).forEach(r => {
      r.laneWidth = r.laneWidth ?? d.laneWidth;
      if (r.orientation === 'vertical') {
        r.from = r.from ?? 0;
        r.to = r.to ?? cH;
      } else {
        r.from = r.from ?? 0;
        r.to = r.to ?? cW;
      }
      if (r.shoulder == null && d.shoulder >= 0) r.shoulder = d.shoulder;
    });

    // Intersections — derive center from roads if not explicit
    const roadLookup = {};
    (cfg.roads || []).forEach(r => { roadLookup[r.id] = r; });
    (cfg.intersections || []).forEach(ix => {
      if (!ix.center && ix.roads && ix.roads.length >= 2) {
        const r0 = roadLookup[ix.roads[0]];
        const r1 = roadLookup[ix.roads[1]];
        if (r0 && r1) {
          const vRoad = r0.orientation === 'vertical' ? r0 : r1;
          const hRoad = r0.orientation === 'horizontal' ? r0 : r1;
          ix.center = [vRoad.center, hRoad.center];
        }
      }
      ix.radius = ix.radius ?? d.radius;
    });

    // Parking lots
    (cfg.parkingLots || []).forEach(lot => {
      (lot.rows || []).forEach(row => {
        row.stallWidth = row.stallWidth ?? d.stallWidth;
        row.stallDepth = row.stallDepth ?? d.stallDepth;
      });
    });

    // Entrances — derive center, shoulder, radius from linked road
    (cfg.entrances || []).forEach(ent => {
      const road = ent.road ? roadLookup[ent.road] : null;
      if (ent.center && Array.isArray(ent.center)) {
        // Already [x, y] — keep as-is
      } else if (road) {
        const pos = ent.position ?? ent.center ?? 0;
        if (road.orientation === 'vertical') {
          ent.center = [road.center, pos];
        } else {
          ent.center = [pos, road.center];
        }
      }
      if (ent.radius == null && road) {
        ent.radius = road.shoulder != null && road.shoulder >= 0 ? road.shoulder : d.radius;
      }
      if (ent.shoulder == null && road && road.shoulder != null && road.shoulder >= 0) {
        ent.shoulder = road.shoulder;
      }
    });

    // Vehicles — resolve size preset, then fill defaults
    (cfg.vehicles || []).forEach(v => {
      const sz = v.size ? (VEHICLE_SIZES[v.size] || VEHICLE_SIZES.medium) : VEHICLE_SIZES.medium;
      v.width = v.width ?? sz.width;
      v.height = v.height ?? sz.height;
    });

    // Build intersection lookup (for signal/stopLine derivation)
    const ixLookup = {};
    (cfg.intersections || []).forEach(ix => {
      if (ix.id) ixLookup[ix.id] = ix;
    });

    // Helper: get intersection geometry
    function ixGeom(ix) {
      const r0 = roadLookup[ix.roads?.[0]];
      const r1 = roadLookup[ix.roads?.[1]];
      if (!r0 || !r1) return null;
      const vRoad = r0.orientation === 'vertical' ? r0 : r1;
      const hRoad = r0.orientation === 'horizontal' ? r0 : r1;
      const vSh = (vRoad.shoulder != null && vRoad.shoulder >= 0) ? vRoad.shoulder : 0;
      const hSh = (hRoad.shoulder != null && hRoad.shoulder >= 0) ? hRoad.shoulder : 0;
      return {
        halfH: Roads.roadWidth(vRoad.laneWidth, vRoad.lanesPerDirection, vRoad.median, vRoad.shoulder) / 2,
        halfW: Roads.roadWidth(hRoad.laneWidth, hRoad.lanesPerDirection, hRoad.median, hRoad.shoulder) / 2,
        vShoulder: vSh,
        hShoulder: hSh,
      };
    }

    // Signals — derive position from intersection + approach if not explicit
    const sigLookup = {};
    (cfg.signals || []).forEach(sig => {
      const ix = sig.intersection ? ixLookup[sig.intersection] : null;
      if (ix && sig.approach && ix.center) {
        const g = ixGeom(ix);
        if (!g) return;
        const gap = sig.gap ?? 18;
        const cx = ix.center[0], cy = ix.center[1];
        if (sig.approach === 'north') {
          sig.x = sig.x ?? cx - g.halfH + g.vShoulder - gap;
          sig.y = sig.y ?? cy - g.halfW - gap;
        } else if (sig.approach === 'south') {
          sig.x = sig.x ?? cx + g.halfH - g.vShoulder + gap;
          sig.y = sig.y ?? cy + g.halfW + gap;
        } else if (sig.approach === 'east') {
          sig.x = sig.x ?? cx + g.halfH + gap;
          sig.y = sig.y ?? cy - g.halfW + g.hShoulder - gap;
        } else if (sig.approach === 'west') {
          sig.x = sig.x ?? cx - g.halfH - gap;
          sig.y = sig.y ?? cy + g.halfW - g.hShoulder + gap;
        }
      }
      if (sig.id) sigLookup[sig.id] = sig;
    });

    // Stop lines — derive from signal's intersection + approach if not explicit
    (cfg.stopLines || []).forEach(sl => {
      const sig = sl.signal ? sigLookup[sl.signal] : null;
      const ix = sig?.intersection ? ixLookup[sig.intersection] : null;
      if (ix && sig?.approach && ix.center) {
        const g = ixGeom(ix);
        if (!g) return;
        const offset = sl.offset ?? 15;
        const cx = ix.center[0], cy = ix.center[1];
        if (sig.approach === 'north') {
          const ly = cy - g.halfW - offset;
          sl.x1 = sl.x1 ?? cx - g.halfH + g.vShoulder;
          sl.y1 = sl.y1 ?? ly;
          sl.x2 = sl.x2 ?? cx;
          sl.y2 = sl.y2 ?? ly;
        } else if (sig.approach === 'south') {
          const ly = cy + g.halfW + offset;
          sl.x1 = sl.x1 ?? cx;
          sl.y1 = sl.y1 ?? ly;
          sl.x2 = sl.x2 ?? cx + g.halfH - g.vShoulder;
          sl.y2 = sl.y2 ?? ly;
        } else if (sig.approach === 'east') {
          const lx = cx + g.halfH + offset;
          sl.x1 = sl.x1 ?? lx;
          sl.y1 = sl.y1 ?? cy - g.halfW + g.hShoulder;
          sl.x2 = sl.x2 ?? lx;
          sl.y2 = sl.y2 ?? cy;
        } else if (sig.approach === 'west') {
          const lx = cx - g.halfH - offset;
          sl.x1 = sl.x1 ?? lx;
          sl.y1 = sl.y1 ?? cy;
          sl.x2 = sl.x2 ?? lx;
          sl.y2 = sl.y2 ?? cy + g.halfW - g.hShoulder;
        }
      }
    });

    return cfg;
  }

  function render(container, rawCfg) {
    const cfg = applyDefaults(rawCfg);
    const W = cfg.canvas.width;
    const H = cfg.canvas.height;
    const svg = SVG.create(container, W, H);

    // Zoom via viewBox — scales everything proportionally (line widths, text, etc.)
    const z = rawCfg.zoom || 1;
    if (z !== 1) {
      const vbW = W / z, vbH = H / z;
      const origin = rawCfg.zoomOrigin || 'origin';
      let vbX = 0, vbY = 0;
      if (origin === 'center') {
        vbX = (W - vbW) / 2;
        vbY = (H - vbH) / 2;
      }
      svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
    }

    // Build road lookup
    const roadMap = {};
    (cfg.roads || []).forEach(r => { roadMap[r.id] = r; });

    // Build intersection lookup (to know road-to-road junction points)
    const junctions = (cfg.intersections || []).map(ix => {
      const cx = ix.center[0], cy = ix.center[1];
      const r0 = roadMap[ix.roads?.[0]];
      const r1 = roadMap[ix.roads?.[1]];
      let halfH = 0, halfW = 0;
      if (r0 && r1) {
        const vRoad = r0.orientation === 'vertical' ? r0 : r1;
        const hRoad = r0.orientation === 'horizontal' ? r0 : r1;
        halfH = Roads.roadWidth(vRoad.laneWidth, vRoad.lanesPerDirection, vRoad.median, vRoad.shoulder) / 2;
        halfW = Roads.roadWidth(hRoad.laneWidth, hRoad.lanesPerDirection, hRoad.median, hRoad.shoulder) / 2;
      }
      return { ...ix, cx, cy, halfH, halfW };
    });

    // 1. Background — fill the visible area with grass
    //    When zoomed, the viewBox shows a sub-region, so we fill the full canvas
    //    to ensure coverage regardless of zoom origin.
    Terrain.fillArea(svg, 0, 0, W, H);

    // 2. Roads
    (cfg.roads || []).forEach(r => {
      renderRoad(svg, r, junctions);
    });

    // 4. Parking lots
    (cfg.parkingLots || []).forEach(lot => {
      renderParkingLot(svg, lot);
    });

    // 5. Connectors (entrance ramps, exit ramps — simple filled rects)
    (cfg.connectors || []).forEach(c => {
      SVG.rect(svg, c.x, c.y, c.width, c.height, { fill: c.fill || Parking.D.surfaceColor });
    });

    // 6. Intersections (fill the junction area + optional signals)
    junctions.forEach(ix => {
      if (ix.type === 'fourWay') {
        Intersections.fourWay(svg, ix.cx, ix.cy, ix.halfW, ix.halfH);
      } else if (ix.type === 'tJunction') {
        Intersections.tJunction(svg, ix.cx, ix.cy, ix.blockedSide, ix.halfW, ix.halfH);
      }

      // Junction overlay with rounded corners (if radius is specified)
      if (ix.radius != null) {
        const arms = { north: true, south: true, east: true, west: true };
        const noCurb = {};
        if (ix.blockedSide) {
          arms[ix.blockedSide] = false;
          // T-junction: don't draw curb on blocked side — through-road handles it
          if (ix.type === 'tJunction') noCurb[ix.blockedSide] = true;
        }
        if (ix.blockedSides) ix.blockedSides.forEach(s => { arms[s] = false; });
        const jr0 = roadMap[ix.roads?.[0]];
        const jr1 = roadMap[ix.roads?.[1]];
        const jSh = Math.max(jr0?.shoulder ?? -1, jr1?.shoulder ?? -1);
        Intersections.junction(svg, ix.cx, ix.cy, ix.halfH, ix.halfW, {
          radius: ix.radius,
          arms,
          noCurb,
          blockedSide: ix.blockedSide,
          roadColor: ix.roadColor,
          curbColor: ix.curbColor,
          curbWidth: ix.curbWidth,
          shoulder: jSh,
        });
      }
    });

    // 6b. Entrances (road-to-parking-lot junctions with rounded corners)
    (cfg.entrances || []).forEach(ent => {
      const road = roadMap[ent.road];
      if (!road) return;
      const roadHalf = Roads.roadWidth(road.laneWidth, road.lanesPerDirection, road.median, road.shoulder) / 2;
      const entHalf = ent.halfWidth || 50;
      const ecx = ent.center[0], ecy = ent.center[1];

      const side = ent.side;
      const oppositeSide = { north: 'south', south: 'north', east: 'west', west: 'east' }[side];
      const arms = { north: false, south: false, east: false, west: false };
      const noCurb = {};

      let halfH, halfW, jcx, jcy;
      const overlap = 5;
      if (road.orientation === 'vertical') {
        const entranceSideSign = (side === 'east') ? 1 : -1;
        halfH = (roadHalf + overlap) / 2;
        jcx = road.center + entranceSideSign * (roadHalf - overlap) / 2;
        jcy = ecy;
        halfW = entHalf;
        arms.north = true;
        arms.south = true;
        arms[side] = true;
        noCurb[oppositeSide] = true;
      } else {
        const entranceSideSign = (side === 'south') ? 1 : -1;
        jcx = ecx;
        halfW = (roadHalf + overlap) / 2;
        jcy = road.center + entranceSideSign * (roadHalf - overlap) / 2;
        halfH = entHalf;
        arms.east = true;
        arms.west = true;
        arms[side] = true;
        noCurb[oppositeSide] = true;
      }

      const sh = ent.shoulder ?? (road.shoulder ?? -1);
      Intersections.junction(svg, jcx, jcy, halfH, halfW, {
        radius: ent.radius ?? 15,
        arms,
        noCurb,
        roadColor: ent.roadColor,
        curbColor: ent.curbColor,
        curbWidth: ent.curbWidth,
        shoulder: sh,
      });

    });

    // 7. Stop lines (solid white lines across lanes)
    (cfg.stopLines || []).forEach(sl => {
      SVG.line(svg, sl.x1, sl.y1, sl.x2, sl.y2, {
        stroke: sl.color || '#fff',
        'stroke-width': sl.width || 3,
      });
    });

    // 7b. Signals (rendered after stop lines so signs layer on top)
    (cfg.signals || []).forEach(s => {
      if (s.type === 'stopSign') Signals.stopSign(svg, s.x, s.y, s);
      else if (s.type === 'trafficLight') Signals.trafficLight(svg, s.x, s.y, s);
      else if (s.type === 'laneArrow') Signals.laneArrow(svg, s.x, s.y, s.direction, s);
    });

    // 8. Vehicles
    (cfg.vehicles || []).forEach(v => {
      if (v.road) {
        renderLaneVehicle(svg, v, roadMap, junctions);
      } else if (v.parkingLot != null) {
        renderStallVehicle(svg, v, cfg);
      } else {
        Vehicles.car(svg, v.x, v.y, v);
      }
    });

    // 9. Decorations
    (cfg.decorations || []).forEach(d => {
      if (d.type === 'compass') Compass.draw(svg, d.x, d.y, d.size);
    });

    return svg;
  }

  /* ── Road rendering ── */
  function renderRoad(svg, r, junctions) {
    const opts = {
      laneWidth: r.laneWidth,
      lanesPerDirection: r.lanesPerDirection,
      laneLine: r.laneLine,
      centerLineStyle: r.centerLineStyle,
      roadColor: r.roadColor,
      median: r.median,
      medianColor: r.medianColor,
      shoulder: r.shoulder,
    };
    if (r.orientation === 'vertical') {
      Roads.verticalRoad(svg, r.center, r.from, r.to, opts);
    } else {
      Roads.horizontalRoad(svg, r.center, r.from, r.to, opts);
    }
  }

  /* ── Parking lot rendering ── */
  function renderParkingLot(svg, lot) {
    Parking.surface(svg, lot.x, lot.y, lot.width, lot.height);
    (lot.rows || []).forEach(row => {
      const opts = { stallWidth: row.stallWidth, stallDepth: row.stallDepth, direction: row.direction };
      const rx = row.x ?? lot.x + (row.offsetX || 0);
      const ry = row.y ?? lot.y + (row.offsetY || 0);
      const count = row.stallsPerRow || row.stallsPerColumn || 1;
      if (row.orientation === 'vertical') {
        if (row.type === 'double') {
          Parking.doubleColumn(svg, rx, ry, count, opts);
        } else {
          Parking.stallColumn(svg, rx, ry, count, opts);
        }
      } else {
        if (row.type === 'double') {
          Parking.doubleRow(svg, rx, ry, count, opts);
        } else {
          Parking.stallRow(svg, rx, ry, count, opts);
        }
      }
    });
  }

  /* ── Lane-relative vehicle placement ── */
  function renderLaneVehicle(svg, v, roadMap, junctions) {
    const road = roadMap[v.road];
    if (!road) return;

    const lw = road.laneWidth || Roads.D.laneWidth;
    const lpd = road.lanesPerDirection || 1;
    const halfRoad = (lw * lpd * 2) / 2;
    const t = v.t || 0.5;
    const lane = v.lane || 0;
    const carW = v.width;
    const carH = v.height;

    // Find the junction this arm belongs to
    let jx = null;
    for (const j of junctions) {
      const jr = j.roads || [];
      if (jr.includes(road.id)) { jx = j; break; }
    }

    let cx, cy, direction;

    if (road.orientation === 'vertical') {
      const center = road.center;
      const laneOffset = lw / 2 + lane * lw;

      if (v.side === 'right') {
        cx = center + laneOffset;
        direction = 'south';
      } else {
        cx = center - laneOffset;
        direction = 'north';
      }

      if (jx) {
        const intEdge = jx.cy - jx.halfW; // top edge of intersection for north arm
        if (v.arm === 'north') {
          const armStart = road.from;
          const armEnd = jx.cy - jx.halfW;
          cy = armStart + t * (armEnd - armStart);
        } else {
          const armStart = jx.cy + jx.halfW;
          const armEnd = road.to;
          cy = armEnd - t * (armEnd - armStart);
        }
      } else {
        cy = road.from + t * (road.to - road.from);
      }
    } else {
      const center = road.center;
      const laneOffset = lw / 2 + lane * lw;

      if (v.side === 'right') {
        cy = center + laneOffset;
        direction = 'east';
      } else {
        cy = center - laneOffset;
        direction = 'west';
      }

      if (jx) {
        if (v.arm === 'west') {
          const armStart = road.from;
          const armEnd = jx.cx - jx.halfH;
          cx = armStart + t * (armEnd - armStart);
        } else {
          const armStart = jx.cx + jx.halfH;
          const armEnd = road.to;
          cx = armEnd - t * (armEnd - armStart);
        }
      } else {
        cx = road.from + t * (road.to - road.from);
      }
    }

    Vehicles.car(svg, cx, cy, { direction, color: v.color, width: carW, height: carH, rotation: v.rotation });
  }

  /* ── Parking-stall vehicle placement ── */
  function renderStallVehicle(svg, v, cfg) {
    const lot = (cfg.parkingLots || [])[v.parkingLot];
    if (!lot) return;
    const row = (lot.rows || [])[v.row ?? 0];
    if (!row) return;

    const sw = row.stallWidth ?? Parking.D.stallWidth;
    const sd = row.stallDepth ?? Parking.D.stallDepth;
    const rx = row.x ?? lot.x + (row.offsetX || 0);
    const ry = row.y ?? lot.y + (row.offsetY || 0);
    const stallIdx = v.stall ?? 0;
    const isVertical = row.orientation === 'vertical';
    const carH = v.height;

    // Nose-alignment offset: shift car so noses align at the medium-car reference depth.
    // Positive pullSign = nose points toward increasing coordinate.
    const medH = VEHICLE_SIZES.medium.height;
    const pullDelta = (medH - carH) / 2;

    let cx, cy, direction;

    if (isVertical) {
      cy = ry + stallIdx * sw + sw / 2;
      if (row.type === 'double') {
        if ((v.subRow || 'left') === 'left') {
          cx = rx + sd / 2;
          direction = 'east';
        } else {
          cx = rx + sd + sd / 2;
          direction = 'west';
        }
      } else {
        cx = rx + sd / 2;
        direction = (row.direction === 'right') ? 'east' : 'west';
      }
      // Apply pull-in offset along x axis
      cx += (direction === 'east' ? pullDelta : -pullDelta);
    } else {
      cx = rx + stallIdx * sw + sw / 2;
      if (row.type === 'double') {
        if ((v.subRow || 'top') === 'top') {
          cy = ry + sd / 2;
          direction = 'south';
        } else {
          cy = ry + sd + sd / 2;
          direction = 'north';
        }
      } else {
        cy = ry + sd / 2;
        direction = (row.direction === 'down') ? 'south' : 'north';
      }
      // Apply pull-in offset along y axis
      cy += (direction === 'south' ? pullDelta : -pullDelta);
    }

    Vehicles.car(svg, cx, cy, {
      direction: v.direction || direction,
      color: v.color,
      width: v.width,
      height: v.height,
      rotation: v.rotation,
    });
  }

  /* ── Export as PNG ── */
  function addExportButton(container, filename = 'diagram.png') {
    const btn = document.createElement('button');
    btn.textContent = 'Export PNG';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      padding: '10px 20px', fontSize: '14px', cursor: 'pointer',
      background: '#4a90d9', color: 'white', border: 'none', borderRadius: '6px',
      zIndex: 1000,
    });
    btn.onclick = () => {
      const svgEl = container.querySelector('svg');
      if (!svgEl) return;
      const data = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svgEl.getAttribute('width');
        canvas.height = svgEl.getAttribute('height');
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const a = document.createElement('a');
        a.download = filename;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = url;
    };
    document.body.appendChild(btn);
  }

  return { DEFAULTS, render, addExportButton };
})();
