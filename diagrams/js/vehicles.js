// vehicles.js - Car and vehicle shapes

const Vehicles = (() => {
  const { rect, group } = DiagramCore;

  const COLORS = {
    default: '#cccccc',
    gray: '#cccccc',
    red: '#cc4444',
    blue: '#4466cc',
    green: '#44aa66',
    white: '#eeeeee',
    black: '#333333',
    yellow: '#d4a843',
  };

  // Draw a car as a simple rectangle with rounded corners
  function car(svg, cx, cy, opts = {}) {
    const color = COLORS[opts.color] || opts.color || COLORS.default;
    const direction = opts.direction || 'north';
    const carWidth = opts.width || 24;
    const carHeight = opts.height || 40;
    const g = group(svg);

    let w, h;
    if (direction === 'north' || direction === 'south') {
      w = carWidth;
      h = carHeight;
    } else {
      w = carHeight;
      h = carWidth;
    }

    rect(g, cx - w / 2, cy - h / 2, w, h, {
      fill: color,
      stroke: '#555',
      'stroke-width': 1.5,
      rx: 5,
      ry: 5,
    });

    return g;
  }

  // Place a car in a specific lane
  function carInLane(svg, roadCenter, laneIndex, isRightSide, position, orientation, opts = {}) {
    const laneWidth = opts.laneWidth || Roads.DEFAULTS.laneWidth;
    const lanesPerDir = opts.lanesPerDirection || 2;
    const centerGap = 3;

    let cx, cy, direction;

    if (orientation === 'vertical') {
      if (isRightSide) {
        cx = roadCenter + centerGap + laneIndex * laneWidth + laneWidth / 2;
        direction = 'south';
      } else {
        cx = roadCenter - centerGap - laneIndex * laneWidth - laneWidth / 2;
        direction = 'north';
      }
      cy = position;
    } else {
      if (isRightSide) {
        cy = roadCenter + centerGap + laneIndex * laneWidth + laneWidth / 2;
        direction = 'east';
      } else {
        cy = roadCenter - centerGap - laneIndex * laneWidth - laneWidth / 2;
        direction = 'west';
      }
      cx = position;
    }

    return car(svg, cx, cy, { ...opts, direction });
  }

  return { COLORS, car, carInLane };
})();
