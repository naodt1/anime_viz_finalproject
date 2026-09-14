import * as d3 from 'd3';
import { State, isGem, setFilter } from './state.js';
import { tipFor } from './tip.js';

const RH = 30;
const GAP = 2;
const TOP = 20;
const LOW_N = 5;

let host;

export function initHeatmap(el) {
  host = el;
}

function eras() {
  const s = State;
  return [
    { label: 'pre-90', lo: 0, hi: 1989 },
    { label: '1990s', lo: 1990, hi: 1999 },
    { label: '2000s', lo: 2000, hi: 2009 },
    { label: '2010s', lo: 2010, hi: 2019 },
    { label: '2020s', lo: 2020, hi: 2100 },
  ].filter((e) => e.hi >= (s.yearFloor || 0) && e.lo <= (s.yearCeil || 2100));
}

// Ten most frequent genres across the full dataset.
function topGenres() {
  const c = {};
  for (const t of State.titles) for (const g of t.genres) c[g] = (c[g] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 10);
}

const shade = (ratio) => (
  ratio === null ? 'url(#hatch)'
    : ratio === 0 ? 'var(--color-neutral-100)'
      : ratio < 0.34 ? 'var(--color-accent-200)'
        : ratio < 0.58 ? 'var(--color-accent-300)'
          : ratio < 0.80 ? 'var(--color-accent-500)'
            : 'var(--color-accent-800)'
);

export function drawHeatmap() {
  const s = State;
  if (!host || !s.titles.length) return;

  const genres = topGenres();
  const es = eras();
  const W = host.clientWidth || 420;
  const L = 116;
  const cw = Math.max(28, (W - L - GAP * es.length) / es.length);
  const H = TOP + genres.length * (RH + GAP);

  // Cell rate is computed over the FULL dataset, not the filtered subset.
  // Shade is normalized per column (era), not against the matrix-wide max:
  // eras differ enormously in absolute gem rate (a sparse pre-90 slate reads
  // pale next to a crowded 2020s one under a single global scale even when
  // pre-90 has real internal variation worth seeing), so each column's own
  // highest-rate cell gets the darkest shade. The cell's printed percentage
  // is always the true, un-normalized rate — only the fill color is relative.
  const cells = [];
  const colMax = es.map(() => 0);
  genres.forEach((k, r) => es.forEach((e, c) => {
    const inCell = s.titles.filter((t) => t.genres.indexOf(k) >= 0 && t.year && t.year >= e.lo && t.year <= e.hi);
    const gems = inCell.filter(isGem).length;
    const rate = inCell.length >= LOW_N ? gems / inCell.length : null;
    if (rate !== null && rate > colMax[c]) colMax[c] = rate;
    cells.push({ k, e, r, c, n: inCell.length, gems, rate });
  }));

  let svg = d3.select(host).select('svg.hm');
  if (svg.empty()) {
    svg = d3.select(host).append('svg').attr('class', 'hm').style('display', 'block');
    const defs = svg.append('defs');
    const p = defs.append('pattern').attr('id', 'hatch').attr('width', 6).attr('height', 6)
      .attr('patternTransform', 'rotate(45)').attr('patternUnits', 'userSpaceOnUse');
    p.append('rect').attr('width', 6).attr('height', 6).style('fill', 'var(--color-neutral-100)');
    p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
      .style('stroke', 'var(--color-neutral-300)').style('stroke-width', 3);
    svg.append('g').attr('class', 'cols');
    svg.append('g').attr('class', 'rows');
    svg.append('g').attr('class', 'cells');
  }
  svg.attr('width', W).attr('height', H);

  const cl = svg.select('g.cols').selectAll('text').data(es, (d) => d.label);
  cl.exit().remove();
  cl.enter().append('text').merge(cl)
    .attr('x', (d, i) => L + i * (cw + GAP)).attr('y', 12)
    .attr('class', 'sankey-col-label')
    .text((d) => d.label.toUpperCase());

  const rl = svg.select('g.rows').selectAll('text').data(genres, (d) => d);
  rl.exit().remove();
  rl.enter().append('text').merge(rl)
    .attr('x', 0).attr('y', (d, i) => TOP + i * (RH + GAP) + RH / 2 + 4)
    .style('font', '800 12px var(--font-heading)').style('fill', 'var(--color-text)')
    .style('cursor', 'pointer')
    .on('click', (ev, d) => {
      const cur = s.genres;
      setFilter({ genres: cur.indexOf(d) >= 0 ? cur.filter((x) => x !== d) : cur.concat([d]) });
    })
    .text((d) => d);

  const tip = tipFor(host);
  const isActive = (k, e) => s.genres.length === 1 && s.genres[0] === k
    && s.yearFrom === Math.max(s.yearFloor, e.lo) && s.yearTo === Math.min(s.yearCeil, e.hi);

  const gsel = svg.select('g.cells').selectAll('g.cell').data(cells, (d) => d.k + '|' + d.e.label);
  gsel.exit().remove();
  const ent = gsel.enter().append('g').attr('class', 'cell');
  ent.append('rect');
  ent.append('text');
  const all = ent.merge(gsel)
    .attr('transform', (d) => `translate(${L + d.c * (cw + GAP)},${TOP + d.r * (RH + GAP)})`)
    .style('cursor', (d) => (d.rate === null ? 'default' : 'pointer'))
    .on('mouseenter', (ev, d) => {
      tip.innerHTML = `<b>${d.k} · ${d.e.label}</b>`
        + (d.n ? `${d.gems} hidden gems of ${d.n} titles` : 'no titles')
        + (d.rate === null && d.n ? '<i>too few to rate</i>' : '');
      tip.style.opacity = 1;
      tip.style.left = Math.min(L + d.c * (cw + GAP) + 10, W - 240) + 'px';
      tip.style.top = (TOP + d.r * (RH + GAP) + RH + 6) + 'px';
    })
    .on('mouseleave', () => { tip.style.opacity = 0; })
    .on('click', (ev, d) => {
      if (d.rate === null) return;
      const on = isActive(d.k, d.e);
      setFilter({
        genres: on ? [] : [d.k],
        yearFrom: on ? s.yearFloor : Math.max(s.yearFloor, d.e.lo),
        yearTo: on ? s.yearCeil : Math.min(s.yearCeil, d.e.hi),
      });
    });
  const normalized = (d) => (colMax[d.c] ? d.rate / colMax[d.c] : 0);
  all.select('rect').attr('width', cw).attr('height', RH)
    .style('fill', (d) => (d.rate === null ? 'url(#hatch)' : shade(normalized(d))))
    .style('stroke', (d) => (isActive(d.k, d.e) ? 'var(--color-text)' : 'none'))
    .style('stroke-width', 2);
  all.select('text').attr('x', 6).attr('y', RH / 2 + 4)
    .style('font', '800 11px var(--font-heading)')
    .style('fill', (d) => (d.rate !== null && normalized(d) >= 0.8 ? 'var(--color-neutral-100)' : 'var(--color-text)'))
    .text((d) => (d.rate === null ? '' : Math.round(d.rate * 100) + '%'));
}
