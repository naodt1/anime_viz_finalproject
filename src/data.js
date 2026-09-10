import * as d3 from 'd3';
import { AppState } from './state.js';
import RAW from '../data/anime_data.json';

// Populates AppState from the pre-built dataset (data/anime_data.json).
// Vite bundles the JSON directly, so no fetch/dev-server dependency is
// needed here.
export function loadData() {
  AppState.TOP_GENRES = RAW.genres;
  AppState.SOURCES = RAW.sources;
  AppState.ALL_DATA = RAW.data;

  AppState.filters.genres = new Set(RAW.genres);
  AppState.filters.formats = new Set(AppState.FORMATS);
  AppState.filters.sources = new Set(RAW.sources);
  AppState.filters.yearMin = d3.min(RAW.data, d => d.year);
  AppState.filters.yearMax = d3.max(RAW.data, d => d.year);
  AppState.filters.epMin = 1;
  AppState.filters.epMax = d3.max(RAW.data, d => d.episodes);

  return RAW;
}
