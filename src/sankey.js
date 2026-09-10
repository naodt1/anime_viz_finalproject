import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { AppState } from './state.js';
import { showTip, hideTip } from './tooltip.js';
import { makeResponsive } from './responsive.js';
import { selectGenre, selectFormat, selectEpisodeBin } from './filters.js';
import { EPISODE_BINS } from './episodeBins.js';

const width = 1120;
const height = 760;
const TOP_PAD = 28;

const STAGE_LABELS = ['Genre', 'Format', 'Episodes'];
const EPISODE_BIN_LABELS = EPISODE_BINS.map(b => b.label);

let sankeyG;

export function initSankey() {
  const svg = d3.select(makeResponsive('#sankey', width, height)).append('svg').attr('width', width).attr('height', height);
  sankeyG = svg.append('g');
}

// Evenly-spaced hues so the palette scales to however many genres the
// dataset has, rather than a hand-picked list sized for a fixed cap.
const genreColor = d3.scaleOrdinal();

export function drawSankey() {
  sankeyG.selectAll('*').remove();

  // Only the titles currently in the gem-zone brush — this is a
  // composition breakdown of your selection (genre/format/episode length),
  // not a comparison against everything else. The heatmap already covers
  // "what's the gem rate per category"; this answers "what does my
  // current selection actually look like," which is what the panel title
  // asks in the first place.
  const data = AppState.brushSelectionData;
  if (data.length === 0) {
    sankeyG
      .append('text')
      .attr('x', 20)
      .attr('y', 30)
      .attr('class', 'axis-label')
      .text('Drag a selection box on the scatterplot above to see its breakdown here.');
    return;
  }

  // Golden-angle hue steps (rather than evenly spaced ones) so genres next
  // to each other in frequency rank don't land on near-identical hues.
  genreColor
    .domain(AppState.TOP_GENRES)
    .range(AppState.TOP_GENRES.map((_, i) => d3.interpolateRainbow((i * 0.618033988749895) % 1)));

  const stages = [
    { key: 'primaryGenre', values: AppState.TOP_GENRES },
    { key: 'type', values: AppState.FORMATS },
    { key: 'episodeBin', values: EPISODE_BIN_LABELS }
  ];
  const LAST_STAGE = stages.length - 1;

  const nodeIndex = new Map();
  const nodes = [];
  stages.forEach((stage, si) => {
    stage.values.forEach(v => {
      const id = si + '::' + v;
      nodeIndex.set(id, nodes.length);
      nodes.push({ id, name: v, stage: si });
    });
  });

  const linkCounts = [new Map(), new Map()];
  data.forEach(d => {
    const path = [d.primaryGenre, d.type, d.episodeBin];
    for (let i = 0; i < 2; i++) {
      const a = i + '::' + path[i];
      const b = i + 1 + '::' + path[i + 1];
      const key = a + '->' + b;
      linkCounts[i].set(key, (linkCounts[i].get(key) || 0) + 1);
    }
  });

  const links = [];
  linkCounts.forEach(map => {
    map.forEach((count, key) => {
      const [a, b] = key.split('->');
      links.push({ source: nodeIndex.get(a), target: nodeIndex.get(b), value: count });
    });
  });

  const layout = sankey().nodeId(d => d.index).nodeWidth(12).nodePadding(6).extent([[0, TOP_PAD], [width, height - 10]]);

  const graph = layout({
    nodes: nodes.map(d => Object.assign({}, d)),
    links: links.map(d => Object.assign({}, d))
  });

  sankeyG
    .append('g')
    .selectAll('path')
    .data(graph.links)
    .enter()
    .append('path')
    .attr('class', 'sankey-link')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke', d => (d.source.stage === 0 ? genreColor(d.source.name) : '#c7cdd6'))
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', d => Math.max(1, d.width))
    .on('mousemove', (evt, d) => showTip(`<strong>${d.source.name} → ${d.target.name}</strong><span class="meta">${d.value} titles</span>`, evt))
    .on('mouseleave', hideTip);

  const nodeG = sankeyG.append('g').selectAll('g').data(graph.nodes).enter().append('g').attr('class', 'sankey-node');

  // Every column doubles as a filter: clicking a node isolates the diagram
  // (and every other view) to just that value, dimming everything else —
  // click it again to clear back to "everything".
  const isActive = d => {
    if (d.stage === 0) return AppState.filters.genres.has(d.name);
    if (d.stage === 1) return AppState.filters.formats.has(d.name);
    const bin = EPISODE_BINS.find(b => b.label === d.name);
    const f = AppState.filters;
    return bin.min <= f.epMax && bin.max >= f.epMin;
  };

  nodeG
    .append('rect')
    .attr('x', d => d.x0)
    .attr('y', d => d.y0)
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => Math.max(1, d.y1 - d.y0))
    .attr('fill', d => (d.stage === 0 ? genreColor(d.name) : '#9aa5b1'))
    .attr('fill-opacity', d => (isActive(d) ? 1 : 0.3))
    .style('cursor', 'pointer')
    .on('mousemove', (evt, d) => showTip(`<strong>${d.name}</strong><span class="meta">${d.value.toLocaleString()} titles</span>`, evt))
    .on('mouseleave', hideTip)
    .on('click', (evt, d) => {
      if (d.stage === 0) selectGenre(d.name);
      else if (d.stage === 1) selectFormat(d.name);
      else selectEpisodeBin(d.name);
    });

  // Skip the inline label on nodes too thin to fit one without overlapping
  // its neighbors (common for rare primary genres) — the tooltip above
  // still identifies them on hover.
  const LABEL_MIN_HEIGHT = 9;
  nodeG
    .filter(d => d.y1 - d.y0 >= LABEL_MIN_HEIGHT)
    .append('text')
    .attr('x', d => (d.stage === LAST_STAGE ? d.x0 - 8 : d.x1 + 6))
    .attr('y', d => (d.y0 + d.y1) / 2)
    .attr('dy', '0.32em')
    .attr('text-anchor', d => (d.stage === LAST_STAGE ? 'end' : 'start'))
    .attr('opacity', d => (isActive(d) ? 1 : 0.5))
    .text(d => d.name);

  sankeyG
    .append('g')
    .selectAll('text')
    .data(stages.map((s, i) => {
      const stageNodes = graph.nodes.filter(n => n.stage === i);
      const x0 = d3.min(stageNodes, n => n.x0);
      const x1 = d3.max(stageNodes, n => n.x1);
      // First column left-aligns and the last right-aligns (matching how
      // their node labels sit relative to the bars) so the header text
      // grows inward, away from the chart's edges, instead of risking
      // overflow past them; columns in between are just centered.
      const anchor = i === 0 ? 'start' : i === stages.length - 1 ? 'end' : 'middle';
      const x = i === 0 ? x0 : i === stages.length - 1 ? x1 : (x0 + x1) / 2;
      return { label: STAGE_LABELS[i], x, anchor };
    }))
    .enter()
    .append('text')
    .attr('class', 'sankey-col-label')
    .attr('x', d => d.x)
    .attr('y', TOP_PAD - 12)
    .attr('text-anchor', d => d.anchor)
    .text(d => d.label);
}
