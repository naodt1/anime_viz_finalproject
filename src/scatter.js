import * as d3 from 'd3';
import { State, isGem, filteredTitles, setState } from './state.js';
import { tipFor, escapeHtml } from './tip.js';
import { fmtN, metaLine } from './format.js';

const M = { t: 12, r: 14, b: 44, l: 46 };
const CAP = 2600; // above this many filtered rows, sample for DOM sanity

let host;
let plottedCount = 0;

export function initScatter(el) {
  host = el;
}

export function scatterPlottedCount() {
  return plottedCount;
}

export function drawScatter() {
  const s = State;
  if (!host || !s.titles.length) return;

  const W = host.clientWidth || 720;
  const H = host.clientHeight || 470;
  const iw = Math.max(80, W - M.l - M.r);
  const ih = Math.max(80, H - M.t - M.b);
  const rows = filteredTitles();

  const x = d3.scaleLog().domain([Math.max(10, s.memMin), Math.max(100, s.memMax)]).range([0, iw]).clamp(true);
  const y = d3.scaleLinear().domain([s.yLo, s.yHi]).range([ih, 0]).clamp(true);

  let svg = d3.select(host).select('svg.sc');
  if (svg.empty()) {
    svg = d3.select(host).append('svg').attr('class', 'sc')
      .style('display', 'block')
      .style('border', '2px solid var(--color-divider)')
      .style('background', 'var(--color-neutral-100)');
    const g = svg.append('g').attr('class', 'in');
    g.append('rect').attr('class', 'zone');
    g.append('text').attr('class', 'zlab');
    g.append('g').attr('class', 'ax gx');
    g.append('g').attr('class', 'ax gy');
    g.append('g').attr('class', 'grid');
    g.append('g').attr('class', 'dots');
    svg.append('text').attr('class', 'xlab');
    svg.append('text').attr('class', 'ylab');
  }
  if (+svg.attr('width') !== W) svg.attr('width', W);
  if (+svg.attr('height') !== H) svg.attr('height', H);
  const g = svg.select('g.in').attr('transform', `translate(${M.l},${M.t})`);

  // underseen quadrant field, inner edges only
  const zx = x(Math.max(10, s.memThresh));
  const zy = y(s.scoreThresh);
  g.select('rect.zone')
    .attr('x', 0).attr('y', 0).attr('width', zx).attr('height', zy)
    .style('fill', 'var(--color-accent)').style('fill-opacity', 0.1)
    .style('stroke', 'var(--color-accent)').style('stroke-width', 2)
    .style('stroke-dasharray', `0,${zx},${zy},9999`);
  g.select('text.zlab')
    .attr('x', 8).attr('y', zy - 8)
    .style('font', '800 11px var(--font-heading)').style('letter-spacing', '0.1em')
    .style('fill', 'var(--color-accent-700)').text('UNDERSEEN QUADRANT');

  // decade ticks only: scaleLog().ticks(n) ignores n and returns every minor tick
  const dom = x.domain();
  const p0 = Math.ceil(Math.log10(dom[0]));
  const p1 = Math.floor(Math.log10(dom[1]));
  let ticks = d3.range(p0, p1 + 1).map((p) => Math.pow(10, p));
  if (ticks.length < 2) ticks = [dom[0], dom[1]];
  const minor = [];
  for (let p = p0 - 1; p <= p1; p++) {
    for (let m = 2; m <= 9; m++) {
      const v = m * Math.pow(10, p);
      if (v > dom[0] && v < dom[1]) minor.push(v);
    }
  }
  g.select('g.gx').attr('transform', `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat((v) => fmtN(v)).tickSizeOuter(0));
  const ml = g.select('g.gx').selectAll('line.minor').data(minor);
  ml.exit().remove();
  ml.enter().append('line').attr('class', 'minor').merge(ml)
    .attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 0).attr('y2', 3)
    .style('stroke', 'var(--color-divider)');
  g.select('g.gy').call(d3.axisLeft(y).ticks(6).tickFormat((v) => v.toFixed(1)).tickSizeOuter(0));

  const gl = g.select('g.grid').selectAll('line').data(ticks);
  gl.enter().append('line').merge(gl)
    .attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 0).attr('y2', ih)
    .style('stroke', 'var(--color-text)').style('stroke-opacity', 0.1);
  gl.exit().remove();

  svg.select('text.xlab').attr('x', M.l).attr('y', H - 6)
    .style('font', '800 11px var(--font-heading)').style('letter-spacing', '0.1em')
    .style('fill', 'var(--color-neutral-700)').text('AUDIENCE SIZE (LOG) →');
  svg.select('text.ylab').attr('transform', `translate(12,${M.t + ih / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .style('font', '800 11px var(--font-heading)').style('letter-spacing', '0.1em')
    .style('fill', 'var(--color-neutral-700)').text('SCORE →');

  // sample above the cap, always keeping every gem
  let plot = rows;
  if (rows.length > CAP) {
    const gems = rows.filter(isGem);
    const rest = rows.filter((t) => !isGem(t));
    const keep = Math.max(0, CAP - Math.min(gems.length, CAP));
    const step = rest.length / Math.max(1, keep);
    const samp = [];
    for (let i = 0; i < keep; i++) samp.push(rest[Math.floor(i * step)]);
    plot = gems.slice(0, CAP).concat(samp);
  }
  plottedCount = plot.length;

  const tip = tipFor(host);
  const size = (d) => (s.selId === d.id ? 16 : isGem(d) ? 9 : 6);
  const dots = g.select('g.dots').selectAll('rect').data(plot, (d) => d.id);
  dots.exit().remove();
  dots.enter().append('rect')
    .on('mouseenter', (ev, d) => {
      tip.innerHTML = `<b>${escapeHtml(d.title)}</b>${escapeHtml(metaLine(d))}`
        + `<i>Underseen index ${d.gem > 0 ? '+' : ''}${d.gem}</i>`;
      const px = M.l + x(d.members);
      const py = M.t + y(d.score);
      tip.style.opacity = 1;
      tip.style.left = Math.min(px + 12, W - 250) + 'px';
      tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + 'px';
    })
    .on('mouseleave', () => { tip.style.opacity = 0; })
    .on('click', (ev, d) => setState({ selId: d.id }))
    .merge(dots)
    .attr('width', size).attr('height', size)
    .attr('x', (d) => x(d.members) - size(d) / 2)
    .attr('y', (d) => y(d.score) - size(d) / 2)
    .style('cursor', 'pointer')
    .style('fill', (d) => (s.selId === d.id ? 'var(--color-text)' : isGem(d) ? 'var(--color-accent)' : 'var(--color-neutral-600)'))
    .style('fill-opacity', (d) => (s.selId === d.id ? 1 : isGem(d) ? 0.95 : 0.45))
    .style('stroke', (d) => (s.selId === d.id ? 'var(--color-text)' : isGem(d) ? 'var(--color-accent-700)' : 'none'))
    .style('stroke-width', 1);

  // paint order: selected above gems above the rest
  g.select('g.dots').selectAll('rect').sort((a, b) => (
    (s.selId === a.id ? 2 : isGem(a) ? 1 : 0) - (s.selId === b.id ? 2 : isGem(b) ? 1 : 0)
  ));
}
