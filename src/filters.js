import * as d3 from 'd3';
import { AppState } from './state.js';
import { EPISODE_BINS } from './episodeBins.js';

let onChangeRef = () => {};

// Chips render active/inactive from Set membership, but clicking always
// routes through onSelect (selectGenre/selectFormat) rather than toggling
// the Set directly — see the note on selectGenre below for why.
function buildChips(containerId, values, activeSet, onSelect) {
  const c = d3.select('#' + containerId);
  c.selectAll('*').remove();
  c.selectAll('div.chip')
    .data(values)
    .enter()
    .append('div')
    .attr('class', d => 'chip' + (activeSet.has(d) ? ' active' : ''))
    .text(d => d)
    .on('click', (evt, d) => onSelect(d));
}

function rebuildChips() {
  const f = AppState.filters;
  buildChips('genre-filter', AppState.TOP_GENRES, f.genres, selectGenre);
  buildChips('format-filter', AppState.FORMATS, f.formats, selectFormat);
}

// The first click off the default "everything selected" state isolates
// (so clicking Comedy alone shows just Comedy, not "everything except
// Comedy" — a plain toggle off a full set reads as exclusion, which is
// backwards from what clicking a category means here). Every click after
// that is a normal multi-select toggle, so a second, different click
// (Adventure) adds to the selection instead of replacing it, and
// toggling off the last remaining value falls back to "everything" rather
// than an empty, zero-result set. Both the sidebar chips and the sankey's
// columns call this, so they stay in lockstep.
function toggleSelection(current, allValues, name) {
  if (current.size === allValues.length) return new Set([name]);
  const next = new Set(current);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next.size === 0 ? new Set(allValues) : next;
}

export function selectGenre(name) {
  const f = AppState.filters;
  f.genres = toggleSelection(f.genres, AppState.TOP_GENRES, name);
  rebuildChips();
  onChangeRef(false);
}

export function selectFormat(name) {
  const f = AppState.filters;
  f.formats = toggleSelection(f.formats, AppState.FORMATS, name);
  rebuildChips();
  onChangeRef(false);
}

// Same isolate/multi-select toggle, for the source beeswarm's rows. Source
// has no sidebar chip row of its own — the swarm is its only control — so
// this skips rebuildChips() and just triggers the shared redraw.
export function selectSource(name) {
  const f = AppState.filters;
  f.sources = toggleSelection(f.sources, AppState.SOURCES, name);
  onChangeRef(false);
}

// Same isolate-on-click idea as selectGenre/selectFormat, but the episode
// filter is a numeric range rather than a set, so "isolate" means moving
// ep-min/ep-max to exactly this bin's bounds (clamped to the longest title
// actually in the data, since a bin's upper bound can be unbounded).
export function selectEpisodeBin(label) {
  const f = AppState.filters;
  const bin = EPISODE_BINS.find(b => b.label === label);
  if (!bin) return;

  const maxAvailable = d3.max(AppState.ALL_DATA, d => d.episodes);
  const binMax = Math.min(bin.max, maxAvailable);
  const alreadyIsolated = f.epMin === bin.min && f.epMax === binMax;

  if (alreadyIsolated) {
    f.epMin = 1;
    f.epMax = maxAvailable;
  } else {
    f.epMin = bin.min;
    f.epMax = binMax;
  }

  d3.select('#ep-min').property('value', f.epMin);
  d3.select('#ep-max').property('value', f.epMax);
  onChangeRef(false);
}

// Wires up the sidebar controls (genre/format chips, episode range) plus
// the reset button. Year is controlled separately by the timeline's brush
// (see src/timeline.js) rather than a sidebar input. The sankey's genre,
// format, and episode columns are an alternate way to filter — see
// selectGenre/selectFormat/selectEpisodeBin above.
//
// `onChange(resetBrush)` is called any time a filter changes; resetBrush=true
// tells the scatterplot to recompute its default "gem zone" brush rather
// than trying to preserve pixel coords across a domain change. `onReset` is
// called only by the reset button, after genre/format/episode filters are
// back to their defaults, so the caller can also reset the timeline brush.
export function initFilters(onChange, onReset) {
  onChangeRef = onChange;
  const f = AppState.filters;

  rebuildChips();

  d3.select('#ep-min').property('value', f.epMin).on('change', function () {
    f.epMin = +this.value;
    onChangeRef(false);
  });
  d3.select('#ep-max').property('value', f.epMax).on('change', function () {
    f.epMax = +this.value;
    onChangeRef(false);
  });

  d3.select('#reset-filters').on('click', () => {
    f.genres = new Set(AppState.TOP_GENRES);
    f.formats = new Set(AppState.FORMATS);
    f.sources = new Set(AppState.SOURCES);
    f.epMin = 1;
    f.epMax = d3.max(AppState.ALL_DATA, d => d.episodes);

    d3.select('#ep-min').property('value', f.epMin);
    d3.select('#ep-max').property('value', f.epMax);

    rebuildChips();
    onReset();
  });
}

// Genre/format/episode predicate, deliberately excluding year — used both
// by applyFilters below and by the timeline's histogram, which shows how
// titles matching every OTHER filter are distributed across years (its own
// year selection shouldn't shrink the bars it's letting you brush over).
//
// Genre matching is against a title's primaryGenre only, not "any of its
// genre tags" — matching the sankey's genre column, which necessarily
// groups titles by primaryGenre too (a parallel-sets node needs each title
// assigned to exactly one category per stage). Filtering on "any tag"
// instead used to disagree with what the sankey showed: deselecting a
// genre chip only dropped titles with *no other* active genre tag, so a
// multi-genre title could stay in the data yet still show 0 flow through
// that genre's now-dimmed sankey node — the two views told different
// stories about the same click.
export function matchesNonYearFilters(d) {
  const f = AppState.filters;
  return (
    f.formats.has(d.type) &&
    d.episodes >= f.epMin &&
    d.episodes <= f.epMax &&
    f.genres.has(d.primaryGenre) &&
    f.sources.has(d.source)
  );
}

// Recomputes AppState.filteredData from AppState.ALL_DATA + AppState.filters.
export function applyFilters() {
  const f = AppState.filters;
  AppState.filteredData = AppState.ALL_DATA.filter(d => matchesNonYearFilters(d) && d.year >= f.yearMin && d.year <= f.yearMax);
}
