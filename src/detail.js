import * as d3 from 'd3';

let backdrop, modal;

// A single reusable modal, populated per-click rather than rebuilt from
// scratch each time a card renders — cards.js just calls showDetail(d).
export function initDetail() {
  backdrop = d3.select('#modal-backdrop');
  modal = d3.select('#modal');

  backdrop.on('click', evt => {
    if (evt.target === backdrop.node()) hideDetail();
  });
  d3.select(window).on('keydown.detail', evt => {
    if (evt.key === 'Escape') hideDetail();
  });
}

export function showDetail(d) {
  modal.selectAll('*').remove();

  modal.append('button').attr('class', 'modal-close').attr('aria-label', 'Close').text('×').on('click', hideDetail);

  const hero = modal.append('div').attr('class', 'modal-hero');
  hero.append('img').attr('src', d.image).attr('loading', 'lazy');

  const info = hero.append('div').attr('class', 'modal-hero-info');
  info.append('h2').text(d.title);

  const meta = info.append('div').attr('class', 'modal-meta-row');
  meta.append('span').attr('class', 'score').text(`★ ${d.score.toFixed(2)}`);
  meta.append('span').text(`${d3.format(',')(d.members)} members`);
  meta.append('span').text(`${d3.format(',')(d.scoredBy)} ratings`);
  meta.append('span').text(d.type);
  meta.append('span').text(d.episodes === 1 ? '1 episode' : `${d.episodes} episodes`);
  meta.append('span').text(d.year);
  if (d.studio) meta.append('span').text(d.studio);

  info
    .append('div')
    .attr('class', 'modal-genre-row')
    .selectAll('span')
    .data(d.genres)
    .enter()
    .append('span')
    .text(g => g);

  info
    .append('a')
    .attr('class', 'modal-link')
    .attr('href', `https://myanimelist.net/anime/${d.id}`)
    .attr('target', '_blank')
    .attr('rel', 'noopener')
    .text('View on MyAnimeList ↗');

  if (d.synopsis) {
    const synopsisSection = modal.append('div').attr('class', 'modal-section');
    synopsisSection.append('h3').text('Synopsis');
    synopsisSection.append('div').attr('class', 'modal-synopsis').text(d.synopsis);
  }

  if (d.characters && d.characters.length) {
    const castSection = modal.append('div').attr('class', 'modal-section');
    castSection.append('h3').text('Main characters');
    const items = castSection
      .append('div')
      .attr('class', 'modal-characters')
      .selectAll('div.modal-character')
      .data(d.characters)
      .enter()
      .append('div')
      .attr('class', 'modal-character');
    items.append('img').attr('src', c => c.image).attr('loading', 'lazy');
    items.append('div').attr('class', 'name').text(c => c.name);
  }

  backdrop.classed('open', true);
}

function hideDetail() {
  backdrop.classed('open', false);
}
