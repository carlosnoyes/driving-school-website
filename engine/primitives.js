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
   * Draw a vertical road.
   * @param {Element} p - parent SVG/group
   * @param {number} cx - center x
   * @param {number} y1 - start y
   * @param {number} y2 - end y
   * @param {object} opts - { laneWidth, lanesPerDirection, laneLine, centerLineStyle, roadColor }
   */
  function verticalRoad(p, cx, y1, y2, opts = {}) {
    const lw = opts.laneWidth || D.laneWidth;
    const lpd = opts.lanesPerDirection || 1;
    const totalW = lw * lpd * 2;
    const left = cx - totalW / 2;
    const g = SVG.group(p);

    SVG.rect(g, left, Math.min(y1, y2), totalW, Math.abs(y2 - y1), { fill: opts.roadColor || D.roadColor });

    // Center line
    centerLine(g, cx, y1, cx, y2, opts.centerLineStyle || 'dashed-yellow');

    // Lane dividers
    const ll = opts.laneLine ?? 'dashed';
    if (ll !== 'none') {
      for (let i = 1; i < lpd; i++) {
        const lx = left + i * lw;
        const rx = cx + i * lw;
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
    const totalW = lw * lpd * 2;
    const top = cy - totalW / 2;
    const g = SVG.group(p);

    SVG.rect(g, Math.min(x1, x2), top, Math.abs(x2 - x1), totalW, { fill: opts.roadColor || D.roadColor });

    // Center line
    centerLine(g, x1, cy, x2, cy, opts.centerLineStyle || 'dashed-yellow');

    // Lane dividers
    const ll = opts.laneLine ?? 'dashed';
    if (ll !== 'none') {
      for (let i = 1; i < lpd; i++) {
        const ty = top + i * lw;
        const by = cy + i * lw;
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
   * Compute the total road width from params.
   */
  function roadWidth(laneWidth, lanesPerDirection) {
    return (laneWidth || D.laneWidth) * (lanesPerDirection || 1) * 2;
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
    SVG.rect(g, cx - halfH, cy - halfW, halfH * 2, halfW * 2, { fill: Roads.D.roadColor });
    // Draw curb on the blocked side
    const cw = 3;
    if (blockedSide === 'north')
      SVG.line(g, cx - halfH, cy - halfW, cx + halfH, cy - halfW, { stroke: '#ccc', 'stroke-width': cw });
    else if (blockedSide === 'south')
      SVG.line(g, cx - halfH, cy + halfW, cx + halfH, cy + halfW, { stroke: '#ccc', 'stroke-width': cw });
    else if (blockedSide === 'east')
      SVG.line(g, cx + halfH, cy - halfW, cx + halfH, cy + halfW, { stroke: '#ccc', 'stroke-width': cw });
    else if (blockedSide === 'west')
      SVG.line(g, cx - halfH, cy - halfW, cx - halfH, cy + halfW, { stroke: '#ccc', 'stroke-width': cw });
    return g;
  }

  return { fourWay, tJunction };
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
    const sc = opts.scale || 1;
    const size = 14 * sc;
    const g = SVG.group(p);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      pts.push(`${x + size * Math.cos(a)},${y + size * Math.sin(a)}`);
    }
    SVG.append(g, 'polygon', { points: pts.join(' '), fill: '#cc0000', stroke: '#880000', 'stroke-width': 1 });
    SVG.text(g, x, y + 3 * sc, 'STOP', {
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

  function surface(p, x, y, w, h, opts = {}) {
    const g = SVG.group(p);
    SVG.rect(g, x, y, w, h, { fill: opts.surfaceColor || D.surfaceColor });
    SVG.rect(g, x, y, w, h, { fill: 'none', stroke: opts.borderColor || D.borderColor, 'stroke-width': opts.borderWidth || D.borderWidth });
    return g;
  }

  return { D, stall, stallRow, doubleRow, surface };
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
