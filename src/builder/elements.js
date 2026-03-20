// builder/elements.js — Left sidebar element list, selection, deletion

(function () {
  'use strict';

  function selectElement(type, index) {
    Builder.state.selected = { type, index };
    Builder.rerender();
  }

  function deselect() {
    Builder.state.selected = null;
    Builder.rerender();
  }

  function deleteSelected() {
    const state = Builder.state;
    if (!state.selected) return;
    const { type, index } = state.selected;
    Builder.mutate(() => {
      const cfg = state.config;
      if (type === 'road') {
        const id = cfg.roads[index]?.id;
        cfg.roads.splice(index, 1);
        cfg.intersections = cfg.intersections.filter(ix => !ix.roads || !ix.roads.includes(id));
        cfg.entrances = cfg.entrances.filter(e => e.road !== id);
        cfg.vehicles = cfg.vehicles.filter(v => v.road !== id);
      } else if (type === 'lot') {
        cfg.parkingLots.splice(index, 1);
      } else if (type === 'intersection') {
        cfg.intersections.splice(index, 1);
      } else if (type === 'vehicle') {
        cfg.vehicles.splice(index, 1);
      }
    });
    state.selected = null;
    Builder.rerender();
  }

  function refreshElementList() {
    const state = Builder.state;
    const list = document.getElementById('element-list');
    list.innerHTML = '';

    function item(label, type, index) {
      const d = document.createElement('div');
      d.className = 'el-item' + (state.selected?.type === type && state.selected?.index === index ? ' selected' : '');
      d.textContent = label;
      d.onclick = () => selectElement(type, index);
      return d;
    }

    function header(text) {
      const h = document.createElement('div');
      h.className = 'el-header'; h.textContent = text;
      list.appendChild(h);
    }

    // Canvas item always at top
    const canvasItem = document.createElement('div');
    canvasItem.className = 'el-item' + (state.selected?.type === 'canvas' ? ' selected' : '');
    canvasItem.textContent = 'Canvas';
    canvasItem.onclick = () => selectElement('canvas', undefined);
    list.appendChild(canvasItem);

    if (state.config.roads.length) {
      header('Roads');
      state.config.roads.forEach((r, i) => list.appendChild(item('Road ' + (i + 1) + ' (' + r.orientation + ')', 'road', i)));
    }
    if (state.config.parkingLots.length) {
      header('Parking Lots');
      state.config.parkingLots.forEach((l, i) => list.appendChild(item('Lot ' + (i + 1), 'lot', i)));
    }
    if (state.config.intersections.length) {
      header('Intersections');
      const ixLabels = { fourWay: '4-Way', tJunction: '3-Way', turn: 'Turn' };
      state.config.intersections.forEach((ix, i) => list.appendChild(item(
        'Intersection ' + (i + 1) + ' (' + (ixLabels[ix.type] || '4-Way') + ')', 'intersection', i)));
    }
    if (state.config.vehicles.length) {
      header('Vehicles');
      state.config.vehicles.forEach((v, i) => list.appendChild(item(
        'Vehicle ' + (i + 1) + ' (' + (v.color || 'gray') + ')', 'vehicle', i)));
    }
  }

  // Expose
  Builder.selectElement = selectElement;
  Builder.deselect = deselect;
  Builder.deleteSelected = deleteSelected;
  Builder.refreshElementList = refreshElementList;
})();
