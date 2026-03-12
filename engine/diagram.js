// diagram.js — JSON-driven diagram engine
// Reads a diagram config object and renders a complete SVG driving diagram.
//
// Depends on: primitives.js (SVG, Terrain, Roads, Intersections, Vehicles, Signals, Parking, Compass)

const Diagram = (() => {

  /**
   * Render a complete diagram from a JSON config.
   * @param {HTMLElement} container - DOM element to render into
   * @param {object} cfg - diagram configuration (see schema below)
   * @returns {SVGElement} the rendered SVG
   *
   * Config schema:
   * {
   *   title: "Diagram Name",
   *   canvas: { width: 816, height: 1056 },
   *   background: "grass" | "none",
   *
   *   roads: [
   *     {
   *       id: "main-v",
   *       orientation: "vertical" | "horizontal",
   *       center: 408,          // x for vertical, y for horizontal
   *       from: 0, to: 1056,    // start/end along the road axis
   *       laneWidth: 50,
   *       lanesPerDirection: 1,
   *       laneLine: "dashed" | "solid" | "none",
   *       centerLineStyle: "dashed-yellow" | "solid-yellow" | "double-yellow" | "none"
   *     }
   *   ],
   *
   *   intersections: [
   *     {
   *       type: "fourWay" | "tJunction",
   *       center: [408, 528],
   *       roads: ["main-v", "main-h"],     // ids of the two roads
   *       blockedSide: "north"             // for tJunction only
   *     }
   *   ],
   *
   *   parkingLots: [
   *     {
   *       x, y, width, height,
   *       rows: [
   *         { type: "double" | "single", y: 100, stallsPerRow: 12, stallWidth: 38, stallDepth: 45, direction: "up"|"down" }
   *       ]
   *     }
   *   ],
   *
   *   connectors: [
   *     { type: "rect", x, y, width, height, fill: "#555555" }
   *   ],
   *
   *   vehicles: [
   *     // Absolute placement
   *     { x: 100, y: 200, direction: "north", color: "red", width: 22, height: 36 },
   *     // Lane-relative placement (for intersection diagrams)
   *     { road: "main-v", arm: "north", side: "left"|"right", lane: 0, t: 0.5, color: "blue" }
   *   ],
   *
   *   signals: [
   *     { type: "stopSign"|"trafficLight"|"laneArrow", x, y, direction, ... }
   *   ],
   *
   *   decorations: [
   *     { type: "compass", x, y, size }
   *   ],
   *
   *   grassAreas: [
   *     { x, y, width, height }   // explicit grass regions (if background is "none")
   *   ]
   * }
   */
  function render(container, cfg) {
    const W = cfg.canvas?.width || 816;
    const H = cfg.canvas?.height || 1056;
    const svg = SVG.create(container, W, H);

    // Set base background color
    if (cfg.background === 'none') {
      svg.style.backgroundColor = '#4a8c3f'; // still green — grass areas fill selectively
    } else {
      svg.style.backgroundColor = '#4a8c3f';
    }

    // Build road lookup
    const roadMap = {};
    (cfg.roads || []).forEach(r => { roadMap[r.id] = r; });

    // Build intersection lookup (to know road-to-road junction points)
    const junctions = (cfg.intersections || []).map(ix => {
      const cx = ix.center[0], cy = ix.center[1];
      // Compute half-widths from the two roads
      const r0 = roadMap[ix.roads?.[0]];
      const r1 = roadMap[ix.roads?.[1]];
      let halfH = 0, halfW = 0; // halfH = horizontal extent (from vertical road), halfW = vertical extent (from horizontal road)
      if (r0 && r1) {
        const vRoad = r0.orientation === 'vertical' ? r0 : r1;
        const hRoad = r0.orientation === 'horizontal' ? r0 : r1;
        halfH = Roads.roadWidth(vRoad.laneWidth, vRoad.lanesPerDirection, vRoad.median, vRoad.shoulder) / 2;
        halfW = Roads.roadWidth(hRoad.laneWidth, hRoad.lanesPerDirection, hRoad.median, hRoad.shoulder) / 2;
      }
      return { ...ix, cx, cy, halfH, halfW };
    });

    // 1. Background
    if (cfg.background !== 'none') {
      renderBackground(svg, W, H, cfg, roadMap, junctions);
    }

    // 2. Explicit grass areas
    (cfg.grassAreas || []).forEach(a => {
      Terrain.fillArea(svg, a.x, a.y, a.width, a.height);
    });

    // 3. Roads
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
        if (ix.blockedSide) arms[ix.blockedSide] = false;
        if (ix.blockedSides) ix.blockedSides.forEach(s => { arms[s] = false; });
        const jr0 = roadMap[ix.roads?.[0]];
        const jr1 = roadMap[ix.roads?.[1]];
        const jSh = Math.max(jr0?.shoulder ?? -1, jr1?.shoulder ?? -1);
        Intersections.junction(svg, ix.cx, ix.cy, ix.halfH, ix.halfW, {
          radius: ix.radius,
          arms,
          roadColor: ix.roadColor,
          curbColor: ix.curbColor,
          curbWidth: ix.curbWidth,
          shoulder: jSh,
        });
      }
    });

    // 7. Signals
    (cfg.signals || []).forEach(s => {
      if (s.type === 'stopSign') Signals.stopSign(svg, s.x, s.y, s);
      else if (s.type === 'trafficLight') Signals.trafficLight(svg, s.x, s.y, s);
      else if (s.type === 'laneArrow') Signals.laneArrow(svg, s.x, s.y, s.direction, s);
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

  /* ── Background ── */
  function renderBackground(svg, W, H, cfg, roadMap, junctions) {
    // Collect all road and junction bounding boxes so we can fill grass around them
    const rects = [];

    Object.values(roadMap).forEach(r => {
      const lw = r.laneWidth || Roads.D.laneWidth;
      const lpd = r.lanesPerDirection || 1;
      const tw = lw * lpd * 2;
      if (r.orientation === 'vertical') {
        rects.push({ x: r.center - tw / 2, y: Math.min(r.from, r.to), w: tw, h: Math.abs(r.to - r.from) });
      } else {
        rects.push({ x: Math.min(r.from, r.to), y: r.center - tw / 2, w: Math.abs(r.to - r.from), h: tw });
      }
    });

    (cfg.parkingLots || []).forEach(lot => {
      rects.push({ x: lot.x, y: lot.y, w: lot.width, h: lot.height });
    });

    (cfg.connectors || []).forEach(c => {
      rects.push({ x: c.x, y: c.y, w: c.width, h: c.height });
    });

    // Simple approach: fill the whole canvas with grass, then roads draw on top
    Terrain.fillArea(svg, 0, 0, W, H);
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
      if (row.type === 'double') {
        Parking.doubleRow(svg, row.x ?? lot.x + (row.offsetX || 0), row.y, row.stallsPerRow, opts);
      } else {
        Parking.stallRow(svg, row.x ?? lot.x + (row.offsetX || 0), row.y, row.stallsPerRow, opts);
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
    const carW = v.width || 22;
    const carH = v.height || 36;

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

  return { render, addExportButton };
})();
