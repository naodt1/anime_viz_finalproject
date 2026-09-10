// Compact number: 1.2M / 240k / 573. Matches the design's fmtN.
export function fmtN(n) {
  if (n >= 1e9) return '∞';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(Math.round(n));
}

// Ordinal with the correct 11th/12th/13th special-casing.
export function ord(n) {
  const v = Math.round(n);
  const r = v % 100;
  const suf = r >= 11 && r <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] || 'th');
  return v + suf;
}

// One-line meta for scatter tips and ranked rows.
export function metaLine(t) {
  return [
    t.format !== 'Other' ? t.format : null,
    t.year || '—',
    t.score.toFixed(2) + ' score',
    fmtN(t.members) + ' votes',
  ].filter(Boolean).join(' · ');
}
