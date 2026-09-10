import * as d3 from 'd3';

const tooltip = d3.select('#tooltip');

export function showTip(html, evt) {
  tooltip
    .style('opacity', 1)
    .html(html)
    .style('left', evt.clientX + 14 + 'px')
    .style('top', evt.clientY + 10 + 'px');
}

export function hideTip() {
  tooltip.style('opacity', 0);
}
