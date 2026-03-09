// intersections.js - Intersection types

const Intersections = (() => {
  const { rect, group } = DiagramCore;

  // Draw a 4-way intersection
  // halfW = half-width of the horizontal road (vertical extent)
  // halfH = half-width of the vertical road (horizontal extent)
  function fourWay(svg, cx, cy, halfW, halfH) {
    const g = group(svg);
    rect(g, cx - halfH, cy - halfW, halfH * 2, halfW * 2, {
      fill: Roads.DEFAULTS.roadColor,
    });
    return g;
  }

  // T-intersection
  function tJunction(svg, cx, cy, blockedSide, halfW, halfH) {
    const g = group(svg);
    rect(g, cx - halfH, cy - halfW, halfH * 2, halfW * 2, {
      fill: Roads.DEFAULTS.roadColor,
    });

    const curbColor = Roads.DEFAULTS.curbColor;
    const curbWidth = Roads.DEFAULTS.curbWidth;

    if (blockedSide === 'north') {
      DiagramCore.line(g, cx - halfH, cy - halfW, cx + halfH, cy - halfW, {
        stroke: curbColor, 'stroke-width': curbWidth,
      });
    }

    return g;
  }

  return { fourWay, tJunction };
})();
