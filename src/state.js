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
  yearFrom: null,
  yearTo: null,
  minScore: 0,
  maxMembersLog: 7,      // slider works in log10(members)
  selId: null,           // drawer subject

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

// A filter change. Every filter interaction also clears the current selection,
// matching the design's `set` helper.
export function setFilter(patch) {
  Object.assign(State, patch, { selId: null });
  renderFn();
}

export function isGem(t) {
  return t.sp >= 70 && t.mp <= 40;
}

// The predicate from the design README, all conjunctive with genre/format
// internally disjunctive. Undated titles are never excluded by the era filter.
export function filteredTitles() {
  const s = State;
  const maxM = Math.pow(10, s.maxMembersLog);
  return s.titles.filter((t) => {
    if (t.score < s.minScore || t.members > maxM) return false;
    if (t.year && (t.year < s.yearFrom || t.year > s.yearTo)) return false;
    if (s.formats.length && s.formats.indexOf(t.format) < 0) return false;
    if (s.genres.length && !t.genres.some((g) => s.genres.indexOf(g) >= 0)) return false;
    return true;
  });
}
