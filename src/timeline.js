import * as d3 from 'd3';
import { AppState } from './state.js';
import { matchesNonYearFilters } from './filters.js';
import { makeResponsive } from './responsive.js';

const margin = { top: 10, right: 24, bottom: 24, left: 46 };
const width = 1120;
const height = 100;
const innerW = width - margin.left - margin.right;
const innerH = height - margin.top - margin.bottom;

let barsG, x, brush, brushG;
let years = [];
let onChange = () => {};
let suppress = false;

function updateStat() {
  const f = AppState.filters;
  const [minYear, maxYear] = d3.extent(years);
  const text = f.yearMin <= minYear && f.yearMax >= maxYear ? `All years (${minYear}–${maxYear})` : `${f.yearMin}–${f.yearMax}`;
  d3.select('#timeline-stat').text(text);
}

function brushed(evt) {
  if (suppress) return;
  const sel = evt.selection || [0, innerW];
  const [x0, x1] = sel;
  const yearMin = Math.round(x.invert(x0));
  const yearMax = Math.max(yearMin, Math.round(x.invert(x1)) - 1);
  AppState.filters.yearMin = yearMin;
  AppState.filters.yearMax = yearMax;
  updateStat();
  onChange(false);
}

// Sets up the SVG, x scale, and brush once. Bars are (re)drawn separately
// by drawTimelineBars() whenever a non-year filter changes.
export function initTimeline(onChangeCb) {
  onChange = onChangeCb;

  const [minYear, maxYear] = d3.extent(AppState.ALL_DATA, d => d.year);
  years = d3.range(minYear, maxYear + 1);
  x = d3.scaleLinear().domain([minYear, maxYear + 1]).range([0, innerW]);

  const svg = d3.select(makeResponsive('#timeline', width, height)).append('svg').attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  barsG = g.append('g').attr('class', 'timeline-bars');

  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(14, 'd').tickSizeOuter(0))
    .call(gsel => gsel.selectAll('.domain,.tick line').attr('stroke', '#dbe1e7'));

  brush = d3.brushX().extent([[0, 0], [innerW, innerH]]).on('end', brushed);
  brushG = g.append('g').attr('class', 'brush').call(brush);

  suppress = true;
  brushG.call(brush.move, [0, innerW]);
  suppress = false;

  updateStat();
}

export function drawTimelineBars() {
  const counts = new Map();
  AppState.ALL_DATA.forEach(d => {
    if (!matchesNonYearFilters(d)) return;
    counts.set(d.year, (counts.get(d.year) || 0) + 1);
  });
  const maxCount = d3.max(counts.values()) || 1;
  const y = d3.scaleLinear().domain([0, maxCount]).range([innerH, 0]);

  const bars = barsG.selectAll('rect').data(years, d => d);
  bars
    .enter()
    .append('rect')
    .attr('class', 'timeline-bar')
    .attr('x', d => x(d))
    .attr('width', d => Math.max(1, x(d + 1) - x(d) - 1))
    .merge(bars)
    .attr('y', d => y(counts.get(d) || 0))
    .attr('height', d => innerH - y(counts.get(d) || 0));
}

// Moves the brush back to the full range (used by the "Reset filters"
// button) without re-triggering onChange — the caller runs its own reset
// pass right after.
export function resetTimeline() {
  const [minYear, maxYear] = d3.extent(years);
  AppState.filters.yearMin = minYear;
  AppState.filters.yearMax = maxYear;
  suppress = true;
  brushG.call(brush.move, [0, innerW]);
  suppress = false;
  updateStat();
}
