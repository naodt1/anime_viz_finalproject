// One reused absolutely-positioned tooltip div per chart host, created on
// first use. Callers set innerHTML and position; opacity is toggled via CSS
// transition. Always escape untrusted text before injecting.

export function tipFor(host) {
  let tip = host.querySelector('.d3-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'd3-tip';
    host.appendChild(tip);
  }
  return tip;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
