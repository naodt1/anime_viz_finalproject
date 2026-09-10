# Hidden Gem Finder

An interactive visualization for discovering critically well-regarded but under-viewed anime that match your personal taste.

## Research question

Existing anime platforms rank titles by popularity, which conflates being widely seen with being well-liked. This project asks: can we help anime fans discover critically well-regarded but under-viewed titles that also match their personal taste (genre, format, era)?

## What it does

The core idea is to separate the two things popularity conflates. Every anime is plotted on a scatterplot with audience size (`members`, log-scaled) on the x-axis and score on the y-axis. Dragging a box on that plot defines a "gem zone", by default the top score quartile intersected with the bottom members quartile of whatever is currently filtered. Everything else on the page updates to that selection.

Coordinated views:

- **Release era**: bar chart of titles per year, brush a year range to filter every view below.
- **Score vs. audience size**: the scatterplot and its gem-zone brush.
- **Where do gems come from?**: a strip plot of titles by score, one row per source material.
- **What kinds of anime end up in your gem zone?**: a Sankey diagram of genre, format, and episode length for the current selection.
- **Which genre x format combos are gems?**: a heatmap where cell shade is the share of that combo inside the gem zone.
- **Titles in your selection**: a card grid of the highest-scoring picks, click a card for synopsis, characters, studio, and a MyAnimeList link.

Interaction: filter by genre, format, and episode count from the sidebar; brush the timeline for era; click a Sankey node or a strip-plot row to isolate it; hover anything for details; the scatterplot brush links to every other view.

## Data

Source: [Comprehensive MyAnimeList (MAL) Dataset 2026](https://www.kaggle.com/datasets/nafiulislam490/comprehensive-myanimelist-mal-dataset-2026?resource=download) on Kaggle.

The raw CSVs are not committed to this repository because of their size. Download them from the link above and place them in `data/` if you want to regenerate the processed dataset.

The app itself only needs `data/anime_data.json`, a pre-built subset that is checked in. It is produced by `data/build-dataset.mjs` from `data/anime_info.csv` and `data/characters.csv`, keeping titles that are:

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

Vite, D3, d3-sankey. No framework, plain ES modules.
