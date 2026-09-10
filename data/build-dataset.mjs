// Regenerates anime_data.json from the raw MyAnimeList CSV (anime_info.csv).
// Run with: node data/build-dataset.mjs
//
// Unlike the original pipeline, this keeps every genre that appears in the
// filtered data (no top-N cap + "Other" bucket) so the UI can filter/color
// by any genre.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { csvParse } from 'd3-dsv';
import { binForEpisodes } from '../src/episodeBins.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'anime_info.csv');
const CHARACTERS_SRC = join(__dirname, 'characters.csv');
const OUT = join(__dirname, 'anime_data.json');

const FORMATS = new Set(['TV', 'Movie', 'OVA', 'ONA']);
const EXCLUDED_GENRES = new Set(['Hentai', 'Erotica']);
const MIN_SCORED_BY = 300;
const MIN_YEAR = 1970;
const SYNOPSIS_MAX = 600;
const MAX_CHARACTERS_PER_TITLE = 6;
const MIN_SOURCE_COUNT = 150;

function decadeFor(year) {
  if (year < 1980) return 'Pre-1980s';
  const d = Math.floor(year / 10) * 10;
  return `${d}s`;
}

function truncate(text) {
  if (!text) return '';
  const t = text.trim();
  return t.length > SYNOPSIS_MAX ? t.slice(0, SYNOPSIS_MAX) + '...' : t;
}

// Source names are "Last, First" (or just a single name with no comma,
// e.g. mononyms/nicknames like "Vash the Stampede") — flip the former to
// reading order.
function formatCharacterName(name) {
  const commaIndex = name.indexOf(',');
  if (commaIndex === -1) return name;
  const last = name.slice(0, commaIndex).trim();
  const first = name.slice(commaIndex + 1).trim();
  return `${first} ${last}`;
}

const raw = readFileSync(SRC, 'utf-8');
const rows = csvParse(raw);

const genreCounts = new Map();
const titles = [];

for (const row of rows) {
  if (!FORMATS.has(row.type)) continue;

  const scoredBy = +row.scored_by || 0;
  if (scoredBy < MIN_SCORED_BY) continue;

  if (row.content_rating === 'Rx - Hentai') continue;

  let year = +row.year || null;
  if (!year && row.aired_from) year = +row.aired_from.slice(0, 4) || null;
  if (!year || year < MIN_YEAR) continue;

  const score = +row.score;
  const members = +row.members;
  if (!score || !members) continue;

  const genres = (row.genres || '')
    .split('|')
    .map(g => g.trim())
    .filter(Boolean);
  if (genres.length === 0) continue;
  if (genres.some(g => EXCLUDED_GENRES.has(g))) continue;

  genres.forEach(g => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));

  const episodes = +row.episodes || 1;

  titles.push({
    id: +row.mal_id,
    title: row.title,
    image: row.image_url,
    type: row.type,
    episodes,
    episodeBin: binForEpisodes(episodes),
    score,
    members,
    scoredBy,
    year,
    decade: decadeFor(year),
    genres,
    primaryGenre: genres[0],
    studio: (row.studios || '').split('|')[0].trim(),
    source: row.source || 'Unknown',
    synopsis: truncate(row.synopsis)
  });
}

const allGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);

// Rare/junk source values (typos, one-off categories like "Radio", and a
// handful of misparsed rows) get folded into "Other" rather than left as
// their own barely-populated category.
const sourceCounts = new Map();
titles.forEach(t => sourceCounts.set(t.source, (sourceCounts.get(t.source) || 0) + 1));
const keepSources = new Set([...sourceCounts.entries()].filter(([, c]) => c >= MIN_SOURCE_COUNT).map(([s]) => s));
titles.forEach(t => {
  if (!keepSources.has(t.source)) t.source = 'Other';
});
const allSources = [...new Set(titles.map(t => t.source))].sort((a, b) => {
  if (a === 'Other') return 1;
  if (b === 'Other') return -1;
  return (sourceCounts.get(b) || 0) - (sourceCounts.get(a) || 0);
});

// Main-cast characters, joined in from the separate (and much larger)
// characters.csv. Filtered to this build's titles and to "Main" roled
// characters as the row converter runs, so the ~550k-row source file never
// fully materializes in memory as parsed objects — only the handful of
// fields, for the rows we'll actually keep, do. Each character appears
// once per dubbed-language voice actor, so rows are also deduped by
// character_id per anime.
const keepIds = new Set(titles.map(t => t.id));
const charactersByAnime = new Map();
const seenCharacterIds = new Set();

const charactersRaw = readFileSync(CHARACTERS_SRC, 'utf-8');
csvParse(charactersRaw, d => {
  const animeId = +d.mal_id;
  if (d.role !== 'Main' || !keepIds.has(animeId)) return;
  const dedupeKey = animeId + '::' + d.character_id;
  if (seenCharacterIds.has(dedupeKey)) return;
  seenCharacterIds.add(dedupeKey);
  if (!charactersByAnime.has(animeId)) charactersByAnime.set(animeId, []);
  charactersByAnime.get(animeId).push({
    name: formatCharacterName(d.character_name),
    image: d.character_image_url,
    favorites: +d.favorites || 0
  });
});

for (const title of titles) {
  const cast = charactersByAnime.get(title.id) || [];
  cast.sort((a, b) => b.favorites - a.favorites);
  title.characters = cast.slice(0, MAX_CHARACTERS_PER_TITLE).map(({ name, image }) => ({ name, image }));
}

writeFileSync(OUT, JSON.stringify({ genres: allGenres, sources: allSources, data: titles }));

console.log(`Wrote ${titles.length} titles, ${allGenres.length} genres, ${allSources.length} sources to ${OUT}`);
