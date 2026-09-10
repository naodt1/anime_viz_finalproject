// Shared mutable state, imported by every module so views stay in sync
// without a framework. Kept intentionally simple (no store/reducer) since
// the app has a single, flat view hierarchy.

export const AppState = {
  TOP_GENRES: [],
  SOURCES: [],
  ALL_DATA: [],
  FORMATS: ['TV', 'Movie', 'OVA', 'ONA'],

  filters: {
    genres: new Set(),
    formats: new Set(),
    sources: new Set(),
    yearMin: 0,
    yearMax: 0,
    epMin: 1,
    epMax: 0
  },

  filteredData: [],
  brushSelectionData: [],

  // populated by scatter.js, read by sankey.js/cards.js indirectly via
  // brushSelectionData, and directly by scatter.js itself on re-brush
  scatterX: null,
  scatterY: null
};
