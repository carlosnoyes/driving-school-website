// diagram.js — JSON-driven diagram engine
// Reads a diagram config object and renders a complete SVG driving diagram.
//
// Depends on: primitives.js (SVG, Terrain, Roads, Intersections, Vehicles, Signals, Parking, Compass)

const Diagram = (() => {

  /* ── Default values ── */
  const DEFAULTS = {
    laneWidth: 50,
    shoulder: 10,
    radius: 25,
    stallWidth: 50,
    stallDepth: 100,
    laneGap: 100,           // driving-lane width in parking lots (2 × laneWidth)
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
    cfg.canvas.width = cfg.canvas.width || 1057;
    cfg.canvas.height = cfg.canvas.height || 817;
    const cW = cfg.canvas.width;
    const cH = cfg.canvas.height;

    // Parking lots — apply row defaults, compute dimensions, then convert
    // center-point x,y to top-left _x,_y for rendering.
    (cfg.parkingLots || []).forEach(lot => {
      const rows = lot.rows || [];
      rows.forEach(row => {
        row.stallWidth = row.stallWidth ?? d.stallWidth;
        row.stallDepth = row.stallDepth ?? d.stallDepth;
      });
      if (rows.length === 0) return;

      const EDGE_CLOSE = 10;
      const isVertical = rows[0].orientation === 'vertical';
      const sw0 = rows[0].stallWidth;
      const laneGap = lot.laneGap ?? d.laneGap;
      lot._laneGap = laneGap;  // store for rendering

      // Normalize per-row splits — stall indices where orthogonal driving lanes cut through
      rows.forEach(row => {
        row._splits = (row.splits || []).slice().sort((a, b) => a - b);
      });

      // Parse edgeMargin — applies to the perpendicular-to-stacking dimension
      // "close" (10px) or "far" (laneGap) on each side
      let emStart, emEnd;
      if (Array.isArray(lot.edgeMargin)) {
        emStart = lot.edgeMargin[0] === 'close' ? EDGE_CLOSE : laneGap;
        emEnd   = lot.edgeMargin[1] === 'close' ? EDGE_CLOSE : laneGap;
      } else {
        const px = (lot.edgeMargin || 'far') === 'close' ? EDGE_CLOSE : laneGap;
        emStart = px;
        emEnd   = px;
      }

      if (!isVertical) {
        // Horizontal rows — stack along Y, stalls along X

        // Auto-calculate row Y offsets and lot height
        if (lot.height == null) {
          let curY = (rows[0].type === 'double') ? laneGap : EDGE_CLOSE;
          rows.forEach((row, i) => {
            if (i > 0) curY += laneGap;  // driving-lane gap
            if (row.y == null && row.offsetY == null) row.offsetY = curY;
            curY += (row.type === 'double') ? row.stallDepth * 2 : row.stallDepth;
          });
          const lastRow = rows[rows.length - 1];
          curY += (lastRow.type === 'double') ? laneGap : EDGE_CLOSE;
          lot.height = curY;
        }

        // Auto-calculate row X offsets and lot width
        const maxRowWidth = Math.max(...rows.map(r => {
          const cnt = r.stallsPerRow || 1;
          const numSplits = r._splits.filter(s => s > 0 && s < cnt).length;
          return cnt * sw0 + numSplits * laneGap;
        }));
        if (lot.width == null) {
          lot.width = emStart + maxRowWidth + emEnd;
        }
        rows.forEach(row => {
          if (row.x == null && row.offsetX == null) row.offsetX = emStart;
        });

      } else {
        // Vertical columns — stack along X, stalls along Y

        if (lot.width == null) {
          let curX = (rows[0].type === 'double') ? laneGap : EDGE_CLOSE;
          rows.forEach((row, i) => {
            if (i > 0) curX += laneGap;
            if (row.x == null && row.offsetX == null) row.offsetX = curX;
            curX += (row.type === 'double') ? row.stallDepth * 2 : row.stallDepth;
          });
          const lastRow = rows[rows.length - 1];
          curX += (lastRow.type === 'double') ? laneGap : EDGE_CLOSE;
          lot.width = curX;
        }

        const maxColHeight = Math.max(...rows.map(r => {
          const cnt = r.stallsPerColumn || 1;
          const numSplits = r._splits.filter(s => s > 0 && s < cnt).length;
          return cnt * sw0 + numSplits * laneGap;
        }));
        if (lot.height == null) {
          lot.height = emStart + maxColHeight + emEnd;
        }
        rows.forEach(row => {
          if (row.y == null && row.offsetY == null) row.offsetY = emStart;
        });
      }

      // Convert center-point x,y to top-left _x,_y for rendering
      lot._x = (lot.x ?? 0) - lot.width / 2;
      lot._y = (lot.y ?? 0) - lot.height / 2;

      // Compute entrance positions (absolute coordinates).
      // position: -1 to 1 along the wall (0 = center, default 0).
      const cx = lot.x ?? 0, cy = lot.y ?? 0;
      lot._entrances = (lot.entrances || []).map(ent => {
        const side = ent.side || 'west';
        const pos = ent.position ?? 0;
        let ex, ey;
        if (side === 'west' || side === 'east') {
          ex = (side === 'west') ? lot._x : lot._x + lot.width;
          ey = cy + pos * (lot.height / 2);
        } else {
          ex = cx + pos * (lot.width / 2);
          ey = (side === 'north') ? lot._y : lot._y + lot.height;
        }
        return { side, x: ex, y: ey, laneGap };
      });
    });

    // Build lot lookup for road references
    const lotLookup = {};
    (cfg.parkingLots || []).forEach(lot => { if (lot.id) lotLookup[lot.id] = lot; });

    // Resolve a string reference to a numeric value.
    // Supports "roadId", "lotId" (first entrance), or "lotId:N" (Nth entrance, 1-based).
    // axis: 'along' (from/to — same axis as road) or 'across' (center — perpendicular)
    function resolveRef(value, orientation, roadLookup, axis) {
      if (typeof value !== 'string') return value;
      if (roadLookup[value]) return roadLookup[value].center;
      // Parse "lotId:N" syntax for specific entrance
      const parts = value.split(':');
      const lotId = parts[0];
      const entIdx = parts.length > 1 ? (parseInt(parts[1], 10) - 1) : 0;
      const lot = lotLookup[lotId];
      if (lot) {
        const ent = lot._entrances[entIdx] || lot._entrances[0];
        if (!ent) return value;
        if (axis === 'across') {
          return orientation === 'horizontal' ? ent.y : ent.x;
        } else {
          return orientation === 'horizontal' ? ent.x : ent.y;
        }
      }
      return value;
    }

    // Roads — resolve string references, then apply defaults.
    // Roads are processed in order so later roads can reference earlier ones.
    const roadLookup = {};
    (cfg.roads || []).forEach(r => {
      r.center = resolveRef(r.center, r.orientation, roadLookup, 'across');
      r.from = resolveRef(r.from, r.orientation, roadLookup, 'along');
      r.to = resolveRef(r.to, r.orientation, roadLookup, 'along');
      r.laneWidth = r.laneWidth ?? d.laneWidth;
      if (r.orientation === 'vertical') {
        r.from = r.from ?? -cH / 2;
        r.to = r.to ?? cH / 2;
      } else {
        r.from = r.from ?? -cW / 2;
        r.to = r.to ?? cW / 2;
      }
      if (r.shoulder == null && d.shoulder >= 0) r.shoulder = d.shoulder;
      roadLookup[r.id] = r;
    });

    // Intersections — derive center from roads if not explicit
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

    // Intersection stop lines — derive positions from intersection + approach
    (cfg.intersections || []).forEach(ix => {
      if (!ix.center) return;
      const g = ixGeom(ix);
      if (!g) return;
      const cx = ix.center[0], cy = ix.center[1];

      (ix.stopLines || []).forEach(sl => {
        const approach = sl.approach;
        if (!approach) return;
        const offset = sl.offset ?? 15;
        if (approach === 'north') {
          const ly = cy - g.halfW - offset;
          sl.x1 = sl.x1 ?? cx - g.halfH + g.vShoulder;
          sl.y1 = sl.y1 ?? ly;
          sl.x2 = sl.x2 ?? cx;
          sl.y2 = sl.y2 ?? ly;
        } else if (approach === 'south') {
          const ly = cy + g.halfW + offset;
          sl.x1 = sl.x1 ?? cx;
          sl.y1 = sl.y1 ?? ly;
          sl.x2 = sl.x2 ?? cx + g.halfH - g.vShoulder;
          sl.y2 = sl.y2 ?? ly;
        } else if (approach === 'east') {
          const lx = cx + g.halfH + offset;
          sl.x1 = sl.x1 ?? lx;
          sl.y1 = sl.y1 ?? cy - g.halfW + g.hShoulder;
          sl.x2 = sl.x2 ?? lx;
          sl.y2 = sl.y2 ?? cy;
        } else if (approach === 'west') {
          const lx = cx - g.halfH - offset;
          sl.x1 = sl.x1 ?? lx;
          sl.y1 = sl.y1 ?? cy;
          sl.x2 = sl.x2 ?? lx;
          sl.y2 = sl.y2 ?? cy + g.halfW - g.hShoulder;
        }
      });

      // Intersection signals — derive positions from intersection + approach
      (ix.signals || []).forEach(sig => {
        const approach = sig.approach;
        if (!approach) return;

        if (sig.type === 'trafficLight') {
          // Place one light per lane, centered in each lane
          const isVertApproach = (approach === 'north' || approach === 'south');
          const r0 = roadLookup[ix.roads?.[0]];
          const r1 = roadLookup[ix.roads?.[1]];
          const road = isVertApproach
            ? (r0?.orientation === 'vertical' ? r0 : r1)
            : (r0?.orientation === 'horizontal' ? r0 : r1);
          if (!road) return;
          const lw = road.laneWidth || 50;
          const lpd = road.lanesPerDirection || 1;
          const med = road.median || 0;
          const offset = sig.offset ?? 15;
          const lanes = sig.lanes ?? Array.from({ length: lpd }, (_, i) => i);

          const dir = isVertApproach ? 'east' : 'south';
          sig._lights = lanes.map(lane => {
            let lx, ly;
            if (approach === 'north') {
              lx = cx - med / 2 - lw / 2 - lane * lw;
              ly = cy - g.halfW - offset;
            } else if (approach === 'south') {
              lx = cx + med / 2 + lw / 2 + lane * lw;
              ly = cy + g.halfW + offset;
            } else if (approach === 'east') {
              lx = cx + g.halfH + offset;
              ly = cy - med / 2 - lw / 2 - lane * lw;
            } else if (approach === 'west') {
              lx = cx - g.halfH - offset;
              ly = cy + med / 2 + lw / 2 + lane * lw;
            }
            return { x: lx, y: ly, direction: dir };
          });
        } else {
          // Point signals (stopSign, etc.) — single position at corner
          const gap = sig.gap ?? 15;
          if (approach === 'north') {
            sig.x = sig.x ?? cx - g.halfH + g.vShoulder - gap;
            sig.y = sig.y ?? cy - g.halfW - gap;
          } else if (approach === 'south') {
            sig.x = sig.x ?? cx + g.halfH - g.vShoulder + gap;
            sig.y = sig.y ?? cy + g.halfW + gap;
          } else if (approach === 'east') {
            sig.x = sig.x ?? cx + g.halfH + gap;
            sig.y = sig.y ?? cy - g.halfW + g.hShoulder - gap;
          } else if (approach === 'west') {
            sig.x = sig.x ?? cx - g.halfH - gap;
            sig.y = sig.y ?? cy + g.halfW - g.hShoulder + gap;
          }
        }
      });
    });

    return cfg;
  }

  function render(container, rawCfg) {
    const cfg = applyDefaults(rawCfg);
    const W = cfg.canvas.width;
    const H = cfg.canvas.height;
    const svg = SVG.create(container, W, H);

    // ViewBox centered on origin — (0,0) is always canvas center.
    // Zoom scales proportionally around the center.
    const z = rawCfg.zoom || 1;
    const vbW = W / z, vbH = H / z;
    svg.setAttribute('viewBox', `${-vbW / 2} ${-vbH / 2} ${vbW} ${vbH}`);

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

    // 1. Background — fill the full canvas with grass (centered on origin)
    Terrain.fillArea(svg, -W / 2, -H / 2, W, H);

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

    // 7. Stop lines (sub-elements of intersections)
    (cfg.intersections || []).forEach(ix => {
      (ix.stopLines || []).forEach(sl => {
        SVG.line(svg, sl.x1, sl.y1, sl.x2, sl.y2, {
          stroke: sl.color || '#fff',
          'stroke-width': sl.width || 3,
        });
      });
    });

    // 7b. Signals (sub-elements of intersections, rendered after stop lines)
    (cfg.intersections || []).forEach(ix => {
      (ix.signals || []).forEach(s => {
        if (s.type === 'trafficLight' && s._lights) {
          s._lights.forEach(light => {
            Signals.trafficLight(svg, light.x, light.y, { ...s, direction: light.direction });
          });
        } else if (s.type === 'stopSign') Signals.stopSign(svg, s.x, s.y, s);
      });
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

    // 10. Compass rose — always bottom-right, zoom-independent
    if (cfg.compass !== false) {
      const comp = cfg.compass || {};
      const size = (comp.size ?? 30) / z;
      const margin = (comp.margin ?? 50) / z;
      const ccx = comp.x ?? (vbW / 2 - margin);
      const ccy = comp.y ?? (vbH / 2 - margin);
      Compass.draw(svg, ccx, ccy, size);
    }

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

    // Collect clip ranges where tJunctions block this road
    const clips = [];
    junctions.forEach(jx => {
      if (jx.type !== 'tJunction' || !jx.blockedSide) return;
      if (!(jx.roads || []).includes(r.id)) return;
      const bs = jx.blockedSide;
      if (r.orientation === 'vertical' && (bs === 'north' || bs === 'south')) {
        if (bs === 'north') clips.push({ cut: 'before', at: jx.cy - jx.halfW });
        else clips.push({ cut: 'after', at: jx.cy + jx.halfW });
      } else if (r.orientation === 'horizontal' && (bs === 'west' || bs === 'east')) {
        if (bs === 'west') clips.push({ cut: 'before', at: jx.cx - jx.halfH });
        else clips.push({ cut: 'after', at: jx.cx + jx.halfH });
      }
    });

    let from = r.from, to = r.to;
    clips.forEach(c => {
      if (c.cut === 'before') from = Math.max(from, c.at);
      else to = Math.min(to, c.at);
    });

    if (from >= to) return; // fully clipped

    if (r.orientation === 'vertical') {
      Roads.verticalRoad(svg, r.center, from, to, opts);
    } else {
      Roads.horizontalRoad(svg, r.center, from, to, opts);
    }
  }

  /* ── Parking helpers ── */

  /**
   * Compute the extra pixel offset for a given stall index due to splits.
   * Each split before the index adds one laneGap of space.
   */
  function splitOffset(stallIdx, splits, laneGap) {
    let count = 0;
    for (const s of splits) {
      if (s <= stallIdx) count++;
      else break;  // splits are sorted
    }
    return count * laneGap;
  }

  /**
   * Break a total stall count into segments separated by splits.
   * Returns [{ start, count }, …] where start is the stall index.
   */
  function splitSegments(totalStalls, splits) {
    const segs = [];
    let prev = 0;
    for (const s of splits) {
      if (s > prev && s < totalStalls) {
        segs.push({ start: prev, count: s - prev });
        prev = s;
      }
    }
    segs.push({ start: prev, count: totalStalls - prev });
    return segs;
  }

  /* ── Parking lot rendering ── */
  function renderParkingLot(svg, lot) {
    Parking.surface(svg, lot._x, lot._y, lot.width, lot.height, {
      entrances: lot._entrances,
    });
    const laneGap = lot._laneGap || 100;

    (lot.rows || []).forEach(row => {
      const opts = { stallWidth: row.stallWidth, stallDepth: row.stallDepth, direction: row.direction };
      const sw = row.stallWidth;
      const rx = row.x ?? lot._x + (row.offsetX || 0);
      const ry = row.y ?? lot._y + (row.offsetY || 0);
      const isVert = row.orientation === 'vertical';
      const count = isVert ? (row.stallsPerColumn || 1) : (row.stallsPerRow || 1);
      const rowSplits = row._splits || [];
      const segs = splitSegments(count, rowSplits);

      segs.forEach(seg => {
        const gapPx = splitOffset(seg.start, rowSplits, laneGap);
        if (isVert) {
          const segY = ry + seg.start * sw + gapPx;
          if (row.type === 'double') {
            Parking.doubleColumn(svg, rx, segY, seg.count, opts);
          } else {
            Parking.stallColumn(svg, rx, segY, seg.count, opts);
          }
        } else {
          const segX = rx + seg.start * sw + gapPx;
          if (row.type === 'double') {
            Parking.doubleRow(svg, segX, ry, seg.count, opts);
          } else {
            Parking.stallRow(svg, segX, ry, seg.count, opts);
          }
        }
      });
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
    const rx = row.x ?? lot._x + (row.offsetX || 0);
    const ry = row.y ?? lot._y + (row.offsetY || 0);
    const stallIdx = v.stall ?? 0;
    const isVertical = row.orientation === 'vertical';
    const carH = v.height;
    const rowSplits = row._splits || [];
    const laneGap = lot._laneGap || 100;
    const gapPx = splitOffset(stallIdx, rowSplits, laneGap);

    // Nose-alignment offset: shift car so noses align at the medium-car reference depth.
    // Positive pullSign = nose points toward increasing coordinate.
    const medH = VEHICLE_SIZES.medium.height;
    const pullDelta = (medH - carH) / 2;

    let cx, cy, direction;

    if (isVertical) {
      cy = ry + stallIdx * sw + sw / 2 + gapPx;
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
      cx = rx + stallIdx * sw + sw / 2 + gapPx;
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

  return { DEFAULTS, render, addExportButton, applyDefaults };
})();
