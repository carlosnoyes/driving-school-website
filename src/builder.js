// builder.js — Init and event wiring
// Depends on: primitives.js, diagram.js, builder/*.js modules

(function () {
  'use strict';

  /* ── Toolbar ── */
  function updateToolbar() {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const active = document.querySelector('[data-mode="' + Builder.state.mode + '"]');
    if (active) active.classList.add('active');
    document.body.className = Builder.state.mode !== 'select' ? 'mode-' + Builder.state.mode : '';
  }
  Builder.updateToolbar = updateToolbar;

  /* ── Keyboard ── */
  function onKeyDown(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Delete' || e.key === 'Backspace') { Builder.deleteSelected(); e.preventDefault(); }
    else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { Builder.undo(); e.preventDefault(); }
    else if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
             (e.key === 'y' && (e.ctrlKey || e.metaKey))) { Builder.redo(); e.preventDefault(); }
    else if (e.key === 'Escape') { Builder.state.mode = 'select'; Builder.deselect(); updateToolbar(); }
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) Builder.nudge(e);
  }

  /* ── Init ── */
  function init() {
    const state = Builder.state;
    const setMode = m => () => {
      state.mode = state.mode === m ? 'select' : m;
      updateToolbar();
      if (state.mode !== 'select') Builder.setStatus('Click on canvas to place ' + m.replace('add', '').toLowerCase());
    };

    // Toolbar buttons
    document.getElementById('btn-select').onclick      = () => { state.mode = 'select'; updateToolbar(); };
    document.getElementById('btn-add-road').onclick     = setMode('addRoad');
    document.getElementById('btn-add-lot').onclick      = setMode('addLot');
    document.getElementById('btn-add-vehicle').onclick  = setMode('addVehicle');
    document.getElementById('btn-compass').onclick      = () => Builder.mutate(() => {
      state.config.compass = state.config.compass === false ? { size: 30 } : false;
    });
    document.getElementById('btn-grid').onclick         = () => { state.showGrid = !state.showGrid; Builder.rerender(); };
    document.getElementById('btn-undo').onclick         = Builder.undo;
    document.getElementById('btn-redo').onclick         = Builder.redo;
    document.getElementById('btn-import').onclick       = Builder.doImportJSON;
    document.getElementById('btn-export-json').onclick  = Builder.doExportJSON;
    document.getElementById('btn-export-png').onclick   = Builder.doExportPNG;
    document.getElementById('btn-json-editor').onclick  = Builder.toggleJsonEditor;
    document.getElementById('btn-apply-json').onclick   = Builder.applyJsonEditor;
    document.getElementById('btn-close-json').onclick   = () => document.getElementById('json-panel').classList.add('hidden');

    // Zoom slider
    const zs = document.getElementById('zoom-slider');
    zs.oninput = () => Builder.updateZoom(zs.value);

    // Overlay events
    const ov = document.getElementById('overlay');
    ov.addEventListener('click', Builder.onOverlayClick);
    ov.addEventListener('mousedown', Builder.onDragMouseDown);
    document.addEventListener('mousemove', Builder.onDragMouseMove);
    document.addEventListener('mouseup', Builder.onDragMouseUp);

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    // Ctrl+scroll zoom
    document.getElementById('canvas-wrapper').addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const nz = Math.max(0.25, Math.min(4, (state.uiZoom || 1) + delta));
      zs.value = nz;
      Builder.updateZoom(nz);
    }, { passive: false });

    // Initial render
    Builder.rerender();
    Builder.setStatus('Ready — click "+ Road" or "+ Lot" to start building');
  }

  window.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', Builder.fitCanvas);
})();
