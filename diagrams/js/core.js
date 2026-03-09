// core.js - SVG helper utilities for driving diagrams

const DiagramCore = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createSVG(container, width, height) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.backgroundColor = '#4a8c3f';
    container.appendChild(svg);
    return svg;
  }

  function el(tag, attrs = {}) {
    const elem = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      elem.setAttribute(k, v);
    }
    return elem;
  }

  function line(svg, x1, y1, x2, y2, attrs = {}) {
    const l = el('line', { x1, y1, x2, y2, ...attrs });
    svg.appendChild(l);
    return l;
  }

  function rect(svg, x, y, w, h, attrs = {}) {
    const r = el('rect', { x, y, width: w, height: h, ...attrs });
    svg.appendChild(r);
    return r;
  }

  function circle(svg, cx, cy, r, attrs = {}) {
    const c = el('circle', { cx, cy, r, ...attrs });
    svg.appendChild(c);
    return c;
  }

  function path(svg, d, attrs = {}) {
    const p = el('path', { d, ...attrs });
    svg.appendChild(p);
    return p;
  }

  function group(svg, attrs = {}) {
    const g = el('g', attrs);
    svg.appendChild(g);
    return g;
  }

  function text(svg, x, y, content, attrs = {}) {
    const t = el('text', { x, y, ...attrs });
    t.textContent = content;
    svg.appendChild(t);
    return t;
  }

  return { SVG_NS, createSVG, el, line, rect, circle, path, group, text };
})();
