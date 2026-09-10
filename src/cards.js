import * as d3 from 'd3';
import { AppState } from './state.js';
import { showDetail } from './detail.js';

export function drawCards() {
  const grid = d3.select('#card-grid');
  grid.selectAll('*').remove();

  const top = AppState.brushSelectionData.slice().sort((a, b) => b.score - a.score).slice(0, 18);
  d3.select('#card-stat').text(`${AppState.brushSelectionData.length.toLocaleString()} in zone`);

  if (top.length === 0) {
    grid.append('div').attr('class', 'empty-state').text('Drag a selection box on the scatterplot above to see titles here.');
    return;
  }

  const cards = grid
    .selectAll('div.card')
    .data(top, d => d.id)
    .enter()
    .append('div')
    .attr('class', 'card')
    .on('click', (evt, d) => showDetail(d));

  cards.append('img').attr('src', d => d.image).attr('loading', 'lazy');

  const body = cards.append('div').attr('class', 'body');
  body.append('div').attr('class', 'title').text(d => d.title);

  const meta = body.append('div').attr('class', 'meta');
  meta.append('span').attr('class', 'score').text(d => d.score.toFixed(2));
  meta.append('span').text(d => d3.format('.2s')(d.members));
}
