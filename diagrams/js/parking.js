// parking.js - Parking lot drawing: stalls, rows, aisles, lot outlines

const Parking = (() => {
  const { rect, line, group } = DiagramCore;

  const DEFAULTS = {
    stallWidth: 40,
    stallDepth: 70,
    aisleWidth: 80,
    lineColor: '#ffffff',
    lineWidth: 1.5,
    surfaceColor: '#555555',
    borderColor: '#cccccc',
    borderWidth: 2,
  };

  // Draw a single parking stall outline (3 sides of a rectangle — open on the aisle side)
  // direction: 'up' or 'down' — which way cars pull in
  function stall(svg, x, y, opts = {}) {
    const w = opts.stallWidth || DEFAULTS.stallWidth;
    const d = opts.stallDepth || DEFAULTS.stallDepth;
    const dir = opts.direction || 'up';
    const color = opts.lineColor || DEFAULTS.lineColor;
    const lw = opts.lineWidth || DEFAULTS.lineWidth;
    const g = group(svg);

    if (dir === 'up') {
      // Open at bottom (aisle below)
      // Left side
      line(g, x, y, x, y + d, { stroke: color, 'stroke-width': lw });
      // Right side
      line(g, x + w, y, x + w, y + d, { stroke: color, 'stroke-width': lw });
      // Back wall (top)
      line(g, x, y, x + w, y, { stroke: color, 'stroke-width': lw });
    } else {
      // Open at top (aisle above)
      // Left side
      line(g, x, y, x, y + d, { stroke: color, 'stroke-width': lw });
      // Right side
      line(g, x + w, y, x + w, y + d, { stroke: color, 'stroke-width': lw });
      // Back wall (bottom)
      line(g, x, y + d, x + w, y + d, { stroke: color, 'stroke-width': lw });
    }

    return g;
  }

  // Draw a row of parking stalls
  // x, y: top-left of the row
  // count: number of stalls
  // direction: 'up' or 'down'
  function stallRow(svg, x, y, count, opts = {}) {
    const w = opts.stallWidth || DEFAULTS.stallWidth;
    const g = group(svg);

    for (let i = 0; i < count; i++) {
      stall(g, x + i * w, y, opts);
    }

    return g;
  }

  // Draw a double row (back-to-back stalls with a shared back wall)
  // x, y: top-left corner
  // count: stalls per side
  function doubleRow(svg, x, y, count, opts = {}) {
    const d = opts.stallDepth || DEFAULTS.stallDepth;
    const g = group(svg);

    // Top row faces down (open at top, cars pull in from above aisle)
    stallRow(g, x, y, count, { ...opts, direction: 'down' });
    // Bottom row faces up (open at bottom, cars pull in from below aisle)
    stallRow(g, x, y + d, count, { ...opts, direction: 'up' });

    return g;
  }

  // Draw the full parking lot surface (asphalt rectangle)
  function surface(svg, x, y, w, h, opts = {}) {
    const g = group(svg);
    rect(g, x, y, w, h, {
      fill: opts.surfaceColor || DEFAULTS.surfaceColor,
    });
    // Border
    rect(g, x, y, w, h, {
      fill: 'none',
      stroke: opts.borderColor || DEFAULTS.borderColor,
      'stroke-width': opts.borderWidth || DEFAULTS.borderWidth,
    });
    return g;
  }

  // Draw a driving aisle (just a label-able area, the surface is already drawn)
  // This draws directional arrows in the aisle
  function aisleArrows(svg, x, y, w, h, direction, opts = {}) {
    const g = group(svg);
    const color = opts.arrowColor || '#999999';
    const arrowCount = Math.floor(w / 120);
    const spacing = w / (arrowCount + 1);
    const midY = y + h / 2;

    for (let i = 1; i <= arrowCount; i++) {
      const ax = x + i * spacing;
      if (direction === 'right' || direction === 'left') {
        const sign = direction === 'right' ? 1 : -1;
        // Arrow shaft
        line(g, ax - sign * 15, midY, ax + sign * 15, midY, {
          stroke: color, 'stroke-width': 2,
        });
        // Arrow head
        line(g, ax + sign * 15, midY, ax + sign * 5, midY - 6, {
          stroke: color, 'stroke-width': 2,
        });
        line(g, ax + sign * 15, midY, ax + sign * 5, midY + 6, {
          stroke: color, 'stroke-width': 2,
        });
      }
    }

    return g;
  }

  return { DEFAULTS, stall, stallRow, doubleRow, surface, aisleArrows };
})();
