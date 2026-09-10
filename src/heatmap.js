import * as d3 from 'd3';
import { AppState } from './state.js';
import { showTip, hideTip } from './tooltip.js';
import { makeResponsive } from './responsive.js';

const margin = { top: 26, right: 16, bottom: 10, left: 110 };
const width = 1120;
const ROW_H = 20;
const LOW_N = 10;
const RATE_DOMAIN_MAX = 0.3;

// Sequential single-hue ramp (pale to the app's teal accent) — cell shade
// encodes what fraction of a genre x format combo falls in the current
// gem-zone brush, so this reads directly against the same "In selection"
// concept the sankey and scatter already use.
const color = d3.scaleLinear().domain([0, RATE_DOMAIN_MAX]).range(['#eef7f2', '#0a6e4d']).clamp(true);

let g, innerW, colW, genres;

export function initHeatmap() {
  genres = AppState.TOP_GENRES;
  const height = margin.top + genres.length * ROW_H + margin.bottom + 34;

  const svg = d3.select(makeResponsive('#heatmap', width, height)).append('svg').attr('width', width).attr('height', height);
  innerW = width - margin.left - margin.right;
  colW = innerW / AppState.FORMATS.length;
  g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  g.append('g')
    .attr('class', 'heatmap-col-headers')
    .selectAll('text')
    .data(AppState.FORMATS)
    .enter()
    .append('text')
    .attr('class', 'sankey-col-label')
    .attr('x', (d, i) => i * colW + colW / 2)
    .attr('y', -10)
    .attr('text-anchor', 'middle')
    .text(d => d);

  g.append('g')
    .attr('class', 'heatmap-row-labels')
    .selectAll('text')
    .data(genres)
    .enter()
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', -10)
    .attr('y', (d, i) => i * ROW_H + ROW_H / 2 + 4)
    .attr('text-anchor', 'end')
    .text(d => d);

  g.append('g').attr('class', 'heatmap-cells');

  drawLegend(svg, height);
}

function drawLegend(svg, height) {
  const legendW = 140;
  const legendX = width - margin.right - legendW;
  const legendY = height - 22;

  const gradId = 'heatmap-gradient';
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient').attr('id', gradId);
  gradient.append('stop').attr('offset', '0%').attr('stop-color', color(0));
  gradient.append('stop').attr('offset', '100%').attr('stop-color', color(RATE_DOMAIN_MAX));

  const legend = svg.append('g').attr('transform', `translate(${legendX},${legendY})`);
  legend.append('rect').attr('width', legendW).attr('height', 8).attr('fill', `url(#${gradId})`).attr('rx', 2);
  legend.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 20).attr('text-anchor', 'start').text('0%');
  legend
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', legendW)
    .attr('y', 20)
    .attr('text-anchor', 'end')
    .text(`${Math.round(RATE_DOMAIN_MAX * 100)}%+ gem rate`);
}

export function drawHeatmap() {
  const data = AppState.filteredData;
  const selectedIds = new Set(AppState.brushSelectionData.map(d => d.id));

  const cells = [];
  genres.forEach((genre, ri) => {
    AppState.FORMATS.forEach((format, ci) => {
      const subset = data.filter(d => d.primaryGenre === genre && d.type === format);
      const gem = subset.filter(d => selectedIds.has(d.id)).length;
      cells.push({
        genre,
        format,
        ri,
        ci,
        n: subset.length,
        rate: subset.length ? gem / subset.length : null
      });
    });
  });

  const cellsG = g.select('.heatmap-cells');
  const key = d => d.genre + '::' + d.format;

  const rects = cellsG.selectAll('rect').data(cells, key);
  rects
    .enter()
    .append('rect')
    .attr('rx', 3)
    .attr('stroke', '#dbe1e7')
    .merge(rects)
    .attr('x', d => d.ci * colW + 1)
    .attr('y', d => d.ri * ROW_H + 1)
    .attr('width', colW - 2)
    .attr('height', ROW_H - 2)
    .attr('fill', d => (d.n === 0 ? '#f1f3f5' : color(d.rate)))
    .attr('opacity', d => (d.n > 0 && d.n < LOW_N ? 0.5 : 1))
    .on('mousemove', (evt, d) =>
      showTip(
        `<strong>${d.genre} · ${d.format}</strong><span class="meta">${d.n === 0 ? 'no titles' : Math.round(d.rate * 1000) / 10 + '% in gem zone'}</span>` +
          `<span class="meta">${d.n.toLocaleString()} titles</span>`,
        evt
      )
    )
    .on('mouseleave', hideTip);

  const labels = cellsG.selectAll('text').data(
    cells.filter(d => d.n > 0),
    key
  );
  labels.exit().remove();
  labels
    .enter()
    .append('text')
    .style('pointer-events', 'none')
    .merge(labels)
    .attr('x', d => d.ci * colW + colW / 2)
    .attr('y', d => d.ri * ROW_H + ROW_H / 2 + 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10.5)
    .attr('fill', d => (d.rate > RATE_DOMAIN_MAX * 0.55 ? '#eef7f2' : '#1a2129'))
    .text(d => Math.round(d.rate * 100) + '%');
}
