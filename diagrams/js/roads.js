// roads.js - Road drawing: lanes, markings, curbs

const Roads = (() => {
  const { line, rect, path, group } = DiagramCore;

  const DEFAULTS = {
    laneWidth: 50,
    lineColor: '#fff',
    curbColor: '#fff',
    curbWidth: 2,
    dashLength: 20,
    dashGap: 15,
    centerLineColor: '#ddcc00',
    centerLineWidth: 2,
    laneLineColor: '#ffffff',
    laneLineWidth: 1.5,
    roadColor: '#333333',
  };

  // Draw dashed line between two points
  function dashedLine(svg, x1, y1, x2, y2, opts = {}) {
    const color = opts.color || DEFAULTS.laneLineColor;
    const width = opts.width || DEFAULTS.laneLineWidth;
    const dashLen = opts.dashLength || DEFAULTS.dashLength;
    const dashGap = opts.dashGap || DEFAULTS.dashGap;
    return line(svg, x1, y1, x2, y2, {
      stroke: color,
      'stroke-width': width,
      'stroke-dasharray': `${dashLen},${dashGap}`,
      fill: 'none',
    });
  }

  // Draw solid line between two points
  function solidLine(svg, x1, y1, x2, y2, opts = {}) {
    const color = opts.color || DEFAULTS.centerLineColor;
    const width = opts.width || DEFAULTS.centerLineWidth;
    return line(svg, x1, y1, x2, y2, {
      stroke: color,
      'stroke-width': width,
      fill: 'none',
    });
  }

  // Draw a vertical road segment
  // x: center x of the road
  // y1, y2: start and end y
  // lanesPerDirection: number of lanes in each direction
  function verticalRoad(svg, x, y1, y2, opts = {}) {
    const laneWidth = opts.laneWidth || DEFAULTS.laneWidth;
    const lanesPerDir = opts.lanesPerDirection || 2;
    const totalWidth = laneWidth * lanesPerDir * 2;
    const leftEdge = x - totalWidth / 2;
    const rightEdge = x + totalWidth / 2;
    const g = group(svg);

    // Road surface
    rect(g, leftEdge, Math.min(y1, y2), totalWidth, Math.abs(y2 - y1), {
      fill: opts.roadColor || DEFAULTS.roadColor,
    });

    // Curbs (left and right edges)
    solidLine(g, leftEdge, y1, leftEdge, y2, {
      color: DEFAULTS.curbColor,
      width: DEFAULTS.curbWidth,
    });
    solidLine(g, rightEdge, y1, rightEdge, y2, {
      color: DEFAULTS.curbColor,
      width: DEFAULTS.curbWidth,
    });

    // Center line (double line)
    const gap = 3;
    solidLine(g, x - gap, y1, x - gap, y2, {
      color: DEFAULTS.centerLineColor,
      width: DEFAULTS.centerLineWidth,
    });
    solidLine(g, x + gap, y1, x + gap, y2, {
      color: DEFAULTS.centerLineColor,
      width: DEFAULTS.centerLineWidth,
    });

    // Lane dividers
    for (let i = 1; i < lanesPerDir; i++) {
      // Left side lanes
      const lx = leftEdge + i * laneWidth;
      dashedLine(g, lx, y1, lx, y2);
      // Right side lanes
      const rx = x + gap + i * laneWidth;
      dashedLine(g, rx, y1, rx, y2);
    }

    return g;
  }

  // Draw a horizontal road segment
  function horizontalRoad(svg, y, x1, x2, opts = {}) {
    const laneWidth = opts.laneWidth || DEFAULTS.laneWidth;
    const lanesPerDir = opts.lanesPerDirection || 2;
    const totalWidth = laneWidth * lanesPerDir * 2;
    const topEdge = y - totalWidth / 2;
    const bottomEdge = y + totalWidth / 2;
    const g = group(svg);

    // Road surface
    rect(g, Math.min(x1, x2), topEdge, Math.abs(x2 - x1), totalWidth, {
      fill: opts.roadColor || DEFAULTS.roadColor,
    });

    // Curbs (top and bottom)
    solidLine(g, x1, topEdge, x2, topEdge, {
      color: DEFAULTS.curbColor,
      width: DEFAULTS.curbWidth,
    });
    solidLine(g, x1, bottomEdge, x2, bottomEdge, {
      color: DEFAULTS.curbColor,
      width: DEFAULTS.curbWidth,
    });

    // Center line (double)
    const gap = 3;
    solidLine(g, x1, y - gap, x2, y - gap, {
      color: DEFAULTS.centerLineColor,
      width: DEFAULTS.centerLineWidth,
    });
    solidLine(g, x1, y + gap, x2, y + gap, {
      color: DEFAULTS.centerLineColor,
      width: DEFAULTS.centerLineWidth,
    });

    // Lane dividers
    for (let i = 1; i < lanesPerDir; i++) {
      const ty = topEdge + i * laneWidth;
      dashedLine(g, x1, ty, x2, ty);
      const by = y + gap + i * laneWidth;
      dashedLine(g, x1, by, x2, by);
    }

    return g;
  }

  return { DEFAULTS, dashedLine, solidLine, verticalRoad, horizontalRoad };
})();
