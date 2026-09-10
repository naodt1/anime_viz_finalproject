import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { State, isGem, filteredTitles, setFilter } from './state.js';
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

// Golden-angle hue steps so genres near each other in frequency rank don't
// collide, from the original Hidden Gem build.
const genreColor = d3.scaleOrdinal();

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
  const rows = filteredTitles().filter(isGem);
  gemCount = rows.length;

  d3.select(host).selectAll('svg').remove();
  const svg = d3.select(host).append('svg').attr('width', W);

  if (rows.length === 0) {
    svg.attr('height', 80).append('text').attr('x', 4).attr('y', 30)
      .attr('class', 'sankey-col-label')
      .text('No hidden gems under the current filters.');
    return;
  }

  const genres = orderedValues(rows, 'primaryGenre').slice(0, 12);
  const formats = orderedValues(rows, 'format');
  const bins = orderedValues(rows, 'episodeBin', EPISODE_ORDER);

  const H = Math.max(360, genres.length * 34 + TOP_PAD + 20);
  svg.attr('height', H);
  const gRoot = svg.append('g');

  genreColor.domain(genres).range(genres.map((_, i) => d3.interpolateRainbow((i * 0.618033988749895) % 1)));

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

  const linkCounts = [new Map(), new Map()];
  rows.forEach((d) => {
    const path = [d.primaryGenre, d.format, d.episodeBin];
    for (let i = 0; i < 2; i++) {
      const key = `${i}::${path[i]}->${i + 1}::${path[i + 1]}`;
      linkCounts[i].set(key, (linkCounts[i].get(key) || 0) + 1);
    }
  });
  const links = [];
  linkCounts.forEach((map) => map.forEach((count, key) => {
    const [a, b] = key.split('->');
    if (nodeIndex.has(a) && nodeIndex.has(b)) {
      links.push({ source: nodeIndex.get(a), target: nodeIndex.get(b), value: count });
    }
  }));

  const layout = sankey().nodeId((d) => d.index).nodeWidth(12).nodePadding(6)
    .extent([[0, TOP_PAD], [W, H - 10]]);
  const graph = layout({
    nodes: nodes.map((d) => Object.assign({}, d)),
    links: links.map((d) => Object.assign({}, d)),
  });

  gRoot.append('g').selectAll('path').data(graph.links).enter().append('path')
    .attr('class', 'sankey-link')
    .attr('d', sankeyLinkHorizontal())
    .attr('stroke', (d) => (d.source.stage === 0 ? genreColor(d.source.name) : '#c7cdd6'))
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', (d) => Math.max(1, d.width));

  const isActive = (d) => {
    if (d.stage === 0) return s.genres.indexOf(d.name) >= 0;
    if (d.stage === 1) return s.formats.indexOf(d.name) >= 0;
    return false;
  };

  const nodeG = gRoot.append('g').selectAll('g').data(graph.nodes).enter().append('g').attr('class', 'sankey-node');
  const tip = tipFor(host);

  nodeG.append('rect')
    .attr('x', (d) => d.x0).attr('y', (d) => d.y0)
    .attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0))
    .attr('fill', (d) => (d.stage === 0 ? genreColor(d.name) : 'var(--color-neutral-500)'))
    .attr('fill-opacity', (d) => (s.genres.length + s.formats.length === 0 || isActive(d) ? 1 : 0.3))
    .style('cursor', (d) => (d.stage === 2 ? 'default' : 'pointer'))
    .on('mouseenter', (ev, d) => {
      tip.innerHTML = `<b>${d.name}</b>${d.value.toLocaleString()} titles`;
      tip.style.opacity = 1;
      tip.style.left = Math.min(d.x0 + 14, W - 240) + 'px';
      tip.style.top = d.y0 + 'px';
    })
    .on('mouseleave', () => { tip.style.opacity = 0; })
    .on('click', (ev, d) => {
      if (d.stage === 0) {
        const cur = s.genres;
        setFilter({ genres: cur.indexOf(d.name) >= 0 ? cur.filter((x) => x !== d.name) : cur.concat([d.name]) });
      } else if (d.stage === 1) {
        const cur = s.formats;
        setFilter({ formats: cur.indexOf(d.name) >= 0 ? cur.filter((x) => x !== d.name) : cur.concat([d.name]) });
      }
    });

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
