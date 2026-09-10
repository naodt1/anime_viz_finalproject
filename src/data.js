import RAW from '../data/anime_data.json';
import { ingest } from './ingest.js';
import { binForEpisodes } from './episodeBins.js';

// The bundled dataset (data/anime_data.json, built by data/build-dataset.mjs
// from the Kaggle MAL dump) is the only data path. Vite inlines the JSON, so
// there is no fetch. Map each record onto the shape ingest() expects, then
// derive the gem index.
export function loadData() {
  const titles = RAW.data.map((d) => ({
    id: String(d.id),
    title: d.title,
    score: d.score,
    members: d.members,
    year: d.year || null,
    format: d.type,
    genres: Array.isArray(d.genres) && d.genres.length ? d.genres : (d.primaryGenre ? [d.primaryGenre] : []),
    primaryGenre: d.primaryGenre || (d.genres && d.genres[0]) || 'Other',
    episodes: d.episodes || null,
    episodeBin: d.episodeBin || binForEpisodes(d.episodes),
    studio: d.studio || null,
    synopsis: d.synopsis ? String(d.synopsis).slice(0, 420) : null,
    image: d.image || null,
    characters: d.characters || [],
  }));

  ingest(titles, `MyAnimeList (Kaggle) · ${titles.length.toLocaleString()} titles`);
}
