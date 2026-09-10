import { AppState } from './src/state.js';
import { loadData } from './src/data.js';
import { initFilters, applyFilters } from './src/filters.js';
import { initScatter, drawScatter } from './src/scatter.js';
import { initSankey, drawSankey } from './src/sankey.js';
import { initTimeline, drawTimelineBars, resetTimeline } from './src/timeline.js';
import { initHeatmap, drawHeatmap } from './src/heatmap.js';
import { initSourceSwarm, drawSourceSwarm } from './src/sourceSwarm.js';
import { drawCards } from './src/cards.js';
import { initDetail } from './src/detail.js';

function onBrushChange() {
  drawSankey();
  drawHeatmap();
  drawSourceSwarm();
  drawCards();
}

function onFiltersChanged(resetBrush) {
  applyFilters();
  drawScatter(resetBrush);
  drawTimelineBars();
}

function onReset() {
  resetTimeline();
  onFiltersChanged(true);
}

function main() {
  loadData();

  initScatter(onBrushChange);
  initSankey();
  initHeatmap();
  initSourceSwarm();
  initTimeline(onFiltersChanged);
  initFilters(onFiltersChanged, onReset);
  initDetail();

  onFiltersChanged(true);
}

try {
  main();
} catch (err) {
  console.error(err);
  document.querySelector('.wrap').insertAdjacentHTML(
    'afterbegin',
    '<div style="background:#3a1f1f;border:1px solid #ff6b6b;color:#ffb4b4;padding:12px 16px;' +
      'border-radius:8px;margin-bottom:16px;font-size:13px;">' +
      'Something went wrong loading the app — check the browser console for details.</div>'
  );
}
