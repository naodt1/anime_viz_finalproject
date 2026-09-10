import * as d3 from 'd3';
import { AppState } from './state.js';
import { selectSource } from './filters.js';
import { showTip, hideTip } from './tooltip.js';
import { makeResponsive } from './responsive.js';

const margin = { top: 10, right: 24, bottom: 30, left: 130 };
const width = 1120;
const ROW_H = 42;
const DOT_R = 2.2;
const DOT_R_SELECTED = 3;
const COLOR_DEFAULT = '#0e9b6c';
const COLOR_SELECTED = '#e0484b';
const HOVER_RADIUS = 7;

let sources, innerW, innerH, height;
let container, canvas, ctx, svg, rowsG, xAxisG;
let quadtree = null;

// Deterministic pseudo-random jitter from a title's id — same title always
// lands at the same relative offset within its row on every redraw
// (no flicker), and it's O(1) per point instead of running a real
// collision-avoiding beeswarm layout across a row that can hold 3000+
// dots. Good enough for "which rows are dense/sparse and where do the red
// (gem-zone) dots cluster," which is what this view is actually for.
function jitter(id, halfBand) {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return (frac * 2 - 1) * halfBand;
}

export function initSourceSwarm() {
  sources = AppState.SOURCES;
  innerW = width - margin.left - margin.right;
  innerH = sources.length * ROW_H;
  height = margin.top + innerH + margin.bottom;

  container = d3.select(makeResponsive('#source-swarm', width, height));

  const dpr = window.devicePixelRatio || 1;
  canvas = container
    .append('canvas')
    .style('left', margin.left + 'px')
    .style('top', margin.top + 'px')
    .style('width', innerW + 'px')
    .style('height', innerH + 'px')
    .attr('width', innerW * dpr)
    .attr('height', innerH * dpr)
    .node();
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  svg = container.append('svg').attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  rowsG = g.append('g').attr('class', 'swarm-rows');
  xAxisG = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerH})`);

  g.append('text')
    .attr('class', 'axis-label')
    .attr('x', innerW / 2)
    .attr('y', innerH + margin.bottom - 4)
    .attr('text-anchor', 'middle')
    .text('Score →');
}

export function drawSourceSwarm() {
  const data = AppState.filteredData;
  const selectedIds = new Set(AppState.brushSelectionData.map(d => d.id));

  const scoreExtent = d3.extent(data, d => d.score);
  const x = d3
    .scaleLinear()
    .domain(scoreExtent[0] === scoreExtent[1] ? [scoreExtent[0] - 1, scoreExtent[1] + 1] : [scoreExtent[0] - 0.15, scoreExtent[1] + 0.15])
    .range([0, innerW]);

  xAxisG
    .call(d3.axisBottom(x).ticks(8))
    .call(g => g.selectAll('.domain,.tick line').attr('stroke', '#dbe1e7'));

  const bySource = new Map(sources.map(s => [s, []]));
  data.forEach(d => {
    if (bySource.has(d.source)) bySource.get(d.source).push(d);
  });

  const halfBand = ROW_H / 2 - 6;
  const points = [];
  sources.forEach((source, ri) => {
    const rowCenter = ri * ROW_H + ROW_H / 2;
    bySource.get(source).forEach(d => {
      points.push({ d, cx: x(d.score), cy: rowCenter + jitter(d.id, halfBand) });
    });
  });

  quadtree = d3.quadtree().x(p => p.cx).y(p => p.cy).addAll(points);

  ctx.clearRect(0, 0, innerW, innerH);
  const rest = [];
  const selected = [];
  points.forEach(p => (selectedIds.has(p.d.id) ? selected : rest).push(p));

  const isActive = s => AppState.filters.sources.has(s);
  const anyDimmed = sources.some(s => !isActive(s));

  ctx.globalAlpha = anyDimmed ? 1 : 0.55;
  ctx.fillStyle = COLOR_DEFAULT;
  ctx.beginPath();
  rest.forEach(p => {
    if (anyDimmed && !isActive(p.d.source)) return;
    ctx.moveTo(p.cx + DOT_R, p.cy);
    ctx.arc(p.cx, p.cy, DOT_R, 0, Math.PI * 2);
  });
  ctx.fill();
  if (anyDimmed) {
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    rest.forEach(p => {
      if (isActive(p.d.source)) return;
      ctx.moveTo(p.cx + DOT_R, p.cy);
      ctx.arc(p.cx, p.cy, DOT_R, 0, Math.PI * 2);
    });
    ctx.fill();
  }

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLOR_SELECTED;
  ctx.beginPath();
  selected.forEach(p => {
    ctx.moveTo(p.cx + DOT_R_SELECTED, p.cy);
    ctx.arc(p.cx, p.cy, DOT_R_SELECTED, 0, Math.PI * 2);
  });
  ctx.fill();
  ctx.globalAlpha = 1;

  const rows = rowsG.selectAll('g.swarm-row').data(sources, s => s);
  const rowsEnter = rows.enter().append('g').attr('class', 'swarm-row');
  rowsEnter.append('rect').attr('class', 'swarm-row-hit');
  rowsEnter.append('text').attr('class', 'swarm-row-label');

  const rowsMerged = rowsEnter.merge(rows);
  rowsMerged
    .select('rect.swarm-row-hit')
    .attr('x', 0)
    .attr('y', (s, i) => i * ROW_H)
    .attr('width', innerW)
    .attr('height', ROW_H)
    .attr('fill', (s, i) => (i % 2 === 0 ? 'transparent' : 'rgba(20,30,40,0.02)'))
    .style('cursor', 'pointer')
    .on('mousemove', (evt, s) => {
      const [mx, my] = d3.pointer(evt, rowsG.node());
      const p = quadtree.find(mx, my, HOVER_RADIUS);
      if (!p) {
        hideTip();
        return;
      }
      showTip(
        `<strong>${p.d.title}</strong><span class="meta">${p.d.type} · ${p.d.year} · ${p.d.source}</span>` +
          `<span class="meta">Score ${p.d.score} · ${d3.format(',')(p.d.members)} members</span>`,
        evt
      );
    })
    .on('mouseleave', hideTip)
    .on('click', (evt, s) => selectSource(s));

  rowsMerged
    .select('text.swarm-row-label')
    .attr('x', -10)
    .attr('y', (s, i) => i * ROW_H + ROW_H / 2 + 4)
    .attr('text-anchor', 'end')
    .attr('class', s => 'swarm-row-label axis-label' + (isActive(s) ? '' : ' dimmed'))
    .style('cursor', 'pointer')
    .style('pointer-events', 'none')
    .text(s => `${s} (${(bySource.get(s) || []).length})`);
}
