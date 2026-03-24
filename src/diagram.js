// diagram.js — JSON-driven diagram engine
// Reads a diagram config object and renders a complete SVG driving diagram.
//
// Depends on: primitives.js (SVG, Terrain, Roads, Intersections, Vehicles, Signals, Parking, Compass)

const Diagram = (() => {
  // RESOLUTION_SCALE is defined in primitives.js (global)

  /* ── Config inheritance ── */

  /**
   * Deep-merge `override` on top of `base`.
   * Arrays are replaced wholesale (not concatenated) so overrides can
   * swap out e.g. the entire vehicles list.
   */
  function deepMerge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      const bVal = base[key];
      const oVal = override[key];
      if (
        oVal && typeof oVal === 'object' && !Array.isArray(oVal) &&
        bVal && typeof bVal === 'object' && !Array.isArray(bVal)
      ) {
        result[key] = deepMerge(bVal, oVal);
      } else {
        result[key] = oVal;
      }
    }
    return result;
  }

  /**
   * Resolve config inheritance.
   * If `rawCfg.extends` names a base config, load it and deep-merge.
   * @param {object} rawCfg — the config that may contain an `extends` field
   * @param {function} loader — `(name) => configObject|null`  synchronous loader
   * @returns {object} resolved config (new object, inputs untouched)
   */
  function resolveExtends(rawCfg, loader) {
    if (!rawCfg.extends) return rawCfg;
    const baseName = rawCfg.extends;
    const baseRaw = loader(baseName);
    if (!baseRaw) {
      console.warn(`[Diagram] extends: base config "${baseName}" not found — ignoring`);
      const { extends: _, ...rest } = rawCfg;
      return rest;
    }
    // Recursively resolve in case the base also extends something
    const resolvedBase = resolveExtends(baseRaw, loader);
    const { extends: _, ...overrides } = rawCfg;
    return deepMerge(resolvedBase, overrides);
  }

  // Scale a dimension by RESOLUTION_SCALE, keeping odd values odd so
  // pane centers land on an exact pixel (e.g. 1057 × 2 → 2113, not 2114).
  const oddScale = value => (Number.isInteger(value) && value % 2 === 1)
    ? value * RESOLUTION_SCALE - (RESOLUTION_SCALE - 1)
    : value * RESOLUTION_SCALE;

  /* ── Default values ── */
  const DEFAULTS = {
    laneWidth: 50 * RESOLUTION_SCALE,
    shoulder: 10 * RESOLUTION_SCALE,
    radius: 25 * RESOLUTION_SCALE,
    stallWidth: 50 * RESOLUTION_SCALE,
    stallDepth: 100 * RESOLUTION_SCALE,
    laneGap: 100 * RESOLUTION_SCALE,           // driving-lane width in parking lots (2 × laneWidth)
    vehicleWidth: 30 * RESOLUTION_SCALE,      // 0.6 × laneWidth
    vehicleHeight: 75 * RESOLUTION_SCALE,     // 1.5 × laneWidth (medium)
  };

  // Vehicle sizes: width is always 0.6 × laneWidth, length varies
  const VEHICLE_SIZES = {
    small:  { width: 30 * RESOLUTION_SCALE, height: 60 * RESOLUTION_SCALE },   // 1.2 × laneWidth
    medium: { width: 30 * RESOLUTION_SCALE, height: 75 * RESOLUTION_SCALE },   // 1.5 × laneWidth
    large:  { width: 30 * RESOLUTION_SCALE, height: 90 * RESOLUTION_SCALE },   // 1.8 × laneWidth
  };

  /* ================================================================
   *  DEFAULTS PIPELINE — each function enriches one section of config
   * ================================================================ */

  // 8.5×11 paper at landscape orientation (11:8.5 ≈ 1.294:1).
  // canvas.orientation: "portrait" swaps these so the pane is tall (8.5:11).
  const BASE_PANE_W = oddScale(1057);
  const BASE_PANE_H = oddScale(817);

  function applyCanvasDefaults(cfg) {
    cfg.canvas = cfg.canvas || {};

    // Orientation: "portrait" swaps the default 8.5×11 pane to tall format.
    // Explicit paneWidth/paneHeight always win over orientation.
    const portrait = cfg.canvas.orientation === 'portrait';
    const defaultW = portrait ? BASE_PANE_H : BASE_PANE_W;
    const defaultH = portrait ? BASE_PANE_W : BASE_PANE_H;

    // Pane dimensions (single pane size — 8.5×11 aspect ratio)
    const pW = cfg.canvas.paneWidth || defaultW;
    const pH = cfg.canvas.paneHeight || defaultH;
    cfg.canvas.paneWidth = pW;
    cfg.canvas.paneHeight = pH;

    // Grid of panes
    const cols = cfg.canvas.columns || 1;
    const rows = cfg.canvas.rows || 1;
    cfg.canvas.columns = cols;
    cfg.canvas.rows = rows;

    // Total canvas dimensions (derived from panes)
    cfg.canvas.width = cfg.canvas.width || pW * cols;
    cfg.canvas.height = cfg.canvas.height || pH * rows;

    // Zoom — support both canvas.zoom and legacy top-level zoom
    cfg.canvas.zoom = cfg.canvas.zoom ?? cfg.zoom ?? 1;

    // Compass — support both canvas.compass and legacy top-level compass
    if (cfg.canvas.compass === undefined) {
      cfg.canvas.compass = cfg.compass ?? true;
    }

    // Grid lines between panes (default off)
    cfg.canvas.grid = cfg.canvas.grid ?? false;
  }

  function applyParkingDefaults(cfg, d) {
    const pW = cfg.canvas.paneWidth;
    const pH = cfg.canvas.paneHeight;
    const z = cfg.canvas.zoom;

    (cfg.parkingLots || []).forEach(lot => {
      // page: [col, row] offsets pane-relative coordinates to a specific pane
      const pgCol = lot.page ? lot.page[0] : 0;
      const pgRow = lot.page ? lot.page[1] : 0;

      // Resolve pane-relative positioning
      if (lot.xPane != null && lot.x == null) lot.x = (lot.xPane + pgCol) * pW / z;
      if (lot.yPane != null && lot.y == null) lot.y = (lot.yPane + pgRow) * pH / z;

      const rows = lot.rows || [];
      rows.forEach(row => {
        row.stallWidth = row.stallWidth ?? d.stallWidth;
        row.stallDepth = row.stallDepth ?? d.stallDepth;
      });
      if (rows.length === 0) return;

      const EDGE_CLOSE = 10 * RESOLUTION_SCALE;
      const isVertical = rows[0].orientation === 'vertical';
      const sw0 = rows[0].stallWidth;
      const laneGap = lot.laneGap ?? d.laneGap;
      lot._laneGap = laneGap;

      // Normalize per-row splits
      rows.forEach(row => {
        row._splits = (row.splits || []).slice().sort((a, b) => a - b);
      });

      // Parse edgeMargin
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
        if (lot.height == null) {
          let curY = (rows[0].type === 'double') ? laneGap : EDGE_CLOSE;
          rows.forEach((row, i) => {
            if (i > 0) curY += laneGap;
            if (row.y == null && row.offsetY == null) row.offsetY = curY;
            curY += (row.type === 'double') ? row.stallDepth * 2 : row.stallDepth;
          });
          const lastRow = rows[rows.length - 1];
          curY += (lastRow.type === 'double') ? laneGap : EDGE_CLOSE;
          lot.height = curY;
        }

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

      // Compute entrance positions (absolute coordinates)
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
  }

  function applyRoadDefaults(cfg, d) {
    const cW = cfg.canvas.width;
    const cH = cfg.canvas.height;
    const pW = cfg.canvas.paneWidth;
    const pH = cfg.canvas.paneHeight;
    const z = cfg.canvas.zoom;

    // Build lot lookup for road references
    const lotLookup = {};
    (cfg.parkingLots || []).forEach(lot => { if (lot.id) lotLookup[lot.id] = lot; });

    // Resolve a string reference to a numeric value
    function resolveRef(value, orientation, roadLookup, axis) {
      if (typeof value !== 'string') return value;
      if (roadLookup[value]) return roadLookup[value].center;
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

    // Roads are processed in order so later roads can reference earlier ones
    const roadLookup = {};
    (cfg.roads || []).forEach(r => {
      // page: [col, row] offsets pane-relative coordinates to a specific pane
      const pgCol = r.page ? r.page[0] : 0;
      const pgRow = r.page ? r.page[1] : 0;

      // Resolve pane-relative positioning
      // centerPane: for vertical roads → X axis (paneWidth), for horizontal → Y axis (paneHeight)
      if (r.centerPane != null && r.center == null) {
        const pageOff = r.orientation === 'vertical' ? pgCol : pgRow;
        r.center = (r.centerPane + pageOff) * (r.orientation === 'vertical' ? pW : pH) / z;
      }
      // fromPane / toPane: for vertical roads → Y axis (paneHeight), for horizontal → X axis (paneWidth)
      if (r.fromPane != null && r.from == null) {
        const pageOff = r.orientation === 'vertical' ? pgRow : pgCol;
        r.from = (r.fromPane + pageOff) * (r.orientation === 'vertical' ? pH : pW) / z;
      }
      if (r.toPane != null && r.to == null) {
        const pageOff = r.orientation === 'vertical' ? pgRow : pgCol;
        r.to = (r.toPane + pageOff) * (r.orientation === 'vertical' ? pH : pW) / z;
      }

      r.center = resolveRef(r.center, r.orientation, roadLookup, 'across');
      r.from = resolveRef(r.from, r.orientation, roadLookup, 'along');
      r.to = resolveRef(r.to, r.orientation, roadLookup, 'along');
      r.laneWidth = r.laneWidth ?? d.laneWidth;
      if (r.orientation === 'vertical') {
        r.from = r.from ?? 0;
        r.to = r.to ?? cH;
      } else {
        r.from = r.from ?? 0;
        r.to = r.to ?? cW;
      }
      if (r.shoulder == null && d.shoulder >= 0) r.shoulder = d.shoulder;
      roadLookup[r.id] = r;
    });

    // Stash lookup on cfg for later pipeline stages
    cfg._roadLookup = roadLookup;
  }

  function applyIntersectionDefaults(cfg, d) {
    const roadLookup = cfg._roadLookup;

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
      // Derive blockedSides for turn type from openSides
      if (ix.type === 'turn' && ix.openSides) {
        const all = ['north', 'south', 'east', 'west'];
        const openMap = { ne: ['north', 'east'], nw: ['north', 'west'], se: ['south', 'east'], sw: ['south', 'west'] };
        const open = openMap[ix.openSides] || [];
        ix.blockedSides = all.filter(s => !open.includes(s));
      }
    });
  }

  function applyEntranceDefaults(cfg, d) {
    const roadLookup = cfg._roadLookup;

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
  }

  function applyVehicleDefaults(cfg) {
    const pW = cfg.canvas.paneWidth;
    const pH = cfg.canvas.paneHeight;
    const z = cfg.canvas.zoom;

    (cfg.vehicles || []).forEach(v => {
      const sz = v.size ? (VEHICLE_SIZES[v.size] || VEHICLE_SIZES.medium) : VEHICLE_SIZES.medium;
      v.width = v.width ?? sz.width;
      v.height = v.height ?? sz.height;

      // page: [col, row] offsets pane-relative coordinates to a specific pane
      const pgCol = v.page ? v.page[0] : 0;
      const pgRow = v.page ? v.page[1] : 0;

      // Resolve pane-relative positioning for absolute-positioned vehicles
      if (v.xPane != null && v.x == null) v.x = (v.xPane + pgCol) * pW / z;
      if (v.yPane != null && v.y == null) v.y = (v.yPane + pgRow) * pH / z;
    });
  }

  /** Get intersection geometry for stop line / signal positioning. */
  function ixGeom(ix, roadLookup) {
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

  function stopLineLaneIndices(sl, lanesPerDirection) {
    if (Array.isArray(sl.lanes) && sl.lanes.length) {
      const lanes = [...new Set(
        sl.lanes
          .map(lane => Number.parseInt(lane, 10))
          .filter(Number.isFinite)
          .map(lane => Math.max(0, Math.min(lanesPerDirection - 1, lane)))
      )].sort((a, b) => a - b);
      if (lanes.length) return lanes;
    }

    if (sl.lane != null) {
      const lane = String(sl.lane).toLowerCase();
      if (lane === 'left' || lane === 'inner') return [0];
      if (lane === 'right' || lane === 'outer') return [Math.max(lanesPerDirection - 1, 0)];

      const laneNum = Number.parseInt(lane, 10);
      if (Number.isFinite(laneNum)) {
        return [Math.max(0, Math.min(lanesPerDirection - 1, laneNum))];
      }
    }

    return Array.from({ length: lanesPerDirection }, (_, i) => i);
  }

  function stopLineLaneRange(innerEdge, laneWidth, lanes, sideSign) {
    const firstLane = lanes[0];
    const lastLane = lanes[lanes.length - 1];
    const p1 = innerEdge + sideSign * firstLane * laneWidth;
    const p2 = innerEdge + sideSign * (lastLane + 1) * laneWidth;
    return [Math.min(p1, p2), Math.max(p1, p2)];
  }

  function applyStopLineDefaults(cfg) {
    const roadLookup = cfg._roadLookup;

    (cfg.intersections || []).forEach(ix => {
      if (!ix.center) return;
      const g = ixGeom(ix, roadLookup);
      if (!g) return;
      const cx = ix.center[0], cy = ix.center[1];

      (ix.stopLines || []).forEach(sl => {
        const approach = sl.approach;
        if (!approach) return;
        const isVertApproach = (approach === 'north' || approach === 'south');
        const r0 = roadLookup[ix.roads?.[0]];
        const r1 = roadLookup[ix.roads?.[1]];
        const road = isVertApproach
          ? (r0?.orientation === 'vertical' ? r0 : r1)
          : (r0?.orientation === 'horizontal' ? r0 : r1);
        if (!road) return;

        const lw = road.laneWidth || Roads.D.laneWidth;
        const lpd = road.lanesPerDirection || 1;
        const med = road.median || 0;
        const lanes = stopLineLaneIndices(sl, lpd);
        if (!lanes.length) return;

        const offset = (sl.offset ?? (15 * RESOLUTION_SCALE))
          + (sl.turnLane ? (sl.turnLaneOffset ?? (50 * RESOLUTION_SCALE)) : 0);
        if (approach === 'north') {
          const [x1, x2] = stopLineLaneRange(cx - med / 2, lw, lanes, -1);
          const ly = cy - g.halfW - offset;
          sl.x1 = sl.x1 ?? x1;
          sl.y1 = sl.y1 ?? ly;
          sl.x2 = sl.x2 ?? x2;
          sl.y2 = sl.y2 ?? ly;
        } else if (approach === 'south') {
          const [x1, x2] = stopLineLaneRange(cx + med / 2, lw, lanes, 1);
          const ly = cy + g.halfW + offset;
          sl.x1 = sl.x1 ?? x1;
          sl.y1 = sl.y1 ?? ly;
          sl.x2 = sl.x2 ?? x2;
          sl.y2 = sl.y2 ?? ly;
        } else if (approach === 'east') {
          const [y1, y2] = stopLineLaneRange(cy - med / 2, lw, lanes, -1);
          const lx = cx + g.halfH + offset;
          sl.x1 = sl.x1 ?? lx;
          sl.y1 = sl.y1 ?? y1;
          sl.x2 = sl.x2 ?? lx;
          sl.y2 = sl.y2 ?? y2;
        } else if (approach === 'west') {
          const [y1, y2] = stopLineLaneRange(cy + med / 2, lw, lanes, 1);
          const lx = cx - g.halfH - offset;
          sl.x1 = sl.x1 ?? lx;
          sl.y1 = sl.y1 ?? y1;
          sl.x2 = sl.x2 ?? lx;
          sl.y2 = sl.y2 ?? y2;
        }
      });
    });
  }

  function applySignalDefaults(cfg) {
    const roadLookup = cfg._roadLookup;

    (cfg.intersections || []).forEach(ix => {
      if (!ix.center) return;
      const g = ixGeom(ix, roadLookup);
      if (!g) return;
      const cx = ix.center[0], cy = ix.center[1];

      (ix.signals || []).forEach(sig => {
        const approach = sig.approach;
        if (!approach) return;

        if (sig.type === 'trafficLight') {
          const isVertApproach = (approach === 'north' || approach === 'south');
          const r0 = roadLookup[ix.roads?.[0]];
          const r1 = roadLookup[ix.roads?.[1]];
          const road = isVertApproach
            ? (r0?.orientation === 'vertical' ? r0 : r1)
            : (r0?.orientation === 'horizontal' ? r0 : r1);
          if (!road) return;
          const lw = road.laneWidth || Roads.D.laneWidth;
          const lpd = road.lanesPerDirection || 1;
          const med = road.median || 0;
          const offset = sig.offset ?? (15 * RESOLUTION_SCALE);
          const lanes = sig.lanes ?? Array.from({ length: lpd }, (_, i) => i);

          const dir = isVertApproach ? 'east' : 'south';
          sig._lights = lanes.map(lane => {
            let lx, ly;
            // Traffic lights sit on the far side of the junction for each approach.
            if (approach === 'north') {
              lx = cx - med / 2 - lw / 2 - lane * lw;
              ly = cy + g.halfW + offset;
            } else if (approach === 'south') {
              lx = cx + med / 2 + lw / 2 + lane * lw;
              ly = cy - g.halfW - offset;
            } else if (approach === 'east') {
              lx = cx - g.halfH - offset;
              ly = cy - med / 2 - lw / 2 - lane * lw;
            } else if (approach === 'west') {
              lx = cx + g.halfH + offset;
              ly = cy + med / 2 + lw / 2 + lane * lw;
            }
            return { x: lx, y: ly, direction: dir };
          });
        } else {
          // Point signals (stopSign, etc.)
          const sideGap = sig.sideGap ?? sig.gap ?? (35 * RESOLUTION_SCALE);
          const setback = sig.setback ?? sig.gap ?? (35 * RESOLUTION_SCALE);
          // Rotate sign to face approaching traffic
          const rotMap = { north: 180, south: 0, east: -90, west: 90 };
          sig.rotation = sig.rotation ?? rotMap[approach] ?? 0;
          if (approach === 'north') {
            sig.x = sig.x ?? cx - g.halfH + g.vShoulder - sideGap;
            sig.y = sig.y ?? cy - g.halfW - setback;
          } else if (approach === 'south') {
            sig.x = sig.x ?? cx + g.halfH - g.vShoulder + sideGap;
            sig.y = sig.y ?? cy + g.halfW + setback;
          } else if (approach === 'east') {
            sig.x = sig.x ?? cx + g.halfH + setback;
            sig.y = sig.y ?? cy - g.halfW + g.hShoulder - sideGap;
          } else if (approach === 'west') {
            sig.x = sig.x ?? cx - g.halfH - setback;
            sig.y = sig.y ?? cy + g.halfW - g.hShoulder + sideGap;
          }
        }
      });
    });
  }

  /** Build junction geometry from intersections and road lookup. */
  function buildJunctions(cfg) {
    const roadLookup = cfg._roadLookup;
    return (cfg.intersections || []).map(ix => {
      if (!ix.center) return null;
      const cx = ix.center[0], cy = ix.center[1];
      const r0 = roadLookup[ix.roads?.[0]];
      const r1 = roadLookup[ix.roads?.[1]];
      let halfH = 0, halfW = 0;
      if (r0 && r1) {
        const vRoad = r0.orientation === 'vertical' ? r0 : r1;
        const hRoad = r0.orientation === 'horizontal' ? r0 : r1;
        halfH = Roads.roadWidth(vRoad.laneWidth, vRoad.lanesPerDirection, vRoad.median, vRoad.shoulder) / 2;
        halfW = Roads.roadWidth(hRoad.laneWidth, hRoad.lanesPerDirection, hRoad.median, hRoad.shoulder) / 2;
      }
      return { ...ix, cx, cy, halfH, halfW };
    }).filter(Boolean);
  }

  /**
   * Compute rendered positions for all vehicles and store as _cx, _cy, _direction.
   * This is the single source of truth for vehicle placement — used by both
   * the renderer and the builder overlay.
   */
  function applyVehiclePositions(cfg) {
    const roadLookup = cfg._roadLookup;
    const junctions = cfg._junctions;

    // Build lot lookup (supports both ID string and array index)
    const lotById = {};
    (cfg.parkingLots || []).forEach((lot, i) => {
      if (lot.id) lotById[lot.id] = lot;
      lotById[i] = lot;
    });

    (cfg.vehicles || []).forEach(v => {
      if (v.road) {
        computeLaneVehiclePos(v, roadLookup, junctions);
      } else if (v.parkingLot != null) {
        computeStallVehiclePos(v, lotById);
      } else {
        // Absolute position — already has x, y
        v._cx = v.x;
        v._cy = v.y;
        v._direction = v.direction || 'north';
      }
    });
  }

  function computeLaneVehiclePos(v, roadLookup, junctions) {
    const road = roadLookup[v.road];
    if (!road) return;

    const lw = road.laneWidth || Roads.D.laneWidth;
    const t = v.t || 0.5;
    const lane = v.lane || 0;

    // Find the junction this arm belongs to
    let jx = null;
    for (const j of junctions) {
      if ((j.roads || []).includes(road.id)) { jx = j; break; }
    }

    let cx, cy, direction;

    if (road.orientation === 'vertical') {
      const laneOffset = lw / 2 + lane * lw;
      if (v.side === 'right') { cx = road.center + laneOffset; direction = 'south'; }
      else                    { cx = road.center - laneOffset; direction = 'north'; }

      if (jx) {
        if (v.arm === 'north') {
          cy = road.from + t * (jx.cy - jx.halfW - road.from);
        } else {
          const armStart = jx.cy + jx.halfW;
          cy = road.to - t * (road.to - armStart);
        }
      } else {
        cy = road.from + t * (road.to - road.from);
      }
    } else {
      const laneOffset = lw / 2 + lane * lw;
      if (v.side === 'right') { cy = road.center + laneOffset; direction = 'east'; }
      else                    { cy = road.center - laneOffset; direction = 'west'; }

      if (jx) {
        if (v.arm === 'west') {
          cx = road.from + t * (jx.cx - jx.halfH - road.from);
        } else {
          const armStart = jx.cx + jx.halfH;
          cx = road.to - t * (road.to - armStart);
        }
      } else {
        cx = road.from + t * (road.to - road.from);
      }
    }

    v._cx = cx;
    v._cy = cy;
    v._direction = v.direction || direction;
  }

  function computeStallVehiclePos(v, lotById) {
    const lot = lotById[v.parkingLot];
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
    const laneGap = lot._laneGap || DEFAULTS.laneGap;
    const gapPx = splitOffset(stallIdx, rowSplits, laneGap);

    const medH = VEHICLE_SIZES.medium.height;
    const pullDelta = (medH - carH) / 2;

    let cx, cy, direction;

    if (isVertical) {
      cy = ry + stallIdx * sw + sw / 2 + gapPx;
      if (row.type === 'double') {
        if ((v.subRow || 'left') === 'left') { cx = rx + sd / 2; direction = 'east'; }
        else                                 { cx = rx + sd + sd / 2; direction = 'west'; }
      } else {
        cx = rx + sd / 2;
        direction = (row.direction === 'right') ? 'east' : 'west';
      }
      cx += (direction === 'east' ? pullDelta : -pullDelta);
    } else {
      cx = rx + stallIdx * sw + sw / 2 + gapPx;
      if (row.type === 'double') {
        if ((v.subRow || 'top') === 'top') { cy = ry + sd / 2; direction = 'south'; }
        else                               { cy = ry + sd + sd / 2; direction = 'north'; }
      } else {
        cy = ry + sd / 2;
        direction = (row.direction === 'down') ? 'south' : 'north';
      }
      cy += (direction === 'south' ? pullDelta : -pullDelta);
    }

    v._cx = cx;
    v._cy = cy;
    v._direction = v.direction || direction;
  }

  /* ================================================================
   *  NAMED REFERENCES — resolve @ref strings to numeric values
   * ================================================================ */

  /**
   * Resolve the `references` section into a flat lookup of numeric values,
   * then walk the entire config and replace any "@refName" or "@refName.x"
   * string with the corresponding number.
   *
   * Reference definitions support:
   *   { "x": 500, "y": 400 }           — absolute pixels
   *   { "xPane": 0.3, "yPane": 0.7 }   — pane-relative (resolved to pixels)
   *
   * Usage in other fields:
   *   "@refName"    — resolves to { x, y } (only useful where an [x,y] pair is expected)
   *   "@refName.x"  — resolves to the x coordinate (number)
   *   "@refName.y"  — resolves to the y coordinate (number)
   */
  function resolveReferences(cfg) {
    const refs = cfg.references;
    if (!refs) return;

    const pW = cfg.canvas.paneWidth;
    const pH = cfg.canvas.paneHeight;
    const z = cfg.canvas.zoom || 1;

    // Build resolved lookup: each ref becomes { x, y }
    const resolved = {};
    for (const [name, def] of Object.entries(refs)) {
      const x = def.x ?? (def.xPane != null ? def.xPane * pW / z : undefined);
      const y = def.y ?? (def.yPane != null ? def.yPane * pH / z : undefined);
      resolved[name] = { x, y };
    }

    // Recursively walk the config and replace @ref strings
    function walk(obj) {
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          obj[i] = resolve(obj[i]);
          if (typeof obj[i] === 'object' && obj[i] !== null) walk(obj[i]);
        }
      } else if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (key === 'references') continue; // don't recurse into definitions
          obj[key] = resolve(obj[key]);
          if (typeof obj[key] === 'object' && obj[key] !== null) walk(obj[key]);
        }
      }
    }

    function resolve(val) {
      if (typeof val !== 'string' || val[0] !== '@') return val;
      const parts = val.slice(1).split('.');
      const ref = resolved[parts[0]];
      if (!ref) return val;
      if (parts.length === 1) return ref; // return the { x, y } object
      if (parts[1] === 'x') return ref.x;
      if (parts[1] === 'y') return ref.y;
      return val;
    }

    walk(cfg);
  }

  /* ================================================================
   *  APPLY DEFAULTS — orchestrates the pipeline
   * ================================================================ */

  function applyDefaults(raw) {
    const d = { ...DEFAULTS, ...(raw.defaults || {}) };
    const cfg = JSON.parse(JSON.stringify(raw));

    applyCanvasDefaults(cfg);
    resolveReferences(cfg);
    applyParkingDefaults(cfg, d);
    applyRoadDefaults(cfg, d);
    applyIntersectionDefaults(cfg, d);
    applyEntranceDefaults(cfg, d);
    applyVehicleDefaults(cfg);
    applyStopLineDefaults(cfg);
    applySignalDefaults(cfg);
    cfg._junctions = buildJunctions(cfg);
    applyVehiclePositions(cfg);

    return cfg;
  }

  /* ================================================================
   *  RENDER
   * ================================================================ */

  function render(container, rawCfg) {
    // Apply style theme before rendering
    DiagramStyle.reset();
    if (rawCfg.style) DiagramStyle.set(rawCfg.style);

    const cfg = applyDefaults(rawCfg);
    const W = cfg.canvas.width;
    const H = cfg.canvas.height;
    const svg = SVG.create(container, W, H);

    const z = cfg.canvas.zoom;
    const vbW = W / z, vbH = H / z;
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);

    const roadMap = cfg._roadLookup;
    const junctions = cfg._junctions;

    // 1. Background
    Terrain.fillArea(svg, 0, 0, W, H);

    // 2. Roads
    (cfg.roads || []).forEach(r => renderRoad(svg, r, junctions));

    // 3. Parking lots
    (cfg.parkingLots || []).forEach(lot => renderParkingLot(svg, lot));

    // 4. Connectors
    (cfg.connectors || []).forEach(c => {
      SVG.rect(svg, c.x, c.y, c.width, c.height, { fill: c.fill || Parking.D.surfaceColor });
    });

    // 5. Intersections
    junctions.forEach(ix => renderIntersection(svg, ix, roadMap));

    // 6. Entrances
    (cfg.entrances || []).forEach(ent => renderEntrance(svg, ent, roadMap));

    // 7. Stop lines
    (cfg.intersections || []).forEach(ix => {
      (ix.stopLines || []).forEach(sl => {
        SVG.line(svg, sl.x1, sl.y1, sl.x2, sl.y2, {
          stroke: sl.color || DiagramStyle.get().stopLineColor,
          'stroke-width': sl.width || 3,
        });
      });
    });

    // 8. Signals (intersection-attached and standalone)
    function renderSignal(s) {
      if (s.type === 'trafficLight' && s._lights) {
        s._lights.forEach(light => {
          Signals.trafficLight(svg, light.x, light.y, { ...s, direction: light.direction });
        });
      } else if (s.type === 'stopSign') {
        Signals.stopSign(svg, s.x, s.y, s);
      } else if (s.type === 'stopSign4Way') {
        Signals.stopSign4Way(svg, s.x, s.y, s);
      }
    }
    (cfg.intersections || []).forEach(ix => {
      (ix.signals || []).forEach(renderSignal);
    });
    (cfg.signals || []).forEach(renderSignal);

    // 9. Vehicles — use pre-computed positions
    (cfg.vehicles || []).forEach(v => {
      if (v._cx != null && v._cy != null) {
        Vehicles.car(svg, v._cx, v._cy, {
          direction: v._direction,
          color: v.color,
          width: v.width,
          height: v.height,
          rotation: v.rotation,
        });
      }
    });

    // 10. Decorations
    (cfg.decorations || []).forEach(d => {
      if (d.type === 'compass') Compass.draw(svg, d.x, d.y, d.size);
    });

    // 11. Pane grid lines
    if (cfg.canvas.grid) {
      renderPaneGrid(svg, cfg.canvas, vbW, vbH);
    }

    // 12. Compass rose — controlled by canvas.compass (or legacy top-level compass)
    const compassEnabled = cfg.canvas.compass !== false;
    if (compassEnabled) {
      const comp = (typeof cfg.compass === 'object' && cfg.compass) ? cfg.compass : {};
      const size = (comp.size ?? (30 * RESOLUTION_SCALE)) / z;
      const margin = (comp.margin ?? (50 * RESOLUTION_SCALE)) / z;
      const ccx = comp.x ?? (vbW - margin);
      const ccy = comp.y ?? (vbH - margin);
      Compass.draw(svg, ccx, ccy, size);
    }

    return svg;
  }

  /* ── Pane grid lines ── */
  function renderPaneGrid(svg, canvas, vbW, vbH) {
    const cols = canvas.columns || 1;
    const rows = canvas.rows || 1;
    if (cols <= 1 && rows <= 1) return;

    const z = canvas.zoom || 1;
    const cellW = canvas.paneWidth / z;
    const cellH = canvas.paneHeight / z;
    const gridAttrs = {
      stroke: '#cccccc', 'stroke-width': 1.5 * RESOLUTION_SCALE,
      'stroke-dasharray': `${12 * RESOLUTION_SCALE},${6 * RESOLUTION_SCALE}`, 'stroke-opacity': 0.6,
    };

    // Vertical dividers between columns
    for (let c = 1; c < cols; c++) {
      SVG.line(svg, c * cellW, 0, c * cellW, vbH, gridAttrs);
    }
    // Horizontal dividers between rows
    for (let r = 1; r < rows; r++) {
      SVG.line(svg, 0, r * cellH, vbW, r * cellH, gridAttrs);
    }
  }

  /* ── Intersection rendering ── */
  function renderIntersection(svg, ix, roadMap) {
    let junctionOpts = null;
    if (ix.radius != null) {
      const arms = { north: true, south: true, east: true, west: true };
      const noCurb = {};
      if (ix.blockedSide) {
        arms[ix.blockedSide] = false;
        if (ix.type === 'tJunction') noCurb[ix.blockedSide] = true;
      }
      if (ix.blockedSides) ix.blockedSides.forEach(s => { arms[s] = false; noCurb[s] = true; });
      const jr0 = roadMap[ix.roads?.[0]];
      const jr1 = roadMap[ix.roads?.[1]];
      const jSh = Math.max(jr0?.shoulder ?? -1, jr1?.shoulder ?? -1);
      junctionOpts = {
        radius: ix.radius, arms, noCurb,
        blockedSide: ix.blockedSide,
        roadColor: ix.roadColor, curbColor: ix.curbColor, curbWidth: ix.curbWidth,
        shoulder: jSh,
      };
    }

    if (ix.type === 'fourWay') {
      Intersections.fourWay(svg, ix.cx, ix.cy, ix.halfW, ix.halfH);
      if (junctionOpts) Intersections.junction(svg, ix.cx, ix.cy, ix.halfH, ix.halfW, junctionOpts);
    } else if (ix.type === 'tJunction') {
      Intersections.tJunction(svg, ix.cx, ix.cy, ix.blockedSide, ix.halfW, ix.halfH);
      if (junctionOpts) Intersections.junction(svg, ix.cx, ix.cy, ix.halfH, ix.halfW, junctionOpts);
    } else if (ix.type === 'turn') {
      const tr0 = roadMap[ix.roads?.[0]];
      const tr1 = roadMap[ix.roads?.[1]];
      const turnRoad = tr0 || tr1 || {};
      Intersections.turn(svg, ix.cx, ix.cy, ix.blockedSides || [], ix.halfW, ix.halfH, {
        laneWidth: turnRoad.laneWidth, lanesPerDirection: turnRoad.lanesPerDirection,
        centerLineStyle: turnRoad.centerLineStyle, shoulder: turnRoad.shoulder, median: turnRoad.median,
      });
      if (junctionOpts) Intersections.junction(svg, ix.cx, ix.cy, ix.halfH, ix.halfW, { ...junctionOpts, noFill: true });
    }
  }

  /* ── Entrance rendering ── */
  function renderEntrance(svg, ent, roadMap) {
    const road = roadMap[ent.road];
    if (!road) return;
    const roadHalf = Roads.roadWidth(road.laneWidth, road.lanesPerDirection, road.median, road.shoulder) / 2;
    const entHalf = ent.halfWidth || (50 * RESOLUTION_SCALE);
    const ecx = ent.center[0], ecy = ent.center[1];
    const side = ent.side;
    const oppositeSide = { north: 'south', south: 'north', east: 'west', west: 'east' }[side];
    const arms = { north: false, south: false, east: false, west: false };
    const noCurb = {};

    let halfH, halfW, jcx, jcy;
    const overlap = 5 * RESOLUTION_SCALE;
    if (road.orientation === 'vertical') {
      const sign = (side === 'east') ? 1 : -1;
      halfH = (roadHalf + overlap) / 2;
      jcx = road.center + sign * (roadHalf - overlap) / 2;
      jcy = ecy; halfW = entHalf;
      arms.north = true; arms.south = true; arms[side] = true; noCurb[oppositeSide] = true;
    } else {
      const sign = (side === 'south') ? 1 : -1;
      jcx = ecx; halfW = (roadHalf + overlap) / 2;
      jcy = road.center + sign * (roadHalf - overlap) / 2;
      halfH = entHalf;
      arms.east = true; arms.west = true; arms[side] = true; noCurb[oppositeSide] = true;
    }

    Intersections.junction(svg, jcx, jcy, halfH, halfW, {
      radius: ent.radius ?? (15 * RESOLUTION_SCALE), arms, noCurb,
      roadColor: ent.roadColor, curbColor: ent.curbColor, curbWidth: ent.curbWidth,
      shoulder: ent.shoulder ?? (road.shoulder ?? -1),
    });
  }

  /* ── Road rendering ── */
  function renderRoad(svg, r, junctions) {
    const opts = {
      laneWidth: r.laneWidth, lanesPerDirection: r.lanesPerDirection,
      laneLine: r.laneLine, centerLineStyle: r.centerLineStyle,
      roadColor: r.roadColor, median: r.median, medianColor: r.medianColor, shoulder: r.shoulder,
    };

    // Collect clip ranges where tJunctions/turns block this road
    const clips = [];
    junctions.forEach(jx => {
      if (!(jx.roads || []).includes(r.id)) return;
      if (jx.type === 'tJunction' && jx.blockedSide) {
        const bs = jx.blockedSide;
        if (r.orientation === 'vertical' && (bs === 'north' || bs === 'south')) {
          if (bs === 'north') clips.push({ cut: 'before', at: jx.cy - jx.halfW });
          else clips.push({ cut: 'after', at: jx.cy + jx.halfW });
        } else if (r.orientation === 'horizontal' && (bs === 'west' || bs === 'east')) {
          if (bs === 'west') clips.push({ cut: 'before', at: jx.cx - jx.halfH });
          else clips.push({ cut: 'after', at: jx.cx + jx.halfH });
        }
      }
      if (jx.type === 'turn' && jx.blockedSides) {
        jx.blockedSides.forEach(bs => {
          if (r.orientation === 'vertical' && (bs === 'north' || bs === 'south')) {
            if (bs === 'south') clips.push({ cut: 'after', at: jx.cy - jx.halfW });
            else clips.push({ cut: 'before', at: jx.cy + jx.halfW });
          } else if (r.orientation === 'horizontal' && (bs === 'west' || bs === 'east')) {
            if (bs === 'east') clips.push({ cut: 'after', at: jx.cx - jx.halfH });
            else clips.push({ cut: 'before', at: jx.cx + jx.halfH });
          }
        });
      }
    });

    let from = r.from, to = r.to;
    clips.forEach(c => {
      if (c.cut === 'before') from = Math.max(from, c.at);
      else to = Math.min(to, c.at);
    });
    if (from >= to) return;

    if (r.orientation === 'vertical') Roads.verticalRoad(svg, r.center, from, to, opts);
    else Roads.horizontalRoad(svg, r.center, from, to, opts);
  }

  /* ── Parking helpers ── */

  function splitOffset(stallIdx, splits, laneGap) {
    let count = 0;
    for (const s of splits) {
      if (s <= stallIdx) count++;
      else break;
    }
    return count * laneGap;
  }

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

  function renderParkingLot(svg, lot) {
    Parking.surface(svg, lot._x, lot._y, lot.width, lot.height, {
      entrances: lot._entrances,
    });
    const laneGap = lot._laneGap || DEFAULTS.laneGap;

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
          if (row.type === 'double') Parking.doubleColumn(svg, rx, segY, seg.count, opts);
          else Parking.stallColumn(svg, rx, segY, seg.count, opts);
        } else {
          const segX = rx + seg.start * sw + gapPx;
          if (row.type === 'double') Parking.doubleRow(svg, segX, ry, seg.count, opts);
          else Parking.stallRow(svg, segX, ry, seg.count, opts);
        }
      });
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

  return { DEFAULTS, VEHICLE_SIZES, BASE_PANE_W, BASE_PANE_H, render, addExportButton, applyDefaults, resolveExtends };
})();
