// builder/canvas.js — Canvas sizing, zoom, grid overlay

(function () {
  'use strict';

  const PX = RESOLUTION_SCALE;
  const BASE_W = Diagram.BASE_PANE_W;
  const BASE_H = Diagram.BASE_PANE_H;
  const DRAG_THROTTLE_MS = 33;

  /** Size the SVG to fit the wrapper, scale with UI zoom. */
  function fitCanvas() {
    const state = Builder.state;
    const wrapper = document.getElementById('canvas-wrapper');
    const svg = document.querySelector('#diagram-container svg');
    const ov = document.getElementById('overlay');
    if (!wrapper || !svg) return;

    // Use processed dimensions (from applyDefaults) when available,
    // falling back to deriving them the same way applyDefaults does.
    const proc = state.processed;
    const c = state.config.canvas || {};
    const pW = c.paneWidth || BASE_W;
    const pH = c.paneHeight || BASE_H;
    const cols = c.columns || 1;
    const rows = c.rows || 1;
    const natW = (proc && proc.canvas.width) || c.width || pW * cols;
    const natH = (proc && proc.canvas.height) || c.height || pH * rows;
    const wrapW = wrapper.clientWidth;
    const wrapH = wrapper.clientHeight;

    const fitScale = Math.min(wrapW / natW, wrapH / natH);
    const zoom = state.uiZoom || 1;
    const displayW = natW * fitScale * zoom;
    const displayH = natH * fitScale * zoom;

    svg.setAttribute('width', displayW);
    svg.setAttribute('height', displayH);
    if (ov) {
      ov.setAttribute('width', displayW);
      ov.setAttribute('height', displayH);
    }

    wrapper.style.overflow = (displayW > wrapW || displayH > wrapH) ? 'auto' : 'hidden';
  }

  function updateZoom(val) {
    const v = parseFloat(val);
    Builder.state.uiZoom = v;
    fitCanvas();
    document.getElementById('zoom-value').textContent = Math.round(v * 100) + '%';
  }

  /** Render diagram + overlay, refresh sidebars. */
  function rerender() {
    const state = Builder.state;
    const container = document.getElementById('diagram-container');
    container.innerHTML = '';
    try {
      state.processed = Diagram.applyDefaults(Builder.deepClone(state.config));
      Diagram.render(container, Builder.deepClone(state.config));
    } catch (e) {
      console.error('Render error:', e);
    }
    const svg = container.querySelector('svg');
    if (svg) {
      svg.style.pointerEvents = 'none';
      Builder.buildOverlay(svg);
    }
    fitCanvas();
    Builder.refreshElementList();
    Builder.refreshProps();
  }

  /** Lightweight re-render during drag (skip sidebar rebuilds). */
  function rerenderFast() {
    const state = Builder.state;
    const container = document.getElementById('diagram-container');
    container.innerHTML = '';
    try {
      state.processed = Diagram.applyDefaults(Builder.deepClone(state.config));
      Diagram.render(container, Builder.deepClone(state.config));
    } catch (e) { /* ignore during drag */ }
    const svg = container.querySelector('svg');
    if (svg) { svg.style.pointerEvents = 'none'; Builder.buildOverlay(svg); }
    fitCanvas();
  }

  /** Build grid lines on the overlay. */
  function drawGrid(ov, cW, cH) {
    const NS = 'http://www.w3.org/2000/svg';
    const portrait = cW < cH;
    const cellW = portrait ? BASE_H : BASE_W;
    const cellH = portrait ? BASE_W : BASE_H;
    const cols = Math.round(cW / cellW);
    const rows = Math.round(cH / cellH);
    const gridStyle = {
      stroke: 'rgba(255,255,255,0.4)',
      'stroke-width': 2 * PX,
      'stroke-dasharray': `${8 * PX},${4 * PX}`,
      fill: 'none',
    };

    const border = document.createElementNS(NS, 'rect');
    border.setAttribute('x', 0); border.setAttribute('y', 0);
    border.setAttribute('width', cW); border.setAttribute('height', cH);
    Object.entries(gridStyle).forEach(([k, v]) => border.setAttribute(k, v));
    border.style.pointerEvents = 'none';
    ov.appendChild(border);

    for (let c = 1; c < cols; c++) {
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', c * cellW); ln.setAttribute('y1', 0);
      ln.setAttribute('x2', c * cellW); ln.setAttribute('y2', cH);
      Object.entries(gridStyle).forEach(([k, v]) => ln.setAttribute(k, v));
      ln.style.pointerEvents = 'none';
      ov.appendChild(ln);
    }
    for (let r = 1; r < rows; r++) {
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('y1', r * cellH);
      ln.setAttribute('x2', cW); ln.setAttribute('y2', r * cellH);
      Object.entries(gridStyle).forEach(([k, v]) => ln.setAttribute(k, v));
      ln.style.pointerEvents = 'none';
      ov.appendChild(ln);
    }
  }

  // Expose
  Builder.BASE_W = BASE_W;
  Builder.BASE_H = BASE_H;
  Builder.DRAG_THROTTLE_MS = DRAG_THROTTLE_MS;
  Builder.fitCanvas = fitCanvas;
  Builder.updateZoom = updateZoom;
  Builder.rerender = rerender;
  Builder.rerenderFast = rerenderFast;
  Builder.drawGrid = drawGrid;
})();
