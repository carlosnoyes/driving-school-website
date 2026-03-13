// primitives.js — Shared SVG drawing primitives for driving school diagrams
// All modules are plain IIFEs attached to `window`, no build step needed.

/* ───────────────────────────── SVG CORE ───────────────────────────── */

const SVG = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function create(container, w, h) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    container.appendChild(svg);
    return svg;
  }

  function el(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  function append(parent, tag, attrs) {
    const e = el(tag, attrs);
    parent.appendChild(e);
    return e;
  }

  const line  = (p, x1, y1, x2, y2, a = {}) => append(p, 'line', { x1, y1, x2, y2, ...a });
  const rect  = (p, x, y, w, h, a = {})      => append(p, 'rect', { x, y, width: w, height: h, ...a });
  const circle = (p, cx, cy, r, a = {})       => append(p, 'circle', { cx, cy, r, ...a });
  const path  = (p, d, a = {})                => append(p, 'path', { d, ...a });
  const text  = (p, x, y, txt, a = {})        => { const t = append(p, 'text', { x, y, ...a }); t.textContent = txt; return t; };
  const group = (p, a = {})                   => append(p, 'g', a);

  // Simple seeded PRNG for deterministic decoration
  function seedRandom(seed) {
    let s = seed || 1;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  return { NS, create, el, append, line, rect, circle, path, text, group, seedRandom };
})();


/* ───────────────────────────── TERRAIN ─────────────────────────────── */

const Terrain = (() => {
  const C = {
    grass: '#4a8c3f', grassAlt: '#3d7a34',
    bush: '#2d6b28', bushLight: '#3a8a32',
    tree: '#1f5c1a', trunk: '#6b4226',
  };

  function grass(p, x, y, w, h) {
    const g = SVG.group(p);
    SVG.rect(g, x, y, w, h, { fill: C.grass });
    const rng = SVG.seedRandom(x * 7 + y * 13);
    const n = Math.floor((w * h) / 4000);
    for (let i = 0; i < n; i++) {
      SVG.rect(g, x + rng() * w - 10, y + rng() * h - 8, 15 + rng() * 30, 10 + rng() * 20,
        { fill: C.grassAlt, rx: 6, ry: 6, opacity: 0.4 + rng() * 0.3 });
    }
    return g;
  }

  function bush(p, cx, cy, size = 10) {
    const g = SVG.group(p);
    SVG.circle(g, cx, cy, size, { fill: C.bush });
    SVG.circle(g, cx - size * 0.5, cy - size * 0.3, size * 0.7, { fill: C.bushLight });
    SVG.circle(g, cx + size * 0.5, cy - size * 0.2, size * 0.65, { fill: C.bush });
    SVG.circle(g, cx + size * 0.1, cy - size * 0.6, size * 0.5, { fill: C.bushLight });
    return g;
  }

  function tree(p, cx, cy, size = 14) {
    const g = SVG.group(p);
    SVG.rect(g, cx - 2, cy, 4, size * 0.6, { fill: C.trunk, rx: 1 });
    SVG.circle(g, cx, cy - size * 0.1, size, { fill: C.tree });
    SVG.circle(g, cx - size * 0.4, cy + size * 0.2, size * 0.7, { fill: C.bush });
    SVG.circle(g, cx + size * 0.4, cy + size * 0.1, size * 0.65, { fill: C.tree });
    return g;
  }

  function plant(p, cx, cy) {
    const g = SVG.group(p);
    SVG.circle(g, cx, cy, 3, { fill: '#5a9a50' });
    SVG.circle(g, cx, cy, 1.5, { fill: '#7ab870' });
    return g;
  }

  function fillArea(p, x, y, w, h, opts = {}) {
    if (w <= 0 || h <= 0) return SVG.group(p);
    const margin = opts.margin ?? 15;
    const g = SVG.group(p);
    grass(g, x, y, w, h);
    const rng = SVG.seedRandom(x * 31 + y * 17 + w * 3);
    const ix = x + margin, iy = y + margin, iw = w - margin * 2, ih = h - margin * 2;
    if (iw <= 0 || ih <= 0) return g;
    for (let i = 0, n = Math.floor((iw * ih) / 6000) + 2; i < n; i++)
      bush(g, ix + rng() * iw, iy + rng() * ih, 6 + rng() * 8);
    for (let i = 0, n = Math.floor((iw * ih) / 12000) + 1; i < n; i++)
      tree(g, ix + rng() * iw, iy + rng() * ih, 8 + rng() * 10);
    for (let i = 0, n = Math.floor((iw * ih) / 3000); i < n; i++)
      plant(g, ix + rng() * iw, iy + rng() * ih);
    return g;
  }

  return { C, grass, bush, tree, plant, fillArea };
})();


/* ───────────────────────────── ROADS ───────────────────────────────── */

const Roads = (() => {
  const D = {
    laneWidth: 50, roadColor: '#333333',
    lineColor: '#fff', centerColor: '#ddcc00',
    centerWidth: 2, laneLineWidth: 1.5,
    dashLen: 20, dashGap: 15,
  };

  function dashedLine(p, x1, y1, x2, y2, o = {}) {
    return SVG.line(p, x1, y1, x2, y2, {
      stroke: o.color || '#fff', 'stroke-width': o.width || D.laneLineWidth,
      'stroke-dasharray': `${o.dashLen || D.dashLen},${o.dashGap || D.dashGap}`, fill: 'none',
    });
  }

  function solidLine(p, x1, y1, x2, y2, o = {}) {
    return SVG.line(p, x1, y1, x2, y2, {
      stroke: o.color || D.centerColor, 'stroke-width': o.width || D.centerWidth, fill: 'none',
    });
  }

  function centerLine(p, x1, y1, x2, y2, style = 'dashed-yellow') {
    if (style === 'none') return;
    if (style === 'solid-yellow' || style === 'solid') {
      solidLine(p, x1, y1, x2, y2, { color: D.centerColor });
    } else if (style === 'double-yellow') {
      const isVert = (x1 === x2);
      const off = 2;
      if (isVert) {
        solidLine(p, x1 - off, y1, x2 - off, y2, { color: D.centerColor });
        solidLine(p, x1 + off, y1, x2 + off, y2, { color: D.centerColor });
      } else {
        solidLine(p, x1, y1 - off, x2, y2 - off, { color: D.centerColor });
        solidLine(p, x1, y1 + off, x2, y2 + off, { color: D.centerColor });
      }
    } else {
      // dashed-yellow (default)
      dashedLine(p, x1, y1, x2, y2, { color: D.centerColor, width: D.centerWidth });
    }
  }

  /**
   * Draw a median strip (raised/painted divider replacing center line).
   * @param {Element} g - parent group
   * @param {number} medianWidth - width in px (0 = no median)
   * @param {string} medianColor - fill color
   * Coordinates depend on orientation, so caller passes the right rect args.
   */
  function medianRect(g, x, y, w, h, color) {
    SVG.rect(g, x, y, w, h, { fill: color });
  }

  /**
   * Draw shoulders on a road segment.
   * A shoulder is: solid white edge line, then a strip of road-colored pavement.
   * If shoulder size is 0, only the solid white edge line is drawn.
   */
  function drawShoulders(g, orientation, edgePositions, start, end, shoulderWidth, roadColor) {
    // edgePositions: [leftOrTop, rightOrBottom] — the outer edges of the travel lanes
    const [e1, e2] = edgePositions;
    if (orientation === 'vertical') {
      // e1 = left edge x, e2 = right edge x
      // Left shoulder: from (e1 - shoulderWidth) to e1
      if (shoulderWidth > 0) {
        SVG.rect(g, e1 - shoulderWidth, Math.min(start, end), shoulderWidth, Math.abs(end - start), { fill: roadColor });
      }
      solidLine(g, e1, start, e1, end, { color: '#fff', width: D.laneLineWidth });
      // Right shoulder: from e2 to (e2 + shoulderWidth)
      if (shoulderWidth > 0) {
        SVG.rect(g, e2, Math.min(start, end), shoulderWidth, Math.abs(end - start), { fill: roadColor });
      }
      solidLine(g, e2, start, e2, end, { color: '#fff', width: D.laneLineWidth });
    } else {
      // e1 = top edge y, e2 = bottom edge y
      if (shoulderWidth > 0) {
        SVG.rect(g, Math.min(start, end), e1 - shoulderWidth, Math.abs(end - start), shoulderWidth, { fill: roadColor });
      }
      solidLine(g, start, e1, end, e1, { color: '#fff', width: D.laneLineWidth });
      if (shoulderWidth > 0) {
        SVG.rect(g, Math.min(start, end), e2, Math.abs(end - start), shoulderWidth, { fill: roadColor });
      }
      solidLine(g, start, e2, end, e2, { color: '#fff', width: D.laneLineWidth });
    }
  }

  /**
   * Draw a vertical road.
   * Layout (left to right): [shoulder | lanes | median-or-centerLine | lanes | shoulder]
   *
   * @param {object} opts
   *   laneWidth, lanesPerDirection, laneLine, centerLineStyle, roadColor,
   *   median: number (px width, 0=none),  medianColor: string,
   *   shoulder: number (px width, 0=edge-line-only)
   */
  function verticalRoad(p, cx, y1, y2, opts = {}) {
    const lw = opts.laneWidth || D.laneWidth;
    const lpd = opts.lanesPerDirection || 1;
    const med = opts.median || 0;
    const sh = opts.shoulder ?? -1;   // -1 means no shoulder at all
    const rc = opts.roadColor || D.roadColor;
    const lanesW = lw * lpd;         // width of lanes on one side
    const totalW = lanesW * 2 + med + (sh > 0 ? sh * 2 : 0);
    const left = cx - totalW / 2;
    const g = SVG.group(p);
    const yMin = Math.min(y1, y2), yLen = Math.abs(y2 - y1);

    // Road surface (full width including shoulders)
    SVG.rect(g, left, yMin, totalW, yLen, { fill: rc });

    // Shoulder positions
    const lanesLeftEdge = left + (sh > 0 ? sh : 0);
    const lanesRightEdge = left + totalW - (sh > 0 ? sh : 0);

    // Shoulders
    if (sh >= 0) {
      drawShoulders(g, 'vertical', [lanesLeftEdge, lanesRightEdge], y1, y2, sh > 0 ? sh : 0, rc);
    }

    // Center: median or center line
    if (med > 0) {
      const medX = cx - med / 2;
      medianRect(g, medX, yMin, med, yLen, opts.medianColor || '#5a5a5a');
    } else {
      centerLine(g, cx, y1, cx, y2, opts.centerLineStyle || 'dashed-yellow');
    }

    // Lane dividers
    const ll = opts.laneLine ?? 'dashed';
    if (ll !== 'none') {
      for (let i = 1; i < lpd; i++) {
        const lx = lanesLeftEdge + i * lw;
        const rx = cx + med / 2 + i * lw;
        if (ll === 'solid') {
          solidLine(g, lx, y1, lx, y2, { color: '#fff', width: D.laneLineWidth });
          solidLine(g, rx, y1, rx, y2, { color: '#fff', width: D.laneLineWidth });
        } else {
          dashedLine(g, lx, y1, lx, y2);
          dashedLine(g, rx, y1, rx, y2);
        }
      }
    }
    return g;
  }

  function horizontalRoad(p, cy, x1, x2, opts = {}) {
    const lw = opts.laneWidth || D.laneWidth;
    const lpd = opts.lanesPerDirection || 1;
    const med = opts.median || 0;
    const sh = opts.shoulder ?? -1;
    const rc = opts.roadColor || D.roadColor;
    const lanesW = lw * lpd;
    const totalW = lanesW * 2 + med + (sh > 0 ? sh * 2 : 0);
    const top = cy - totalW / 2;
    const g = SVG.group(p);
    const xMin = Math.min(x1, x2), xLen = Math.abs(x2 - x1);

    SVG.rect(g, xMin, top, xLen, totalW, { fill: rc });

    const lanesTopEdge = top + (sh > 0 ? sh : 0);
    const lanesBottomEdge = top + totalW - (sh > 0 ? sh : 0);

    if (sh >= 0) {
      drawShoulders(g, 'horizontal', [lanesTopEdge, lanesBottomEdge], x1, x2, sh > 0 ? sh : 0, rc);
    }

    if (med > 0) {
      const medY = cy - med / 2;
      medianRect(g, xMin, medY, xLen, med, opts.medianColor || '#5a5a5a');
    } else {
      centerLine(g, x1, cy, x2, cy, opts.centerLineStyle || 'dashed-yellow');
    }

    const ll = opts.laneLine ?? 'dashed';
    if (ll !== 'none') {
      for (let i = 1; i < lpd; i++) {
        const ty = lanesTopEdge + i * lw;
        const by = cy + med / 2 + i * lw;
        if (ll === 'solid') {
          solidLine(g, x1, ty, x2, ty, { color: '#fff', width: D.laneLineWidth });
          solidLine(g, x1, by, x2, by, { color: '#fff', width: D.laneLineWidth });
        } else {
          dashedLine(g, x1, ty, x2, ty);
          dashedLine(g, x1, by, x2, by);
        }
      }
    }
    return g;
  }

  /**
   * Compute the total road width from params (including median and shoulders).
   */
  function roadWidth(laneWidth, lanesPerDirection, median, shoulder) {
    const lw = laneWidth || D.laneWidth;
    const lpd = lanesPerDirection || 1;
    const med = median || 0;
    const sh = (shoulder != null && shoulder >= 0) ? shoulder : 0;
    return lw * lpd * 2 + med + (sh > 0 ? sh * 2 : 0);
  }

  return { D, dashedLine, solidLine, centerLine, verticalRoad, horizontalRoad, roadWidth };
})();


/* ───────────────────────────── INTERSECTIONS ──────────────────────── */

const Intersections = (() => {
  // halfW = half-width of the horizontal road (vertical extent at intersection)
  // halfH = half-width of the vertical road (horizontal extent at intersection)
  function fourWay(p, cx, cy, halfW, halfH) {
    const g = SVG.group(p);
    SVG.rect(g, cx - halfH, cy - halfW, halfH * 2, halfW * 2, { fill: Roads.D.roadColor });
    return g;
  }

  function tJunction(p, cx, cy, blockedSide, halfW, halfH) {
    const g = SVG.group(p);
    // Only fill the side-road half of the intersection, leaving the
    // through-road's far side (blocked side) untouched.
    if (blockedSide === 'west') {
      // Through road is vertical, side road goes east. Fill from center rightward.
      SVG.rect(g, cx, cy - halfW, halfH, halfW * 2, { fill: Roads.D.roadColor });
    } else if (blockedSide === 'east') {
      SVG.rect(g, cx - halfH, cy - halfW, halfH, halfW * 2, { fill: Roads.D.roadColor });
    } else if (blockedSide === 'north') {
      SVG.rect(g, cx - halfH, cy, halfH * 2, halfW, { fill: Roads.D.roadColor });
    } else if (blockedSide === 'south') {
      SVG.rect(g, cx - halfH, cy - halfW, halfH * 2, halfW, { fill: Roads.D.roadColor });
    }
    return g;
  }

  /**
   * Junction overlay with rounded curb corners.
   * Draws on top of intersection + roads to smooth the corners.
   *
   * @param {number} halfH - half-width of vertical road (horizontal extent)
   * @param {number} halfW - half-width of horizontal road (vertical extent)
   * @param {object} opts - radius, arms, roadColor, curbColor, curbWidth
   */
  function junction(p, cx, cy, halfH, halfW, opts = {}) {
    const r = opts.radius ?? 20;
    const rc = opts.roadColor || Roads.D.roadColor;
    const arms = opts.arms || { north: true, south: true, east: true, west: true };
    const curbColor = opts.curbColor || '#ccc';
    const curbWidth = opts.curbWidth || 3;
    const sh = opts.shoulder || 0;
    const noCurb = opts.noCurb || {};
    const g = SVG.group(p);

    const left  = cx - halfH;
    const right = cx + halfH;
    const top   = cy - halfW;
    const bot   = cy + halfW;
    const blocked = opts.blockedSide || null;

    // Fill intersection box (masks lines through intersection)
    // For T-junctions, fill from just past the far shoulder line to the open side
    const si = sh + 1; // shoulder inset — clear past the shoulder line thickness
    if (blocked === 'west') {
      SVG.rect(g, left + si, top, right - left - si, halfW * 2, { fill: rc });
    } else if (blocked === 'east') {
      SVG.rect(g, left, top, right - left - si, halfW * 2, { fill: rc });
    } else if (blocked === 'north') {
      SVG.rect(g, left, top + si, halfH * 2, bot - top - si, { fill: rc });
    } else if (blocked === 'south') {
      SVG.rect(g, left, top, halfH * 2, bot - top - si, { fill: rc });
    } else {
      SVG.rect(g, left, top, halfH * 2, halfW * 2, { fill: rc });
    }

    // Arm extensions — mask road markings up to the radius point
    // For T-junctions, only extend on the side-road half
    if (arms.north) {
      if (blocked === 'west') SVG.rect(g, left + si, top - r, right - left - si, r, { fill: rc });
      else if (blocked === 'east') SVG.rect(g, left, top - r, right - left - si, r, { fill: rc });
      else SVG.rect(g, left, top - r, halfH * 2, r, { fill: rc });
    }
    if (arms.south) {
      if (blocked === 'west') SVG.rect(g, left + si, bot, right - left - si, r, { fill: rc });
      else if (blocked === 'east') SVG.rect(g, left, bot, right - left - si, r, { fill: rc });
      else SVG.rect(g, left, bot, halfH * 2, r, { fill: rc });
    }
    if (arms.west) {
      if (blocked === 'north') SVG.rect(g, left - r, top + si, r, bot - top - si, { fill: rc });
      else if (blocked === 'south') SVG.rect(g, left - r, top, r, bot - top - si, { fill: rc });
      else SVG.rect(g, left - r, top, r, halfW * 2, { fill: rc });
    }
    if (arms.east) {
      if (blocked === 'north') SVG.rect(g, right, top + si, r, bot - top - si, { fill: rc });
      else if (blocked === 'south') SVG.rect(g, right, top, r, bot - top - si, { fill: rc });
      else SVG.rect(g, right, top, r, halfW * 2, { fill: rc });
    }

    // Corner carving — fill r×r square, carve quarter circle with grass
    const grassColor = Terrain.C.grass;
    _corner(g, left, top, -1, -1, arms.north, arms.west, r, rc, grassColor);
    _corner(g, right, top, 1, -1, arms.north, arms.east, r, rc, grassColor);
    _corner(g, right, bot, 1, 1, arms.south, arms.east, r, rc, grassColor);
    _corner(g, left, bot, -1, 1, arms.south, arms.west, r, rc, grassColor);

    // Curved shoulder white lines through the junction corners
    if (sh >= 0) {
      // The shoulder white line is at the inner edge of the shoulder:
      //   vertical road: at left + sh and right - sh (i.e. halfH - sh from center)
      //   horizontal road: at top + sh and bot - sh (i.e. halfW - sh from center)
      // At each corner, the white line curves from the vertical position to the horizontal.
      // Arc center = corner point. Radius = distance from corner to the white line = sh
      // (since the white line is sh pixels inward from the outer edge which IS the corner)
      const slw = Roads.D.laneLineWidth;
      _shoulderArc(g, left, top, -1, -1, arms.north, arms.west, r, sh, '#fff', slw);
      _shoulderArc(g, right, top, 1, -1, arms.north, arms.east, r, sh, '#fff', slw);
      _shoulderArc(g, right, bot, 1, 1, arms.south, arms.east, r, sh, '#fff', slw);
      _shoulderArc(g, left, bot, -1, 1, arms.south, arms.west, r, sh, '#fff', slw);
    }

    // Straight curb lines on blocked sides only (skip if noCurb)
    if (!arms.north && !noCurb.north) SVG.line(g, left, top, right, top, { stroke: curbColor, 'stroke-width': curbWidth });
    if (!arms.south && !noCurb.south) SVG.line(g, left, bot, right, bot, { stroke: curbColor, 'stroke-width': curbWidth });
    if (!arms.west  && !noCurb.west)  SVG.line(g, left, top, left, bot, { stroke: curbColor, 'stroke-width': curbWidth });
    if (!arms.east  && !noCurb.east)  SVG.line(g, right, top, right, bot, { stroke: curbColor, 'stroke-width': curbWidth });

    return g;
  }

  /**
   * Draw a curved shoulder white line at a corner.
   * The shoulder line is `sh` pixels inward from the outer road edge.
   * Arc radius = r + sh (curb radius + shoulder inset).
   */
  function _shoulderArc(g, ex, ey, dx, dy, armA, armB, r, sh, color, width) {
    if (!armA || !armB) return;
    if (sh <= 0) return;
    const arcR = r + sh;
    // Arc endpoints: sh pixels inward from road edge, r pixels away from intersection edge
    const ax1 = ex - dx * sh, ay1 = ey + dy * r;
    const ax2 = ex + dx * r, ay2 = ey - dy * sh;
    const sweep = (dx * dy > 0) ? 1 : 0;
    SVG.path(g, `M ${ax1} ${ay1} A ${arcR} ${arcR} 0 0 ${sweep} ${ax2} ${ay2}`, { fill: 'none', stroke: color, 'stroke-width': width });
  }

  function _corner(g, ex, ey, dx, dy, armA, armB, r, roadColor, bgColor) {
    if (!armA || !armB) return;
    const sx = dx < 0 ? ex - r : ex;
    const sy = dy < 0 ? ey - r : ey;
    SVG.rect(g, sx, sy, r, r, { fill: roadColor });

    const ax1 = ex + dx * r, ay1 = ey;
    const ax2 = ex, ay2 = ey + dy * r;
    const sweep = (dx * dy > 0) ? 0 : 1;
    const cornerX = ex + dx * r, cornerY = ey + dy * r;
    SVG.path(g, `M ${cornerX} ${cornerY} L ${ax1} ${ay1} A ${r} ${r} 0 0 ${sweep} ${ax2} ${ay2} L ${cornerX} ${cornerY} Z`, { fill: bgColor });
  }


  return { fourWay, tJunction, junction };
})();


/* ───────────────────────────── VEHICLES ───────────────────────────── */

const Vehicles = (() => {
  const COLORS = {
    default: '#cccccc', gray: '#cccccc', red: '#cc4444', blue: '#4466cc',
    green: '#44aa66', white: '#eeeeee', black: '#333333', yellow: '#d4a843', orange: '#cc7733',
  };

  function car(p, cx, cy, opts = {}) {
    const color = COLORS[opts.color] || opts.color || COLORS.default;
    const dir = opts.direction || 'north';
    const cw = opts.width || 24, ch = opts.height || 40;
    const g = SVG.group(p);
    const w = (dir === 'north' || dir === 'south') ? cw : ch;
    const h = (dir === 'north' || dir === 'south') ? ch : cw;
    SVG.rect(g, cx - w / 2, cy - h / 2, w, h, { fill: color, stroke: '#555', 'stroke-width': 1.5, rx: 5, ry: 5 });
    if (opts.rotation) g.setAttribute('transform', `rotate(${opts.rotation}, ${cx}, ${cy})`);
    return g;
  }

  return { COLORS, car };
})();


/* ───────────────────────────── SIGNALS ─────────────────────────────── */

const Signals = (() => {
  function trafficLight(p, x, y, opts = {}) {
    const dir = opts.direction || 'east';
    const active = opts.activeLight || 'red';
    const sc = opts.scale || 1;
    const g = SVG.group(p);
    const w = 16 * sc, h = 42 * sc, r = 5 * sc, pad = 3 * sc;

    let rot = 0;
    if (dir === 'south') rot = 90;
    else if (dir === 'west') rot = 180;
    else if (dir === 'north') rot = 270;
    g.setAttribute('transform', `rotate(${rot}, ${x}, ${y})`);

    SVG.rect(g, x - w / 2, y - h / 2, w, h, { fill: '#333', stroke: '#222', 'stroke-width': 1, rx: 3 });

    const off = { red: '#661111', yellow: '#665511', green: '#116611' };
    const on  = { red: '#ff2222', yellow: '#ffcc00', green: '#22ff44' };
    ['red', 'yellow', 'green'].forEach((c, i) => {
      const ly = y - h / 2 + pad + r + i * (r * 2 + pad);
      SVG.circle(g, x, ly, r, { fill: c === active ? on[c] : off[c], stroke: '#111', 'stroke-width': 0.5 });
    });

    SVG.rect(g, x - 2 * sc, y + h / 2, 4 * sc, 15 * sc, { fill: '#555', stroke: '#333', 'stroke-width': 0.5 });
    return g;
  }

  function stopSign(p, x, y, opts = {}) {
    // (x, y) = pole base (ground level)
    const sc = opts.scale || 1;
    const size = 14 * sc;
    const poleH = opts.poleHeight || 20 * sc;
    const rot = opts.rotation || 0;
    const g = SVG.group(p);
    if (rot) g.setAttribute('transform', `rotate(${rot}, ${x}, ${y})`);
    // Octagon center, offset upward from pole base
    const oy = y - poleH - size;
    // Pole
    SVG.line(g, x, oy + size, x, y, {
      stroke: '#222', 'stroke-width': 3 * sc, 'stroke-linecap': 'round',
    });
    // Octagon
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      pts.push(`${x + size * Math.cos(a)},${oy + size * Math.sin(a)}`);
    }
    SVG.append(g, 'polygon', { points: pts.join(' '), fill: '#cc0000', stroke: '#880000', 'stroke-width': 1 });
    SVG.text(g, x, oy + 3 * sc, 'STOP', {
      fill: 'white', 'font-size': 7 * sc, 'font-weight': 'bold',
      'text-anchor': 'middle', 'font-family': 'Arial, sans-serif',
    });
    return g;
  }

  function laneArrow(p, x, y, direction, opts = {}) {
    const sc = opts.scale || 1;
    const color = opts.color || '#fff';
    const g = SVG.group(p);
    let rot = 0;
    if (direction === 'east') rot = 90;
    else if (direction === 'south') rot = 180;
    else if (direction === 'west') rot = 270;
    g.setAttribute('transform', `rotate(${rot}, ${x}, ${y})`);
    const s = 8 * sc;
    SVG.path(g,
      `M ${x} ${y - s} L ${x + s * 0.6} ${y} L ${x + s * 0.2} ${y} L ${x + s * 0.2} ${y + s} L ${x - s * 0.2} ${y + s} L ${x - s * 0.2} ${y} L ${x - s * 0.6} ${y} Z`,
      { fill: color, stroke: 'none', opacity: 0.8 });
    return g;
  }

  return { trafficLight, stopSign, laneArrow };
})();


/* ───────────────────────────── PARKING ─────────────────────────────── */

const Parking = (() => {
  const D = {
    stallWidth: 40, stallDepth: 70,
    lineColor: '#ffffff', lineWidth: 1.5,
    surfaceColor: '#555555', borderColor: '#cccccc', borderWidth: 2,
  };

  function stall(p, x, y, opts = {}) {
    const w = opts.stallWidth || D.stallWidth;
    const d = opts.stallDepth || D.stallDepth;
    const dir = opts.direction || 'up';
    const c = opts.lineColor || D.lineColor;
    const lw = opts.lineWidth || D.lineWidth;
    const g = SVG.group(p);
    SVG.line(g, x, y, x, y + d, { stroke: c, 'stroke-width': lw });
    SVG.line(g, x + w, y, x + w, y + d, { stroke: c, 'stroke-width': lw });
    if (dir === 'up') SVG.line(g, x, y, x + w, y, { stroke: c, 'stroke-width': lw });
    else SVG.line(g, x, y + d, x + w, y + d, { stroke: c, 'stroke-width': lw });
    return g;
  }

  function stallRow(p, x, y, count, opts = {}) {
    const w = opts.stallWidth || D.stallWidth;
    const g = SVG.group(p);
    for (let i = 0; i < count; i++) stall(g, x + i * w, y, opts);
    return g;
  }

  function doubleRow(p, x, y, count, opts = {}) {
    const d = opts.stallDepth || D.stallDepth;
    const g = SVG.group(p);
    stallRow(g, x, y, count, { ...opts, direction: 'down' });
    stallRow(g, x, y + d, count, { ...opts, direction: 'up' });
    return g;
  }

  // Vertical stall — opens left or right
  function stallV(p, x, y, opts = {}) {
    const w = opts.stallWidth || D.stallWidth;   // becomes the vertical extent
    const d = opts.stallDepth || D.stallDepth;   // becomes the horizontal extent
    const dir = opts.direction || 'left';
    const c = opts.lineColor || D.lineColor;
    const lw = opts.lineWidth || D.lineWidth;
    const g = SVG.group(p);
    SVG.line(g, x, y, x + d, y, { stroke: c, 'stroke-width': lw });
    SVG.line(g, x, y + w, x + d, y + w, { stroke: c, 'stroke-width': lw });
    if (dir === 'left') SVG.line(g, x, y, x, y + w, { stroke: c, 'stroke-width': lw });
    else SVG.line(g, x + d, y, x + d, y + w, { stroke: c, 'stroke-width': lw });
    return g;
  }

  function stallColumn(p, x, y, count, opts = {}) {
    const w = opts.stallWidth || D.stallWidth;
    const g = SVG.group(p);
    for (let i = 0; i < count; i++) stallV(g, x, y + i * w, opts);
    return g;
  }

  function doubleColumn(p, x, y, count, opts = {}) {
    const d = opts.stallDepth || D.stallDepth;
    const g = SVG.group(p);
    stallColumn(g, x, y, count, { ...opts, direction: 'right' });
    stallColumn(g, x + d, y, count, { ...opts, direction: 'left' });
    return g;
  }

  function surface(p, x, y, w, h, opts = {}) {
    const g = SVG.group(p);
    SVG.rect(g, x, y, w, h, { fill: opts.surfaceColor || D.surfaceColor });
    SVG.rect(g, x, y, w, h, { fill: 'none', stroke: opts.borderColor || D.borderColor, 'stroke-width': opts.borderWidth || D.borderWidth });
    return g;
  }

  return { D, stall, stallRow, doubleRow, stallV, stallColumn, doubleColumn, surface };
})();


/* ──────────────────────── COMPASS ROSE ───────────────────────────── */

const Compass = (() => {
  function draw(p, cx, cy, size = 30) {
    const g = SVG.group(p);
    const s = size;
    // Cross arrows
    // Vertical arrow (N-S)
    SVG.line(g, cx, cy - s, cx, cy + s, { stroke: '#333', 'stroke-width': 1.5 });
    // Horizontal arrow (E-W)
    SVG.line(g, cx - s, cy, cx + s, cy, { stroke: '#333', 'stroke-width': 1.5 });
    // Arrowheads
    const ah = 6;
    // North
    SVG.path(g, `M ${cx} ${cy - s} L ${cx - ah} ${cy - s + ah} L ${cx + ah} ${cy - s + ah} Z`, { fill: '#333' });
    // South
    SVG.path(g, `M ${cx} ${cy + s} L ${cx - ah} ${cy + s - ah} L ${cx + ah} ${cy + s - ah} Z`, { fill: '#333' });
    // East
    SVG.path(g, `M ${cx + s} ${cy} L ${cx + s - ah} ${cy - ah} L ${cx + s - ah} ${cy + ah} Z`, { fill: '#333' });
    // West
    SVG.path(g, `M ${cx - s} ${cy} L ${cx - s + ah} ${cy - ah} L ${cx - s + ah} ${cy + ah} Z`, { fill: '#333' });

    return g;
  }
  return { draw };
})();
