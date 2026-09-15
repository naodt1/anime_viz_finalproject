// Single mutable state object plus a render subscription. The design's logic
// class is a React component; this is the same idea without the framework:
// setFilter/setState mutate State and call the registered render function,
// which redraws the DOM and the three D3 charts from scratch each time.

export const State = {
  titles: [],            // full dataset, percentiles (sp/mp/gem) baked in at ingest
  source: 'Loading…',
  error: '',

  // filters
  genres: [],            // multi-select, OR
  formats: [],           // multi-select, OR
  episodeBins: [],       // multi-select, OR
  yearFrom: null,
  yearTo: null,
  minScore: 0,
  maxMembersLog: 7,      // slider works in log10(members)
  selId: null,           // drawer subject
  brushIds: [],          // ids selected by dragging a box on the scatter

  // ingest-derived constants
  scoreMax: 10,
  yLo: 3,
  yHi: 10,
  scoreThresh: 0,
  memThresh: 0,
  memMin: 10,
  memMax: 1e6,
  yearFloor: 1970,
  yearCeil: 2026,
};

let renderFn = () => {};

export function onRender(fn) {
  renderFn = fn;
}

// A plain state change (data load, drawer open/close).
export function setState(patch) {
  Object.assign(State, patch);
  renderFn();
}

// A filter change. Every filter interaction also clears the current
// selection, matching the design's `set` helper — the box-select on the
// scatter is a selection too, so a filter change clears it the same way.
export function setFilter(patch) {
  Object.assign(State, patch, { selId: null, brushIds: [] });
  renderFn();
}

export function isGem(t) {
  return t.sp >= 70 && t.mp <= 40;
}

// Era/score/audience only — shared by filteredTitles() and sankeyBaseTitles().
function matchesEraScoreAudience(t, s) {
  const maxM = Math.pow(10, s.maxMembersLog);
  if (t.score < s.minScore || t.members > maxM) return false;
  if (t.year && (t.year < s.yearFrom || t.year > s.yearTo)) return false;
  return true;
}

// The predicate from the design README, all conjunctive with genre/format
// internally disjunctive. Undated titles are never excluded by the era
// filter. episodeBins follows the same shape, set from the sankey.
export function filteredTitles() {
  const s = State;
  return s.titles.filter((t) => {
    if (!matchesEraScoreAudience(t, s)) return false;
    if (s.formats.length && s.formats.indexOf(t.format) < 0) return false;
    if (s.genres.length && !t.genres.some((g) => s.genres.indexOf(g) >= 0)) return false;
    if (s.episodeBins.length && s.episodeBins.indexOf(t.episodeBin) < 0) return false;
    return true;
  });
}

// filteredTitles() minus genre/format/episode. The sankey builds its node
// list and colors from this so clicking a node doesn't rebuild the chart
// around its own output — it dims in place instead.
export function sankeyBaseTitles() {
  const s = State;
  return s.titles.filter((t) => matchesEraScoreAudience(t, s));
}

// filteredTitles(), narrowed further to the scatter's box-select when one is
// active. The Sankey and ranked list read this instead of filteredTitles()
// so a manual selection on the scatter overrides their default "gem zone"
// scoping with "exactly what you dragged over".
export function selectionScopedTitles() {
  const rows = filteredTitles();
  if (!State.brushIds.length) return rows;
  const ids = new Set(State.brushIds);
  return rows.filter((t) => ids.has(t.id));
}
