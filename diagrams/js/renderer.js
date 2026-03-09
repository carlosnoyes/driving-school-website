// renderer.js - Reusable diagram renderer
// Takes a CONFIG and CARS array, draws the full scene.

const Renderer = (() => {

  // Render a full intersection diagram
  // container: DOM element to draw into
  // config: layout settings
  // cars: array of car placement objects
  function render(container, config, cars) {
    container.innerHTML = '';

    const W = config.canvasWidth;
    const H = config.canvasHeight;
    const cx = W / 2 + (config.centerX || 0);
    const cy = H / 2 + (config.centerY || 0);
    const lw = config.laneWidth;
    const vlw = config.verticalLaneWidth || lw;
    const hlw = config.horizontalLaneWidth || lw;
    const vLanes = config.verticalLanesPerDirection || 2;
    const hLanes = config.horizontalLanesPerDirection || 2;
    const halfV = vlw * vLanes;   // half-width of vertical road
    const halfH = hlw * hLanes;   // half-width of horizontal road

    const svg = DiagramCore.createSVG(container, W, H);

    const vOpts = { laneWidth: vlw, lanesPerDirection: vLanes };
    const hOpts = { laneWidth: hlw, lanesPerDirection: hLanes };

    // Terrain (four corner areas) — drawn first so roads layer on top
    Terrain.fillArea(svg, 0, 0, cx - halfV, cy - halfH);
    Terrain.fillArea(svg, cx + halfV, 0, W - (cx + halfV), cy - halfH);
    Terrain.fillArea(svg, 0, cy + halfH, cx - halfV, H - (cy + halfH));
    Terrain.fillArea(svg, cx + halfV, cy + halfH, W - (cx + halfV), H - (cy + halfH));

    // Vertical road (north-south)
    Roads.verticalRoad(svg, cx, 0, cy - halfH, vOpts);
    Roads.verticalRoad(svg, cx, cy + halfH, H, vOpts);

    // Horizontal road (east-west)
    Roads.horizontalRoad(svg, cy, 0, cx - halfV, hOpts);
    Roads.horizontalRoad(svg, cy, cx + halfV, W, hOpts);

    // Intersection
    if (config.intersectionType === 'fourWay') {
      Intersections.fourWay(svg, cx, cy, halfH, halfV);
    } else if (config.intersectionType && config.intersectionType.startsWith('t')) {
      const blocked = config.intersectionType.replace('t', '').toLowerCase();
      Intersections.tJunction(svg, cx, cy, blocked, halfH, halfV);
    }

    // Cars — convert t (0=diagram edge, 1=intersection edge) to pixel position
    (cars || []).forEach(c => {
      let pos;
      if (c.road === 'vertical') {
        const armLen = (c.arm === 'north') ? (cy - halfH) : (H - (cy + halfH));
        const offset = armLen * (1 - c.t);
        pos = (c.arm === 'north') ? (cy - halfH - offset) : (cy + halfH + offset);
        Vehicles.carInLane(svg, cx, c.lane, c.side === 'right', pos, 'vertical', vOpts);
      } else {
        const armLen = (c.arm === 'west') ? (cx - halfV) : (W - (cx + halfV));
        const offset = armLen * (1 - c.t);
        pos = (c.arm === 'west') ? (cx - halfV - offset) : (cx + halfV + offset);
        Vehicles.carInLane(svg, cy, c.lane, c.side === 'right', pos, 'horizontal', hOpts);
      }
    });

    // Signals
    if (config.signals) {
      config.signals.forEach(s => {
        if (s.type === 'trafficLight') {
          const offset = (s.side === 'west' || s.side === 'east') ? halfV + 30 : halfH + 30;
          let tlX = cx, tlY = cy, dir = 'east';
          if (s.side === 'west')  { tlX = cx - offset; dir = 'east'; }
          if (s.side === 'east')  { tlX = cx + offset; dir = 'west'; }
          if (s.side === 'north') { tlY = cy - offset; dir = 'south'; }
          if (s.side === 'south') { tlY = cy + offset; dir = 'north'; }
          Signals.trafficLight(svg, tlX, tlY, { direction: dir, activeLight: s.activeLight || 'red' });
        } else if (s.type === 'stopSign') {
          Signals.stopSign(svg, s.x || cx, s.y || cy, { scale: s.scale || 1 });
        }
      });
    }

    return svg;
  }

  // Export the SVG inside a container as a PNG file
  function exportPNG(container, filename) {
    const svg = container.querySelector('svg');
    if (!svg) return;

    const w = parseInt(svg.getAttribute('width'));
    const h = parseInt(svg.getAttribute('height'));
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      const a = document.createElement('a');
      a.download = filename || 'diagram.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }

  // Add an export button above the diagram container
  function addExportButton(container, filename) {
    const btn = document.createElement('button');
    btn.textContent = 'Export PNG';
    btn.style.cssText = 'position:fixed;top:16px;right:16px;padding:8px 18px;font-size:14px;' +
      'background:#fff;border:1px solid #888;border-radius:4px;cursor:pointer;z-index:100;';
    btn.addEventListener('click', () => exportPNG(container, filename));
    document.body.appendChild(btn);
  }

  return { render, exportPNG, addExportButton };
})();
