// builder/io.js — Import/export JSON/PNG, JSON editor panel

(function () {
  'use strict';

  /** Strip internal underscore-prefixed keys for clean export. */
  function cleanConfig(obj) {
    if (Array.isArray(obj)) return obj.map(cleanConfig);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (!k.startsWith('_')) out[k] = cleanConfig(v);
      }
      return out;
    }
    return obj;
  }

  function exportJSON() {
    return JSON.stringify(cleanConfig(Builder.state.config), null, 2);
  }

  function doImportJSON() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const cfg = JSON.parse(r.result);
          Builder.pushUndo();
          Builder.state.config = cfg;
          Builder.state.selected = null;
          Builder.syncNextIds();
          Builder.rerender();
          Builder.setStatus('Imported: ' + (cfg.title || f.name));
        } catch (e) { alert('Invalid JSON: ' + e.message); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  function doExportJSON() {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = (Builder.state.config.title || 'diagram').replace(/\s+/g, '_') + '.json';
    a.href = url; a.click();
    URL.revokeObjectURL(url);
    Builder.setStatus('JSON exported');
  }

  function doExportPNG() {
    const svgEl = document.querySelector('#diagram-container svg');
    if (!svgEl) return;
    const data = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = parseInt(svgEl.getAttribute('width'));
      c.height = parseInt(svgEl.getAttribute('height'));
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = (Builder.state.config.title || 'diagram').replace(/\s+/g, '_') + '.png';
      a.href = c.toDataURL('image/png'); a.click();
      Builder.setStatus('PNG exported');
    };
    img.src = url;
  }

  function toggleJsonEditor() {
    const p = document.getElementById('json-panel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) {
      document.getElementById('json-editor').value = exportJSON();
    }
  }

  function applyJsonEditor() {
    try {
      const cfg = JSON.parse(document.getElementById('json-editor').value);
      Builder.pushUndo();
      Builder.state.config = cfg;
      Builder.state.selected = null;
      Builder.syncNextIds();
      Builder.rerender();
      Builder.setStatus('JSON applied');
    } catch (e) { alert('Invalid JSON: ' + e.message); }
  }

  // Expose
  Builder.exportJSON = exportJSON;
  Builder.doImportJSON = doImportJSON;
  Builder.doExportJSON = doExportJSON;
  Builder.doExportPNG = doExportPNG;
  Builder.toggleJsonEditor = toggleJsonEditor;
  Builder.applyJsonEditor = applyJsonEditor;
})();
