// Episode-count bins matching common anime release patterns rather than
// even-width buckets: 1 episode is overwhelmingly movies/specials, 12-13
// is a standard broadcast "cour" (~3 months), 24-26 is the classic
// two-cour season, and so on. Shared between the Node data-build script
// (data/build-dataset.mjs, which precomputes each title's bin) and the
// browser app (the sankey's Episodes column, and its click-to-isolate
// filter), so the definition only lives in one place.
export const EPISODE_BINS = [
  { label: 'Movie / special', min: 1, max: 1 },
  { label: 'Short (2–6)', min: 2, max: 6 },
  { label: 'One cour (7–13)', min: 7, max: 13 },
  { label: 'Two cours (14–26)', min: 14, max: 26 },
  { label: 'Extended (27–52)', min: 27, max: 52 },
  { label: 'Long-running (53+)', min: 53, max: Infinity }
];

export function binForEpisodes(episodes) {
  const bin = EPISODE_BINS.find(b => episodes >= b.min && episodes <= b.max);
  return bin ? bin.label : EPISODE_BINS[EPISODE_BINS.length - 1].label;
}
