// terrain.js - Grass, bushes, trees, and other off-road elements

const Terrain = (() => {
  const { rect, circle, path, group, el } = DiagramCore;

  const DEFAULTS = {
    grassColor: '#4a8c3f',
    grassColorAlt: '#3d7a34',
    bushColor: '#2d6b28',
    bushColorLight: '#3a8a32',
    treeColor: '#1f5c1a',
    treeTrunk: '#6b4226',
  };

  // Fill a rectangular area with grass (solid green with subtle variation)
  function grass(svg, x, y, w, h) {
    const g = group(svg);

    // Base grass
    rect(g, x, y, w, h, { fill: DEFAULTS.grassColor });

    // Subtle grass patches for texture
    const rng = seedRandom(x * 7 + y * 13);
    const patchCount = Math.floor((w * h) / 4000);
    for (let i = 0; i < patchCount; i++) {
      const px = x + rng() * w;
      const py = y + rng() * h;
      const pw = 15 + rng() * 30;
      const ph = 10 + rng() * 20;
      rect(g, px - pw / 2, py - ph / 2, pw, ph, {
        fill: DEFAULTS.grassColorAlt,
        rx: 6, ry: 6,
        opacity: 0.4 + rng() * 0.3,
      });
    }

    return g;
  }

  // Draw a bush (cluster of circles)
  function bush(svg, cx, cy, size) {
    const g = group(svg);
    const s = size || 10;

    // Main body
    circle(g, cx, cy, s, { fill: DEFAULTS.bushColor });
    circle(g, cx - s * 0.5, cy - s * 0.3, s * 0.7, { fill: DEFAULTS.bushColorLight });
    circle(g, cx + s * 0.5, cy - s * 0.2, s * 0.65, { fill: DEFAULTS.bushColor });
    circle(g, cx + s * 0.1, cy - s * 0.6, s * 0.5, { fill: DEFAULTS.bushColorLight });

    return g;
  }

  // Draw a small tree (circle canopy + trunk)
  function tree(svg, cx, cy, size) {
    const g = group(svg);
    const s = size || 14;

    // Trunk
    rect(g, cx - 2, cy, 4, s * 0.6, {
      fill: DEFAULTS.treeTrunk,
      rx: 1, ry: 1,
    });

    // Canopy
    circle(g, cx, cy - s * 0.1, s, { fill: DEFAULTS.treeColor });
    circle(g, cx - s * 0.4, cy + s * 0.2, s * 0.7, { fill: DEFAULTS.bushColor });
    circle(g, cx + s * 0.4, cy + s * 0.1, s * 0.65, { fill: DEFAULTS.treeColor });

    return g;
  }

  // Draw a small flower/plant dot
  function plant(svg, cx, cy) {
    const g = group(svg);
    circle(g, cx, cy, 3, { fill: '#5a9a50' });
    circle(g, cx, cy, 1.5, { fill: '#7ab870' });
    return g;
  }

  // Fill a corner area with grass + scattered bushes/trees
  // Avoids placing decorations too close to road edges (with margin)
  function fillArea(svg, x, y, w, h, opts = {}) {
    const margin = opts.margin || 15;
    const g = group(svg);

    // Grass base
    grass(g, x, y, w, h);

    // Seeded random for consistent placement
    const rng = seedRandom(x * 31 + y * 17 + w * 3);

    const innerX = x + margin;
    const innerY = y + margin;
    const innerW = w - margin * 2;
    const innerH = h - margin * 2;

    if (innerW <= 0 || innerH <= 0) return g;

    // Scatter bushes
    const bushCount = Math.floor((innerW * innerH) / 6000) + 2;
    for (let i = 0; i < bushCount; i++) {
      const bx = innerX + rng() * innerW;
      const by = innerY + rng() * innerH;
      const size = 6 + rng() * 8;
      bush(g, bx, by, size);
    }

    // Scatter trees (fewer than bushes)
    const treeCount = Math.floor((innerW * innerH) / 12000) + 1;
    for (let i = 0; i < treeCount; i++) {
      const tx = innerX + rng() * innerW;
      const ty = innerY + rng() * innerH;
      const size = 8 + rng() * 10;
      tree(g, tx, ty, size);
    }

    // Scatter small plants
    const plantCount = Math.floor((innerW * innerH) / 3000);
    for (let i = 0; i < plantCount; i++) {
      const px = innerX + rng() * innerW;
      const py = innerY + rng() * innerH;
      plant(g, px, py);
    }

    return g;
  }

  // Simple seeded pseudo-random number generator for consistent layouts
  function seedRandom(seed) {
    let s = seed || 1;
    return function () {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  return { DEFAULTS, grass, bush, tree, plant, fillArea };
})();
