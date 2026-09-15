import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { State, isGem, filteredTitles, selectionScopedTitles, sankeyBaseTitles, setFilter } from './state.js';
import { tipFor } from './tip.js';
import { EPISODE_BINS } from './episodeBins.js';

const TOP_PAD = 28;
const STAGE_LABELS = ['Genre', 'Format', 'Episodes'];
const EPISODE_ORDER = EPISODE_BINS.map((b) => b.label);

let host;
let gemCount = 0;

export function initSankey(el) {
  host = el;
}

export function sankeyGemCount() {
  return gemCount;
}

// On-brand red/teal/ochre/neutral palette, cycling families so adjacent
// genres never share a hue. 12 slots for the genre cap below.
const GENRE_PALETTE = [
  '#ff563c', '#5fb8ac', '#e0a83e', '#2d2b2b', // accent-500, teal-light, ochre-light, neutral-900
  '#7c1405', '#1f7a6c', '#a8781f', '#9b9797', // accent-800, teal-mid, ochre-mid, neutral-500
  '#ff9783', '#0d4a40', '#6b4d14', '#605d5d', // accent-400, teal-dark, ochre-dark, neutral-700
];
const genreColor = d3.scaleOrdinal().range(GENRE_PALETTE);

function orderedValues(rows, key, preferred) {
  const counts = new Map();
  rows.forEach((d) => counts.set(d[key], (counts.get(d[key]) || 0) + 1));
  const present = [...counts.keys()];
  if (preferred) return preferred.filter((v) => counts.has(v)).concat(present.filter((v) => preferred.indexOf(v) < 0));
  return present.sort((a, b) => counts.get(b) - counts.get(a));
}

export function drawSankey() {
  const s = State;
  if (!host || !s.titles.length) return;

  const W = host.clientWidth || 900;
  // A box-select on the scatter overrides the default "gem zone" scoping
  // with exactly what was dragged over, gems or not.
  const activeRows = s.brushIds.length ? selectionScopedTitles() : filteredTitles().filter(isGem);
  gemCount = activeRows.length;

  // Structure (nodes/order/colors) comes from sankeyBaseTitles(), not
  // activeRows, so clicking a node doesn't rebuild the chart around itself.
  const rows = s.brushIds.length ? selectionScopedTitles() : sankeyBaseTitles().filter(isGem);

  d3.select(host).selectAll('svg').remove();
  const svg = d3.select(host).append('svg').attr('width', W);

  if (rows.length === 0) {
    svg.attr('height', 80).append('text').attr('x', 4).attr('y', 30)
      .attr('class', 'sankey-col-label')
      .text(s.brushIds.length ? 'No titles in your current selection.' : 'No hidden gems under the current filters.');
    return;
  }

  const genres = orderedValues(rows, 'primaryGenre').slice(0, 12);
  const formats = orderedValues(rows, 'format');
  const bins = orderedValues(rows, 'episodeBin', EPISODE_ORDER);

  const H = Math.max(360, genres.length * 34 + TOP_PAD + 20);
  svg.attr('height', H);
  const gRoot = svg.append('g');

  genreColor.domain(genres);

  const stages = [
    { key: 'primaryGenre', values: genres },
    { key: 'format', values: formats },
    { key: 'episodeBin', values: bins },
  ];
  const LAST = stages.length - 1;

  const nodeIndex = new Map();
  const nodes = [];
  stages.forEach((stage, si) => {
    stage.values.forEach((v) => {
      const id = si + '::' + v;
      nodeIndex.set(id, nodes.length);
      nodes.push({ id, name: v, stage: si });
    });
  });

  // Keyed by the full genre+format+episodeBin triple, not just the node
  // pair, so each link keeps its title identity across both hops.
  const linkCounts = [new Map(), new Map()];
  rows.forEach((d) => {
    const path = [d.primaryGenre, d.format, d.episodeBin];
    for (let i = 0; i < 2; i++) {
      const key = `${d.primaryGenre}|${d.format}|${d.episodeBin}|${i}::${path[i]}->${i + 1}::${path[i + 1]}`;
      linkCounts[i].set(key, (linkCounts[i].get(key) || 0) + 1);
    }
  });
  const links = [];
  linkCounts.forEach((map) => map.forEach((count, key) => {
    const [genre, format, episodeBin, pair] = key.split('|');
    const [a, b] = pair.split('->');
    if (nodeIndex.has(a) && nodeIndex.has(b)) {
      links.push({ source: nodeIndex.get(a), target: nodeIndex.get(b), value: count, genre, format, episodeBin });
    }
  }));

  const layout = sankey().nodeId((d) => d.index).nodeWidth(12).nodePadding(6)
    .extent([[0, TOP_PAD], [W, H - 10]]);
  const graph = layout({
    nodes: nodes.map((d) => Object.assign({}, d)),
    links: links.map((d) => Object.assign({}, d)),
  });

  const tip = tipFor(host);

  // Dim a link unless it matches every active filter (genre/format/episode).
  const linkOpacity = (d) => {
    if (s.genres.length && s.genres.indexOf(d.genre) < 0) return 0.08;
    if (s.formats.length && s.formats.indexOf(d.format) < 0) return 0.08;
    if (s.episodeBins.length && s.episodeBins.indexOf(d.episodeBin) < 0) return 0.08;
    return 0.35;
  };

  // A link's own d.width is derived from d.value but rounds/clamps during
  // layout, so read the count back off the value for the tooltip rather
  // than trusting the rendered stroke width.
  gRoot.append('g').selectAll('path').data(graph.links).enter().append('path')
    .attr('class', 'sankey-link')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke', (d) => (genres.indexOf(d.genre) >= 0 ? genreColor(d.genre) : '#bab6b6'))
    .attr('stroke-opacity', linkOpacity)
    .attr('stroke-width', (d) => Math.max(1, d.width))
    .on('mouseenter', function (ev, d) {
      d3.select(this).attr('stroke-opacity', Math.min(0.85, linkOpacity(d) + 0.35));
      tip.innerHTML = `<b>${d.source.name} → ${d.target.name}</b>${d.value.toLocaleString()} titles`;
      tip.style.opacity = 1;
    })
    .on('mousemove', (ev) => {
      const [px, py] = d3.pointer(ev, host);
      tip.style.left = Math.min(px + 12, W - 250) + 'px';
      tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + 'px';
    })
    .on('mouseleave', function (ev, d) {
      d3.select(this).attr('stroke-opacity', linkOpacity(d));
      tip.style.opacity = 0;
    });

  const isActive = (d) => {
    if (d.stage === 0) return s.genres.indexOf(d.name) >= 0;
    if (d.stage === 1) return s.formats.indexOf(d.name) >= 0;
    return s.episodeBins.indexOf(d.name) >= 0;
  };
  const anyFilterActive = s.genres.length + s.formats.length + s.episodeBins.length > 0;

  // Multi-select toggle, shared across all three stages.
  const FILTER_KEY = ['genres', 'formats', 'episodeBins'];
  function toggleStage(stage, name) {
    const key = FILTER_KEY[stage];
    const cur = s[key];
    setFilter({ [key]: cur.indexOf(name) >= 0 ? cur.filter((x) => x !== name) : cur.concat([name]) });
  }

  const nodeG = gRoot.append('g').selectAll('g').data(graph.nodes).enter().append('g').attr('class', 'sankey-node');

  nodeG.append('rect')
    .attr('x', (d) => d.x0).attr('y', (d) => d.y0)
    .attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0))
    .attr('fill', (d) => (d.stage === 0 ? genreColor(d.name) : 'var(--color-neutral-500)'))
    .attr('fill-opacity', (d) => (!anyFilterActive || isActive(d) ? 1 : 0.3))
    .style('cursor', 'pointer')
    .on('mouseenter', (ev, d) => {
      tip.innerHTML = `<b>${d.name}</b>${d.value.toLocaleString()} titles`;
      tip.style.opacity = 1;
      tip.style.left = Math.min(d.x0 + 14, W - 240) + 'px';
      tip.style.top = d.y0 + 'px';
    })
    .on('mouseleave', () => { tip.style.opacity = 0; })
    .on('click', (ev, d) => toggleStage(d.stage, d.name));

  const LABEL_MIN = 9;
  nodeG.filter((d) => d.y1 - d.y0 >= LABEL_MIN).append('text')
    .attr('x', (d) => (d.stage === LAST ? d.x0 - 8 : d.x1 + 6))
    .attr('y', (d) => (d.y0 + d.y1) / 2)
    .attr('dy', '0.32em')
    .attr('text-anchor', (d) => (d.stage === LAST ? 'end' : 'start'))
    .text((d) => d.name);

  gRoot.append('g').selectAll('text').data(stages.map((st, i) => {
    const sn = graph.nodes.filter((n) => n.stage === i);
    const x0 = d3.min(sn, (n) => n.x0);
    const x1 = d3.max(sn, (n) => n.x1);
    const anchor = i === 0 ? 'start' : i === LAST ? 'end' : 'middle';
    const xx = i === 0 ? x0 : i === LAST ? x1 : (x0 + x1) / 2;
    return { label: STAGE_LABELS[i], x: xx, anchor };
  })).enter().append('text')
    .attr('class', 'sankey-col-label')
    .attr('x', (d) => d.x).attr('y', TOP_PAD - 12)
    .attr('text-anchor', (d) => d.anchor)
    .text((d) => d.label);
}
