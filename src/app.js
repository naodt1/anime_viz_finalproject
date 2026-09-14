import { State, isGem, filteredTitles, selectionScopedTitles, setState, setFilter, onRender } from './state.js';
import { loadData } from './data.js';
import { initScatter, drawScatter, scatterPlottedCount } from './scatter.js';
import { initHeatmap, drawHeatmap } from './heatmap.js';
import { initSankey, drawSankey, sankeyGemCount } from './sankey.js';
import { escapeHtml } from './tip.js';
import { fmtN, ord, metaLine } from './format.js';

const $ = (id) => document.getElementById(id);

// ---------- rail: chip option lists ----------

function genreOptions() {
  const c = {};
  for (const t of State.titles) for (const g of t.genres) c[g] = (c[g] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 20).map((name) => ({ name, count: c[name] }));
}

function formatOptions() {
  return [...new Set(State.titles.map((t) => t.format))].filter((f) => f !== 'Other').slice(0, 8);
}

function renderChips(container, options, activeList, onToggle) {
  container.textContent = '';
  options.forEach((opt) => {
    const name = typeof opt === 'string' ? opt : opt.name;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (activeList.indexOf(name) >= 0 ? ' active' : '');
    btn.textContent = name;
    if (opt.count != null) btn.title = `${opt.count.toLocaleString()} titles`;
    btn.addEventListener('click', () => onToggle(name));
    container.appendChild(btn);
  });
}

function toggle(list, name) {
  return list.indexOf(name) >= 0 ? list.filter((x) => x !== name) : list.concat([name]);
}

// ---------- ranked list ----------

function rankedRows() {
  const sel = State.genres;
  // A box-select on the scatter overrides the default "clears the bar"
  // candidate pool with exactly what was dragged over, gems or not — the
  // point of selecting a region is to compare what's actually in it.
  const pool = State.brushIds.length
    ? selectionScopedTitles()
    : filteredTitles().filter((t) => t.gem > 0 && t.sp >= 60);
  const scored = pool
    .map((t) => {
      const match = sel.length ? t.genres.filter((g) => sel.indexOf(g) >= 0).length / sel.length : null;
      const rank = t.gem * (match === null ? 1 : 0.45 + 0.55 * Math.min(1, match));
      return { t, match, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 12);
  return scored;
}

function renderRankList() {
  const rows = rankedRows();
  const host = $('rank-list');
  const empty = $('rank-empty');
  host.textContent = '';
  empty.hidden = rows.length > 0;

  const hasCovers = rows.some((r) => r.t.image);
  const cols = hasCovers ? '38px 26px minmax(0, 1fr) 58px' : '26px minmax(0, 1fr) 58px';

  rows.forEach((r, i) => {
    const t = r.t;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rank-row' + (State.selId === t.id ? ' selected' : '');
    btn.style.gridTemplateColumns = cols;
    const meta = metaLine(t) + (r.match !== null ? ` · ${Math.round(r.match * 100)}% taste match` : '');
    const barW = Math.max(3, Math.min(100, t.gem)).toFixed(0);
    btn.innerHTML =
      (hasCovers
        ? `<img class="rank-cover" src="${escapeHtml(t.image || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : '')
      + `<div class="rank-num">${String(i + 1).padStart(2, '0')}</div>`
      + `<div class="rank-main">`
      + `<div class="rank-title">${escapeHtml(t.title)}</div>`
      + `<div class="rank-meta">${escapeHtml(meta)}</div>`
      + `<div class="rank-track"><div class="rank-fill" style="width:${barW}%"></div></div>`
      + `</div>`
      + `<div><div class="rank-index">${t.gem > 0 ? '+' : ''}${t.gem}</div><div class="rank-index-cap">index</div></div>`;
    btn.addEventListener('click', () => setState({ selId: t.id }));
    host.appendChild(btn);
  });
}

// ---------- detail drawer ----------

function renderDrawer() {
  const root = $('drawer-root');
  const t = State.selId && State.titles.find((x) => x.id === State.selId);
  if (!t) { root.textContent = ''; return; }

  const sel = State.genres;
  const match = sel.length
    ? Math.round((t.genres.filter((g) => sel.indexOf(g) >= 0).length / sel.length) * 100) + '%'
    : '—';
  const badge = isGem(t) ? 'Hidden gem' : t.gem > 0 ? 'Slightly under-watched' : 'Widely seen';
  const meta = [
    t.format !== 'Other' ? t.format : null,
    t.year || 'year unknown',
    t.episodes ? `${t.episodes} eps` : null,
    t.studio,
  ].filter(Boolean).join(' · ');

  const stats = [
    { v: t.score.toFixed(2), l: 'Score' },
    { v: fmtN(t.members), l: 'Votes' },
    { v: ord(t.sp), l: 'Score percentile' },
    { v: ord(t.mp), l: 'Audience percentile' },
    { v: `${t.gem > 0 ? '+' : ''}${t.gem}`, l: 'Gem index', accent: t.gem > 0 },
    { v: match, l: 'Taste match' },
  ];
  const genreTags = (t.genres.length ? t.genres : ['No genre data in this file'])
    .map((g) => `<div class="tag tag-outline">${escapeHtml(g)}</div>`).join('');
  const statCells = stats.map((s) => (
    `<div><div class="drawer-stat-val" ${s.accent ? 'style="color:var(--color-accent-700)"' : ''}>${escapeHtml(s.v)}</div>`
    + `<div class="drawer-stat-label">${s.l}</div></div>`
  )).join('');

  root.innerHTML =
    `<div class="drawer">`
    + `<div class="drawer-head"><div class="drawer-badge">${badge}</div>`
    + `<button class="btn btn-ghost" type="button" id="drawer-close">Close</button></div>`
    + (t.image
      ? `<img class="drawer-cover" src="${escapeHtml(t.image)}" alt="Cover art for ${escapeHtml(t.title)}" loading="lazy" onerror="this.style.visibility='hidden'">`
      : '')
    + `<h3>${escapeHtml(t.title)}</h3>`
    + `<div class="drawer-meta">${escapeHtml(meta)}</div>`
    + `<div class="drawer-genres">${genreTags}</div>`
    + `<hr class="hr">`
    + `<div class="drawer-stats">${statCells}</div>`
    + `<hr class="hr">`
    + `<p class="drawer-reading">Rated better than ${Math.round(t.sp)}% of the dataset while reaching a smaller audience than ${Math.round(100 - t.mp)}% of it.</p>`
    + (t.synopsis ? `<p class="drawer-synopsis" style="margin-top:var(--space-4)">${escapeHtml(t.synopsis)}</p>` : '')
    + `</div>`;
  $('drawer-close').addEventListener('click', () => setState({ selId: null }));
}

// ---------- main render ----------

function render() {
  const s = State;

  $('dataset-name').textContent = s.source;
  const err = $('errbar');
  err.hidden = !s.error;
  err.textContent = s.error || '';

  if (!s.titles.length) return;

  renderChips($('genre-chips'), genreOptions(), s.genres, (n) => setFilter({ genres: toggle(s.genres, n) }));
  renderChips($('format-chips'), formatOptions(), s.formats, (n) => setFilter({ formats: toggle(s.formats, n) }));

  const yf = $('year-from');
  const yt = $('year-to');
  yf.min = yt.min = s.yearFloor;
  yf.max = yt.max = s.yearCeil;
  yf.value = s.yearFrom;
  yt.value = s.yearTo;
  $('era-label').textContent = `${s.yearFrom}–${s.yearTo}`;

  const ms = $('min-score');
  ms.max = s.scoreMax;
  ms.step = s.scoreMax > 5 ? 0.1 : 0.05;
  ms.value = s.minScore;
  $('minscore-label').textContent = s.minScore > 0 ? s.minScore.toFixed(1) + '+' : 'any';

  const mm = $('max-members');
  mm.min = Math.log10(Math.max(10, s.memMin)).toFixed(2);
  mm.max = (Math.log10(s.memMax) + 0.05).toFixed(2);
  mm.value = s.maxMembersLog;
  $('maxmembers-label').textContent = '≤ ' + fmtN(Math.round(Math.pow(10, s.maxMembersLog)));

  const rows = filteredTitles();
  const gemN = rows.filter(isGem).length;
  $('count-shown').textContent = rows.length.toLocaleString();
  $('count-gems').textContent = gemN.toLocaleString();

  drawScatter();
  drawHeatmap();
  drawSankey();

  const plotted = scatterPlottedCount();
  $('scatter-status').textContent = s.brushIds.length
    ? `${s.brushIds.length.toLocaleString()} selected — Esc to clear`
    : plotted && plotted < rows.length
      ? `showing ${plotted.toLocaleString()} of ${rows.length.toLocaleString()} marks`
      : `${rows.length.toLocaleString()} titles plotted`;

  $('heat-note').textContent = 'Share of titles in each genre and era that land in the gem zone. Shade compares eras to themselves, not to each other — click a cell to filter everything to that genre and decade.';

  $('rank-note').textContent = s.brushIds.length
    ? `Showing your ${s.brushIds.length.toLocaleString()} selected titles, ranked by gem index.`
    : s.genres.length
      ? `Ranked by gem index weighted by how well each title matches ${s.genres.join(' / ')}.`
      : 'Ranked by gem index. Pick genres on the left to re-rank on taste match.';

  $('sankey-note').textContent = s.brushIds.length
    ? 'Genre, then format, then episode length, for the titles you selected on the scatter above. Ribbon width is the number of titles.'
    : 'Genre, then format, then episode length, for the titles in the gem zone under your current filters. Ribbon width is the number of titles. Click a genre or format node to filter everything to it.';
  $('sankey-status').textContent = s.brushIds.length
    ? `${sankeyGemCount().toLocaleString()} selected titles`
    : `${sankeyGemCount().toLocaleString()} hidden gems`;

  renderRankList();
  renderDrawer();
}

// ---------- wiring ----------

function initApp() {
  initScatter($('scatter'));
  initHeatmap($('heatmap'));
  initSankey($('sankey'));

  $('year-from').addEventListener('input', (e) => setFilter({ yearFrom: Math.min(+e.target.value, State.yearTo) }));
  $('year-to').addEventListener('input', (e) => setFilter({ yearTo: Math.max(+e.target.value, State.yearFrom) }));
  $('min-score').addEventListener('input', (e) => setFilter({ minScore: +e.target.value }));
  $('max-members').addEventListener('input', (e) => setFilter({ maxMembersLog: +e.target.value }));
  $('reset-btn').addEventListener('click', () => setFilter({
    genres: [], formats: [], minScore: 0,
    maxMembersLog: Math.log10(State.memMax) + 0.05,
    yearFrom: State.yearFloor, yearTo: State.yearCeil,
  }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (State.selId || State.brushIds.length)) {
      setState({ selId: null, brushIds: [] });
    }
  });

  // Redraw only the charts on resize (cheap), debounced through rAF, skipping
  // when the width has not actually changed, per the design README.
  let lastW = $('scatter').clientWidth;
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const w = $('scatter').clientWidth;
      if (w === lastW) return;
      lastW = w;
      drawScatter();
      drawHeatmap();
      drawSankey();
    });
  });
  ro.observe($('scatter'));

  onRender(render);
}

try {
  initApp();
  loadData();
} catch (err) {
  console.error(err);
  const bar = document.getElementById('errbar');
  if (bar) {
    bar.hidden = false;
    bar.textContent = 'Something went wrong loading the app. Check the browser console for details.';
  }
}
