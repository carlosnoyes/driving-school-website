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
    vehicleWidth: 22,
    vehicleHeight: 36,
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
    const z = raw.zoom || 1;

    // Helper: scale a number by zoom
    const s = v => (v != null ? v * z : v);
    // Helper: scale, falling back to a default
    const sd = (v, def) => s(v != null ? v : def);

    // Deep-clone to avoid mutating the original
    const cfg = JSON.parse(JSON.stringify(raw));

    // Scale canvas
    if (cfg.canvas) {
      cfg.canvas.width = s(cfg.canvas.width) || 816 * z;
      cfg.canvas.height = s(cfg.canvas.height) || 1056 * z;
    }

    // Canvas dimensions (needed for road from/to defaults)
    const cW = cfg.canvas?.width || 816;
    const cH = cfg.canvas?.height || 1056;

    // Roads
    (cfg.roads || []).forEach(r => {
      r.laneWidth = sd(r.laneWidth, d.laneWidth);
      r.center = s(r.center);
      // Default from/to: span the full canvas
      if (r.orientation === 'vertical') {
        r.from = s(r.from != null ? r.from : 0);
        r.to = s(r.to != null ? r.to : cH);
      } else {
        r.from = s(r.from != null ? r.from : 0);
        r.to = s(r.to != null ? r.to : cW);
      }
      if (r.shoulder != null && r.shoulder >= 0) r.shoulder = s(r.shoulder);
      else if (d.shoulder >= 0) r.shoulder = s(d.shoulder);
      if (r.median != null) r.median = s(r.median);
    });

    // Intersections — derive center from roads if not explicit
    const roadLookup = {};
    (cfg.roads || []).forEach(r => { roadLookup[r.id] = r; });
    (cfg.intersections || []).forEach(ix => {
      if (ix.center) {
        ix.center = ix.center.map(v => s(v));
      } else if (ix.roads && ix.roads.length >= 2) {
        const r0 = roadLookup[ix.roads[0]];
        const r1 = roadLookup[ix.roads[1]];
        if (r0 && r1) {
          const vRoad = r0.orientation === 'vertical' ? r0 : r1;
          const hRoad = r0.orientation === 'horizontal' ? r0 : r1;
          ix.center = [vRoad.center, hRoad.center];
        }
      }
      ix.radius = sd(ix.radius, d.radius);
    });

    // Parking lots
    (cfg.parkingLots || []).forEach(lot => {
      lot.x = s(lot.x); lot.y = s(lot.y);
      lot.width = s(lot.width); lot.height = s(lot.height);
      (lot.rows || []).forEach(row => {
        if (row.x != null) row.x = s(row.x);
        if (row.y != null) row.y = s(row.y);
        if (row.offsetX != null) row.offsetX = s(row.offsetX);
        if (row.offsetY != null) row.offsetY = s(row.offsetY);
        row.stallWidth = sd(row.stallWidth, d.stallWidth);
        row.stallDepth = sd(row.stallDepth, d.stallDepth);
      });
    });

    // Connectors
    (cfg.connectors || []).forEach(c => {
      c.x = s(c.x); c.y = s(c.y);
      c.width = s(c.width); c.height = s(c.height);
    });

    // Entrances — derive center, shoulder, radius from linked road
    (cfg.entrances || []).forEach(ent => {
      const road = ent.road ? roadLookup[ent.road] : null;
      if (ent.center && Array.isArray(ent.center)) {
        // Legacy [x, y] format — scale both
        ent.center = ent.center.map(v => s(v));
      } else if (road) {
        // Single number = position along the road; derive full center from road
        const pos = s(ent.position != null ? ent.position : (ent.center != null ? ent.center : 0));
        if (road.orientation === 'vertical') {
          ent.center = [road.center, pos];
        } else {
          ent.center = [pos, road.center];
        }
      }
      if (ent.halfWidth != null) ent.halfWidth = s(ent.halfWidth);
      // Default radius and shoulder from road
      if (ent.radius != null) ent.radius = s(ent.radius);
      else if (road) ent.radius = road.shoulder != null && road.shoulder >= 0 ? road.shoulder : d.radius;
      if (ent.shoulder != null) ent.shoulder = s(ent.shoulder);
      else if (road && road.shoulder != null && road.shoulder >= 0) ent.shoulder = road.shoulder;
    });

    // Vehicles
    (cfg.vehicles || []).forEach(v => {
      if (v.x != null) v.x = s(v.x);
      if (v.y != null) v.y = s(v.y);
      v.width = sd(v.width, d.vehicleWidth);
      v.height = sd(v.height, d.vehicleHeight);
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
    // (x, y) = pole base. Sign placed just outside the intersection on the
    // approaching-lane side, outside the shoulder.
    const sigLookup = {};
    (cfg.signals || []).forEach(sig => {
      const ix = sig.intersection ? ixLookup[sig.intersection] : null;
      if (ix && sig.approach && ix.center) {
        const g = ixGeom(ix);
        if (!g) return;
        const gap = s(sig.gap != null ? sig.gap : 18);
        const cx = ix.center[0], cy = ix.center[1];
        if (sig.approach === 'north') {
          // Going south — sign on west side of road, above intersection
          sig.x = sig.x != null ? s(sig.x) : cx - g.halfH + g.vShoulder - gap;
          sig.y = sig.y != null ? s(sig.y) : cy - g.halfW - gap;
        } else if (sig.approach === 'south') {
          // Going north — sign on east side of road, below intersection
          sig.x = sig.x != null ? s(sig.x) : cx + g.halfH - g.vShoulder + gap;
          sig.y = sig.y != null ? s(sig.y) : cy + g.halfW + gap;
        } else if (sig.approach === 'east') {
          // Going west — sign on north side of road, right of intersection
          sig.x = sig.x != null ? s(sig.x) : cx + g.halfH + gap;
          sig.y = sig.y != null ? s(sig.y) : cy - g.halfW + g.hShoulder - gap;
        } else if (sig.approach === 'west') {
          // Going east — sign on south side of road, left of intersection
          sig.x = sig.x != null ? s(sig.x) : cx - g.halfH - gap;
          sig.y = sig.y != null ? s(sig.y) : cy + g.halfW - g.hShoulder + gap;
        }
      } else {
        if (sig.x != null) sig.x = s(sig.x);
        if (sig.y != null) sig.y = s(sig.y);
      }
      if (sig.id) sigLookup[sig.id] = sig;
    });

    // Stop lines — derive from signal's intersection + approach if not explicit
    // Line spans from inner shoulder edge to the center of the road
    (cfg.stopLines || []).forEach(sl => {
      const sig = sl.signal ? sigLookup[sl.signal] : null;
      const ix = sig?.intersection ? ixLookup[sig.intersection] : null;
      if (ix && sig?.approach && ix.center) {
        const g = ixGeom(ix);
        if (!g) return;
        const offset = s(sl.offset != null ? sl.offset : 15);
        const cx = ix.center[0], cy = ix.center[1];
        if (sig.approach === 'north') {
          // Horizontal line above intersection, spanning west approaching lanes
          // From inner shoulder (cx - halfH + vShoulder) to center (cx)
          const ly = cy - g.halfW - offset;
          sl.x1 = sl.x1 != null ? s(sl.x1) : cx - g.halfH + g.vShoulder;
          sl.y1 = sl.y1 != null ? s(sl.y1) : ly;
          sl.x2 = sl.x2 != null ? s(sl.x2) : cx;
          sl.y2 = sl.y2 != null ? s(sl.y2) : ly;
        } else if (sig.approach === 'south') {
          const ly = cy + g.halfW + offset;
          sl.x1 = sl.x1 != null ? s(sl.x1) : cx;
          sl.y1 = sl.y1 != null ? s(sl.y1) : ly;
          sl.x2 = sl.x2 != null ? s(sl.x2) : cx + g.halfH - g.vShoulder;
          sl.y2 = sl.y2 != null ? s(sl.y2) : ly;
        } else if (sig.approach === 'east') {
          const lx = cx + g.halfH + offset;
          sl.x1 = sl.x1 != null ? s(sl.x1) : lx;
          sl.y1 = sl.y1 != null ? s(sl.y1) : cy - g.halfW + g.hShoulder;
          sl.x2 = sl.x2 != null ? s(sl.x2) : lx;
          sl.y2 = sl.y2 != null ? s(sl.y2) : cy;
        } else if (sig.approach === 'west') {
          const lx = cx - g.halfH - offset;
          sl.x1 = sl.x1 != null ? s(sl.x1) : lx;
          sl.y1 = sl.y1 != null ? s(sl.y1) : cy;
          sl.x2 = sl.x2 != null ? s(sl.x2) : lx;
          sl.y2 = sl.y2 != null ? s(sl.y2) : cy + g.halfW - g.hShoulder;
        }
      } else {
        if (sl.x1 != null) sl.x1 = s(sl.x1);
        if (sl.y1 != null) sl.y1 = s(sl.y1);
        if (sl.x2 != null) sl.x2 = s(sl.x2);
        if (sl.y2 != null) sl.y2 = s(sl.y2);
      }
      if (sl.width != null) sl.width = s(sl.width);
    });

    // Decorations
    (cfg.decorations || []).forEach(dec => {
      if (dec.x != null) dec.x = s(dec.x);
      if (dec.y != null) dec.y = s(dec.y);
      if (dec.size != null) dec.size = s(dec.size);
    });

    return cfg;
  }

  function render(container, rawCfg) {
    const cfg = applyDefaults(rawCfg);
    const W = cfg.canvas?.width || 816;
    const H = cfg.canvas?.height || 1056;
    const svg = SVG.create(container, W, H);

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

    // 1. Background — always full-canvas grass, everything else layers on top
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

    // 7. Signals
    (cfg.signals || []).forEach(s => {
      if (s.type === 'stopSign') Signals.stopSign(svg, s.x, s.y, s);
      else if (s.type === 'trafficLight') Signals.trafficLight(svg, s.x, s.y, s);
      else if (s.type === 'laneArrow') Signals.laneArrow(svg, s.x, s.y, s.direction, s);
    });

    // 7b. Stop lines (solid white lines across lanes)
    (cfg.stopLines || []).forEach(sl => {
      SVG.line(svg, sl.x1, sl.y1, sl.x2, sl.y2, {
        stroke: sl.color || '#fff',
        'stroke-width': sl.width || 3,
      });
    });

    // 8. Vehicles
    (cfg.vehicles || []).forEach(v => {
      if (v.road) {
        renderLaneVehicle(svg, v, roadMap, junctions);
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
    const carW = v.width || DEFAULTS.vehicleWidth;
    const carH = v.height || DEFAULTS.vehicleHeight;

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

    Vehicles.car(svg, cx, cy, { direction, color: v.color, width: carW, height: carH });
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
