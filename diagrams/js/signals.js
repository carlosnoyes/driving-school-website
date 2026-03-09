// signals.js - Traffic lights, stop signs, arrows

const Signals = (() => {
  const { rect, circle, group, path, text } = DiagramCore;

  // Draw a traffic light
  // direction: which way it faces ('north','south','east','west')
  // activeLight: 'red' | 'yellow' | 'green'
  function trafficLight(svg, x, y, opts = {}) {
    const direction = opts.direction || 'east';
    const activeLight = opts.activeLight || 'red';
    const scale = opts.scale || 1;
    const g = group(svg);

    const w = 16 * scale;
    const h = 42 * scale;
    const lightR = 5 * scale;
    const padding = 3 * scale;

    // Rotate based on direction
    let rotation = 0;
    if (direction === 'south') rotation = 90;
    else if (direction === 'west') rotation = 180;
    else if (direction === 'north') rotation = 270;

    g.setAttribute('transform', `rotate(${rotation}, ${x}, ${y})`);

    // Housing
    rect(g, x - w / 2, y - h / 2, w, h, {
      fill: '#333',
      stroke: '#222',
      'stroke-width': 1,
      rx: 3,
      ry: 3,
    });

    // Lights
    const lights = ['red', 'yellow', 'green'];
    const offColors = { red: '#661111', yellow: '#665511', green: '#116611' };
    const onColors = { red: '#ff2222', yellow: '#ffcc00', green: '#22ff44' };

    lights.forEach((color, i) => {
      const ly = y - h / 2 + padding + lightR + i * (lightR * 2 + padding);
      circle(g, x, ly, lightR, {
        fill: color === activeLight ? onColors[color] : offColors[color],
        stroke: '#111',
        'stroke-width': 0.5,
      });
    });

    // Pole
    rect(g, x - 2 * scale, y + h / 2, 4 * scale, 15 * scale, {
      fill: '#555',
      stroke: '#333',
      'stroke-width': 0.5,
    });

    return g;
  }

  // Draw a stop sign
  function stopSign(svg, x, y, opts = {}) {
    const scale = opts.scale || 1;
    const size = 14 * scale;
    const g = group(svg);

    // Octagon
    const points = [];
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 8) + (i * Math.PI / 4);
      points.push(`${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`);
    }

    const octagon = DiagramCore.el('polygon', {
      points: points.join(' '),
      fill: '#cc0000',
      stroke: '#880000',
      'stroke-width': 1,
    });
    g.appendChild(octagon);

    text(g, x, y + 3 * scale, 'STOP', {
      fill: 'white',
      'font-size': 7 * scale,
      'font-weight': 'bold',
      'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif',
    });

    return g;
  }

  // Draw a directional arrow on the road
  function laneArrow(svg, x, y, direction, opts = {}) {
    const scale = opts.scale || 1;
    const color = opts.color || '#fff';
    const g = group(svg);

    let rotation = 0;
    if (direction === 'east') rotation = 90;
    else if (direction === 'south') rotation = 180;
    else if (direction === 'west') rotation = 270;

    g.setAttribute('transform', `rotate(${rotation}, ${x}, ${y})`);

    // Arrow shape pointing north (up)
    const s = 8 * scale;
    path(g, `M ${x} ${y - s}
             L ${x + s * 0.6} ${y}
             L ${x + s * 0.2} ${y}
             L ${x + s * 0.2} ${y + s}
             L ${x - s * 0.2} ${y + s}
             L ${x - s * 0.2} ${y}
             L ${x - s * 0.6} ${y} Z`, {
      fill: color,
      stroke: 'none',
      opacity: 0.8,
    });

    return g;
  }

  return { trafficLight, stopSign, laneArrow };
})();
