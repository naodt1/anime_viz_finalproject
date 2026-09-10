import * as d3 from 'd3';
import { AppState } from './state.js';
import { showTip, hideTip } from './tooltip.js';
import { makeResponsive } from './responsive.js';

const margin = { top: 10, right: 24, bottom: 40, left: 46 };
const width = 1120;
const height = 340;
const innerW = width - margin.left - margin.right;
const innerH = height - margin.top - margin.bottom;

const DOT_R = 2.6;
const DOT_R_SELECTED = 3.4;
const COLOR_DEFAULT = '#0e9b6c';
const COLOR_SELECTED = '#e0484b';
const HOVER_RADIUS = 8;

let scatterG, brushLayer, xAxisG, yAxisG, brushG, brush;
let canvas, ctx;
let quadtree;
let onBrushChange = () => {};

// The gem-zone brush's current bounds, kept in DATA space (score/members)
// rather than pixel space. Filter changes (genre chips, the timeline)
// rescale the axes, so a pixel-space selection would either mean something
// different after the rescale or have to be discarded; keeping it in data
// space lets the same "score >= X, members <= Y" selection carry over and
// just get re-projected onto the new scales, instead of vanishing every
// time a filter elsewhere changes.
let brushDomain = null;

// The dot cloud (up to ~10k points) is drawn on a <canvas> instead of as
// SVG circles — one bulk redraw per brush tick instead of thousands of DOM
// nodes, which keeps brushing/filtering smooth at this data size. Axes,
// the brush overlay, and labels stay in SVG since there are few of them
// and SVG makes hit-testing/interaction (the brush drag, hover) simple.
export function initScatter(onBrushChangeCb) {
  onBrushChange = onBrushChangeCb;

  const container = d3.select(makeResponsive('#scatter', width, height));

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

  const svg = container.append('svg').attr('width', width).attr('height', height);
  scatterG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  brushLayer = scatterG.append('g').attr('class', 'brush-layer');
  xAxisG = scatterG.append('g').attr('class', 'x-axis');
  yAxisG = scatterG.append('g').attr('class', 'y-axis');

  scatterG
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', innerW / 2)
    .attr('y', height - margin.top - 8)
    .attr('text-anchor', 'middle')
    .text('Members (log scale) →');

  scatterG
    .append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .text('Score →');
}

export function drawScatter(resetBrush) {
  const data = AppState.filteredData;

  const memberExtent = d3.extent(data, d => d.members);
  const scoreExtent = d3.extent(data, d => d.score);

  AppState.scatterX = d3
    .scaleLog()
    .domain([Math.max(1, memberExtent[0] * 0.8), memberExtent[1] * 1.1])
    .range([0, innerW]);
  AppState.scatterY = d3
    .scaleLinear()
    .domain([scoreExtent[0] - 0.3, scoreExtent[1] + 0.2])
    .range([innerH, 0]);

  xAxisG
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(AppState.scatterX).ticks(5, '~s').tickSizeOuter(0))
    .call(g => g.selectAll('.domain,.tick line').attr('stroke', '#dbe1e7'));
  yAxisG
    .call(d3.axisLeft(AppState.scatterY).ticks(6).tickSizeOuter(0))
    .call(g => g.selectAll('.domain,.tick line').attr('stroke', '#dbe1e7'));

  quadtree = d3
    .quadtree()
    .x(d => AppState.scatterX(d.members))
    .y(d => AppState.scatterY(d.score))
    .addAll(data);

  d3.select('#scatter-stat').text(`${data.length.toLocaleString()} titles`);

  brush = d3.brush().extent([[0, 0], [innerW, innerH]]).on('brush end', brushed);

  brushLayer.selectAll('*').remove();
  brushG = brushLayer.append('g').attr('class', 'brush').call(brush);
  // Once a selection exists, d3-brush's .selection rect and resize handles
  // sit on top of .overlay within the brushed area, intercepting hover
  // before it gets there — wire every one of the brush's rects, not just
  // the overlay, so hovering a dot still works inside the gem zone.
  brushG
    .selectAll('rect')
    .on('mousemove.tooltip', handleHover)
    .on('mouseleave.tooltip', hideTip);

  if (resetBrush) {
    // Top quartile score, bottom quartile members — both quartiles so
    // "well-reviewed" and "obscure" are held to the same strictness,
    // rather than pairing a quartile with a looser median split.
    const scoreQ = d3.quantile(data.map(d => d.score).sort(d3.ascending), 0.75);
    const memberQ = d3.quantile(data.map(d => d.members).sort(d3.ascending), 0.25);
    brushDomain = { x0: memberExtent[0], x1: memberQ, y0: scoreQ, y1: scoreExtent[1] + 0.2 };
  }

  applyBrushDomain();
}

// Surfaces the gem zone's actual score/member thresholds as text — the
// zone is defined by percentiles of whatever's currently filtered, so the
// real numbers shift silently as filters change; this keeps that visible
// instead of leaving it implicit in where the brush happens to sit.
function updateZoneStat() {
  const el = d3.select('#zone-stat');
  if (!brushDomain) {
    el.text('No gem zone selected — drag a box above to define one.');
    return;
  }
  el.text(`Current gem zone: score ≥ ${brushDomain.y0.toFixed(2)} · members ≤ ${d3.format(',')(Math.round(brushDomain.x1))}`);
}

// Re-projects the current data-space brushDomain onto the (possibly just
// rescaled) axes and moves the visual brush to match — or clears it if
// there's no active selection. d3-brush clamps out-of-range coordinates to
// its extent on its own, so a domain that no longer fully fits the new
// scale just touches the edge instead of erroring.
function applyBrushDomain() {
  if (!brushDomain) {
    brushed({ selection: null });
    return;
  }
  const x0 = AppState.scatterX(brushDomain.x0);
  const x1 = AppState.scatterX(brushDomain.x1);
  const y0 = AppState.scatterY(brushDomain.y1);
  const y1 = AppState.scatterY(brushDomain.y0);
  brushG.call(brush.move, [[x0, y0], [x1, y1]]);
}

function handleHover(evt) {
  const [mx, my] = d3.pointer(evt, scatterG.node());
  const d = quadtree.find(mx, my, HOVER_RADIUS);
  if (!d) {
    hideTip();
    return;
  }
  showTip(
    `<strong>${d.title}</strong><span class="meta">${d.type} · ${d.year} · ${d.primaryGenre}</span>` +
      `<span class="meta">Score ${d.score} · ${d3.format(',')(d.members)} members</span>`,
    evt
  );
}

function renderDots(data, selectedIds, sel) {
  ctx.clearRect(0, 0, innerW, innerH);

  const rest = [];
  const selected = [];
  data.forEach(d => (selectedIds.has(d.id) ? selected : rest).push(d));

  ctx.globalAlpha = sel ? 0.18 : 0.55;
  ctx.fillStyle = COLOR_DEFAULT;
  ctx.beginPath();
  rest.forEach(d => {
    const cx = AppState.scatterX(d.members);
    const cy = AppState.scatterY(d.score);
    ctx.moveTo(cx + DOT_R, cy);
    ctx.arc(cx, cy, DOT_R, 0, Math.PI * 2);
  });
  ctx.fill();

  ctx.globalAlpha = sel ? 0.9 : 0.55;
  ctx.fillStyle = COLOR_SELECTED;
  ctx.beginPath();
  selected.forEach(d => {
    const cx = AppState.scatterX(d.members);
    const cy = AppState.scatterY(d.score);
    ctx.moveTo(cx + DOT_R_SELECTED, cy);
    ctx.arc(cx, cy, DOT_R_SELECTED, 0, Math.PI * 2);
  });
  ctx.fill();

  ctx.globalAlpha = 1;
}

function brushed(evt) {
  const sel = evt.selection;
  const selectedIds = new Set();

  if (sel) {
    const [[x0, y0], [x1, y1]] = sel;
    brushDomain = {
      x0: AppState.scatterX.invert(x0),
      x1: AppState.scatterX.invert(x1),
      y0: AppState.scatterY.invert(y1),
      y1: AppState.scatterY.invert(y0)
    };
    AppState.filteredData.forEach(d => {
      const px = AppState.scatterX(d.members);
      const py = AppState.scatterY(d.score);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) selectedIds.add(d.id);
    });
  } else {
    brushDomain = null;
  }

  updateZoneStat();
  renderDots(AppState.filteredData, selectedIds, sel);

  AppState.brushSelectionData = AppState.filteredData.filter(d => selectedIds.has(d.id));
  onBrushChange();
}
