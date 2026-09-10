# Underseen

An interactive visualization for discovering critically well-regarded but under-viewed anime that match your personal taste.

## Research question

Existing anime platforms rank titles by popularity, which conflates being widely seen with being well-liked. This project asks: can we help anime fans discover critically well-regarded but under-viewed titles that also match their personal taste (genre, format, era)?

## The underseen index

Popularity rankings conflate *widely seen* with *well liked*. Underseen separates the two. In one pass over the full dataset every title gets:

```
sp  = percentile rank of its score      (0-100)
mp  = percentile rank of its audience    (0-100)   // members on MyAnimeList
gem = round(sp - mp)                               // the underseen index
```

A title in the 95th percentile for score but the 20th for audience scores +75; a blockbuster with a mediocre score goes negative. A title is in the **underseen quadrant** when `sp >= 70 && mp <= 40`: top 30% by score, bottom 40% by audience. Percentiles are computed once on the full dataset, so filtering changes what you see, never where a title sits.

## Views

One screen: a header, a persistent left filter rail, a stack of sections, and a right detail drawer that overlays.

- **Score against audience size** (D3 scatter). Each square is a title, audience on a log x-axis, score on y. The red field is the underseen quadrant. Above 2,600 filtered rows the plot samples, always keeping every gem. Hover for detail, click to open the drawer.
- **Where the gems hide** (D3 heatmap). Ten most frequent genres by five fixed eras. Each cell is the share of that genre and era that lands in the underseen quadrant, computed over the full dataset. Cells with fewer than five titles are hatched, not shown as a misleading percentage. Click a cell to cross-filter everything to that genre and decade.
- **Recommended, ranked**. Filtered titles with `gem > 0 && sp >= 60`, ranked by `gem` weighted by taste match when genres are selected (`gem * (0.45 + 0.55 * match)`). Top 12, click through to the drawer.
- **What kinds of anime are underseen?** (D3 Sankey). Genre, then format, then episode length, for the titles in the underseen quadrant under the current filters. Click a genre or format node to filter to it.
- **Detail drawer**. Percentile stats, the plain-language reading, synopsis, cover art.
- **How the index works**. The methods statement, in prose.

Interaction: faceted filtering (genre and format chips, era, minimum score, and audience-ceiling sliders in the rail), cross-filtering (heatmap cells and Sankey nodes drive every other view), and detail-on-demand (hover tooltips, the click-through drawer).

## Design

The look comes from a bound design system (**Modernist**): Archivo type, a single red accent used sparingly, zero border radius, 2px rules, everything flush left. Tokens live in `style.css` (`--color-*`, `--space-*`) and are copied verbatim from the design handoff in `design/`. See `design README.md` for the full spec; `design/` holds the original HTML prototype and is a reference, not production code.

## Data

Source: [Comprehensive MyAnimeList (MAL) Dataset 2026](https://www.kaggle.com/datasets/nafiulislam490/comprehensive-myanimelist-mal-dataset-2026?resource=download) on Kaggle.

The raw CSVs are not committed because of their size. Download them from the link above and place them in `data/` to regenerate the processed dataset. The app only needs `data/anime_data.json`, a pre-built subset that is checked in. It is produced by `data/build-dataset.mjs` from `data/anime_info.csv` and `data/characters.csv`, keeping titles that are:

- format TV, Movie, OVA, or ONA
- rated by at least 300 users
- released in 1970 or later

## Setup

```bash
npm install
npm start
```

Then open http://localhost:5173.

## Regenerating the dataset

Download `anime_info.csv` and `characters.csv` from the Kaggle dataset into `data/`, then:

```bash
npm run build-dataset
```

This rewrites `data/anime_data.json`.

## Build

```bash
npm run build
```

Outputs a static site to `dist/`.

## Stack

Vite, D3, d3-sankey. No framework, plain ES modules. A small `State` object with a render subscription (`src/state.js`) stands in for the design prototype's React component.
