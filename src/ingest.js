import { setState } from './state.js';

// One pass over the FULL dataset (never a filtered subset, this is the
// load-bearing methodological decision from the design README):
//
//   sp  = percentile rank of this title's score    (0-100)
//   mp  = percentile rank of this title's members  (0-100)
//   gem = round(sp - mp)                            // the underseen index
//
// Filtering never recomputes these. Filters change what is shown, never where
// a title sits.

function percentileFn(sortedAsc) {
  return (v) => {
    let lo = 0;
    let hi = sortedAsc.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedAsc[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return sortedAsc.length < 2 ? 50 : (lo / (sortedAsc.length - 1)) * 100;
  };
}

function quantile(sortedAsc, p) {
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[i];
}

export function ingest(titles, source) {
  const scores = titles.map((t) => t.score).sort((a, b) => a - b);
  const mems = titles.map((t) => t.members).sort((a, b) => a - b);
  const pctScore = percentileFn(scores);
  const pctMem = percentileFn(mems);

  const rows = titles.map((t) => {
    const sp = pctScore(t.score);
    const mp = pctMem(t.members);
    return Object.assign({}, t, { sp, mp, gem: Math.round(sp - mp) });
  });

  const years = rows.map((r) => r.year).filter(Boolean);
  const yearFloor = years.length ? Math.max(1917, Math.min(...years)) : 1960;
  const yearCeil = years.length ? Math.max(...years) : 2026;

  const scoreMax = scores[scores.length - 1] > 5.2 ? 10 : 5;

  setState({
    titles: rows,
    source,
    error: '',
    scoreThresh: quantile(scores, 0.70),
    memThresh: quantile(mems, 0.40),
    memMin: Math.max(10, mems[0]),
    memMax: mems[mems.length - 1],
    scoreMax,
    yLo: Math.max(0, Math.floor((scores[0] - 0.3) * 2) / 2),
    yHi: Math.min(scoreMax, Math.ceil((scores[scores.length - 1] + 0.2) * 2) / 2),
    yearFloor,
    yearCeil,
    yearFrom: yearFloor,
    yearTo: yearCeil,
    genres: [],
    formats: [],
    minScore: 0,
    maxMembersLog: Math.log10(mems[mems.length - 1]) + 0.05,
    selId: null,
  });
}
