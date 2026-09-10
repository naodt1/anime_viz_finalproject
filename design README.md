# Handoff: Underseen — anime discovery visualization

## Overview

Underseen is a data-visualization dashboard for a course/research project. It answers one question: **can anime fans discover critically well-regarded but under-viewed titles that also match their personal taste (genre, format, era)?**

Existing platforms rank by popularity, which conflates *widely seen* with *well liked*. Underseen separates the two by scoring every title on an **underseen index** (score percentile minus audience percentile) and lets a user filter that space by their own taste. It satisfies a rubric requiring at least two combined visualization techniques and at least one interaction technique for filtering or detail-on-demand — it ships three interaction techniques (faceted filtering, brush-free cross-filtering, and detail-on-demand).

## About the design files

The files in `design/` are **design references created in HTML** — a working prototype that shows the intended look, data model and behavior. They are not production code to copy directly.

`design/Underseen.dc.html` is authored in a proprietary streaming-component format: a single HTML file holding a template plus a `class Component extends DCLogic` logic class, mounted by `design/support.js`. **Do not port that runtime.** Treat the file as the spec: the template is the markup and inline styling, the logic class is the data pipeline, the D3 code is production-ready and transfers almost verbatim.

The task is to **recreate this design in the target codebase's existing environment** using its established patterns and libraries. If no environment exists yet, the natural choice is **React + TypeScript + Vite + d3** — the logic class maps 1:1 onto a React function component, and D3 is already the rendering engine for both charts.

## Fidelity

**High fidelity.** Colors, typography, spacing, rules and interaction states are final and come from a bound design system (Modernist). Recreate the UI pixel-accurately using the tokens in `design/_ds/modernist-*/styles.css`; do not substitute a different palette or type scale. The one deliberately unfinished area is imagery — see **Assets**.

## Data

### Source

Kaggle: *Comprehensive MyAnimeList (MAL) Dataset 2026* (`nafiulislam490/comprehensive-myanimelist-mal-dataset-2026`). The bundle contains more than one table. Two shapes matter:

1. **Per-anime table (preferred).** One row per series, with a title, a score, an audience-size column (`members` / `scored_by` / `num_list_users`), plus `genres`, `type`, year, `episodes`, `studios`, `synopsis` and a cover-image URL. This is the table the design is built for — genre/format/era filtering and taste matching all depend on it.
2. **Per-episode table.** One row per episode (~109k rows in the copy used during design; `mal_id, anime_title, episode_number, episode_title, …`, scores on a **0–5** scale). The prototype detects this shape and aggregates to one row per series: mean episode score, `score_votes` summed as the only available audience proxy, earliest air date as the year. It carries no genres or format, so taste matching degrades — see **Degraded modes**.

The dataset is not bundled here (it is too large and it is Kaggle-licensed). Download it from Kaggle. In the prototype the user loads a CSV at runtime through a file input; the file is parsed in the browser and never uploaded anywhere. Keep that property — it matters for a course submission that must run from a static host.

### Ingest contract

`design/csv.js` is plain ES-module JavaScript with no dependencies and **transfers as-is**. It exports:

- `parseCSV(text, maxRows)` — a tolerant RFC-4180-ish parser (quoted fields, escaped `""`, CRLF).
- `mapRows(rows)` → `{ titles, mapping, skipped, scoreMax }` — fuzzy column mapping with exact-match-then-substring resolution against a candidate list per field.

Candidate column names, in priority order:

| Field | Candidates |
| --- | --- |
| `title` | `title_english`, `english_title`, `title`, `name`, `title_romaji`, `anime_title` |
| `score` | `score`, `mean_score`, `average_score`, `rating`, `mal_score`, `weighted_score` |
| `members` | `members`, `member_count`, `popularity_members`, `scored_by`, `num_scoring_users`, `num_list_users`, `users`, `score_votes`, `votes`, `favorites` |
| `genres` | `genres`, `genre`, `genre_list`, `tags`, `themes` |
| `format` | `type`, `media_type`, `format`, `anime_type` |
| `year` | `year`, `start_year`, `release_year`, `premiered`, `aired_from`, `start_date`, `aired`, `season_year` |
| `episodes` | `episodes`, `num_episodes`, `episode_count` |
| `studio` | `studios`, `studio`, `producer`, `producers` |
| `synopsis` | `synopsis`, `description`, `overview`, `about` |
| `image` | `image_url`, `main_picture`, `picture_url`, `cover_image`, `cover_url`, `picture`, `cover`, `img_url`, `image`, `poster` |

Normalization rules already implemented and worth preserving:

- Column names are normalized to `[a-z0-9_]` before matching.
- `title`, `score` and `members` are **required**; if any is unresolved, throw an error that names the missing fields *and* lists the file's actual headers. Graders and users both need that message.
- Genres split on `,` `|` `;` `/`, strip `[] {} ' "`, drop `nan`/`unknown`, and Title-Case each token.
- Year is a `(19|20)\d{2}` regex over whatever the date-ish column holds.
- Format normalizes to `TV | Movie | OVA | ONA | Special | Music | Other` by substring.
- Image cells may hold a JSON blob of sizes; a bare `https?://…` is extracted with a regex.
- Rows with no title, a non-finite or non-positive score, or members `< 1` are skipped and counted (`skipped`) rather than silently dropped.
- `scoreMax` is inferred: max observed score `> 5.2` → a 0–10 scale, else 0–5. Slider bounds and the y-axis domain follow it.
- An episode-level file is detected by the presence of an `episode_number` / `episode_id` / `episode` column and routed through the aggregator. If the aggregated rows have too few usable vote counts (fewer than max(20, 10%) with `votes ≥ 1`), throw an explicit error telling the user to load the per-anime table instead — an audience measure is structurally required by the whole project.

### Derived model

One ingest pass computes, over the **full dataset** (never the filtered subset — this is the load-bearing methodological decision):

```
sp   = percentile rank of this title's score      (0–100)
mp   = percentile rank of this title's members    (0–100)
gem  = round(sp - mp)                             // the underseen index
```

Percentiles come from a binary search into the pre-sorted score and members arrays. Also computed once:

- `scoreThresh` = 70th-percentile score, `memThresh` = 40th-percentile members — these draw the quadrant.
- `memMin` (clamped to ≥ 10), `memMax` — the log x domain and the audience-ceiling slider bounds.
- `yLo = max(0, floor((minScore - 0.3) * 2) / 2)`, `yHi = min(scoreMax, ceil((maxScore + 0.2) * 2) / 2)` — the y domain, snapped to half-points.
- `yearFloor` (clamped to ≥ 1917), `yearCeil`.

**A title is a gem when `sp >= 70 && mp <= 40`** — top 30% by score, bottom 40% by audience. That predicate is used by the scatter fill, the counter, and the heatmap numerator; keep it in one place.

Filtering never recomputes percentiles. Filters change what is *shown*, never where a title *sits*.

## Screens / views

One screen, no routing. A fixed header, a persistent left filter rail, a main column of three sections, and a right detail drawer that overlays.

### Layout

```
┌──┬──────────────────────────────────────────────────────┐
│ス│ header: kicker + wordmark + blurb | dataset panel    │  border-bottom 2px solid --color-text
├──┴──────────────────────────────────────────────────────┤
│ error strip (conditional)                               │
├────────────┬────────────────────────────────────────────┤
│ filter rail│ § Score against audience size (scatter)    │
│ 262px      │────────────────────────────────────────────│
│ flex 0 0   │ § Where the gems hide │ § Recommended,     │
│ min 232px  │   (heatmap)           │   ranked (list)    │
│ border-    │───────────────────────┴────────────────────│
│ right 2px  │ § How the index works (3-column prose)     │
└────────────┴────────────────────────────────────────────┘
                                    ┌───────────────────┐
                                    │ detail drawer     │ fixed, right, 380px
                                    │ max-width 92vw    │ border-left 2px --color-text
                                    └───────────────────┘ shadow-lg, z-index 200
```

The whole page is fluid: `display: flex; flex-wrap: wrap` at every level, main column `flex: 1 1 560px; min-width: 0`, the two lower sections `flex: 1 1 400px` / `flex: 1 1 380px`. Nothing has a fixed width except the rail and the drawer. Section dividers are `2px solid var(--color-divider)`.

### Header

- **Vertical spine**, `flex: 0 0 46px`, `background: var(--color-accent)`, `color: var(--color-bg)`. Inside: `writing-mode: vertical-rl`, Noto Sans JP 700, 19px, `letter-spacing: 0.22em`, text `隠れた名作` ("hidden masterpiece"). Runs the full header height.
- **Kicker row**: 12px/800, `letter-spacing: 0.14em`, uppercase, `var(--color-accent-700)`, text `Acclaim vs. exposure`; followed by a flexible 3px "speed line" rule at `opacity: 0.35` — `repeating-linear-gradient(90deg, var(--color-text) 0 2px, transparent 2px 9px)`.
- **Wordmark**: `UNDERSEEN`, Archivo 800 **italic**, `clamp(40px, 6vw, 68px)`, `line-height: 0.95`, `letter-spacing: -0.035em`, uppercase.
- **Blurb**: 15px, `max-width: 64ch`, `text-wrap: pretty`. Exact copy:
  > Popularity rankings conflate widely seen with well liked. Every title here is placed by how well it scored against how many people actually watched it, so the gap becomes visible and filterable by genre, format and era.
- **Dataset panel**: `border: 2px solid var(--color-text)`, `background-color: var(--color-neutral-100)` overlaid with a screentone dot pattern — `background-image: radial-gradient(var(--color-accent-300) 1.4px, transparent 1.5px); background-size: 7px 7px`. Contains an uppercase 11px `Dataset` label, the current source string in 13px/800, a `.btn.btn-primary` file-input label reading **Load your CSV** (a transparent `<input type="file">` fills the label), and an 11px `var(--color-neutral-700)` mapping note.

The mapping note has two states. Before any upload:
> Use the per-anime table (score + members/scored_by + genres + type + year); an episode-level file is aggregated to one row per series. Read in your browser — nothing is uploaded.

After a successful upload, it lists the resolved mapping, e.g. `Mapped: title → title_english, score → score, members → members, … · 812 rows skipped`.

### Filter rail (the interaction techniques)

262px, `border-right: 2px solid var(--color-divider)`, `padding: 24px 16px 32px`. Header row: `Your taste` (13px/800, `letter-spacing: 0.1em`, uppercase) with a `.btn.btn-ghost` **Reset** at 11px on the right. Sub-line: "Filters narrow both charts and the ranking at once."

Controls, in order, each preceded by an 11px/800 uppercase `var(--color-neutral-700)` label:

| Control | Type | Behavior |
| --- | --- | --- |
| Genre | up to 20 toggle chips, ordered by frequency in the dataset | multi-select OR; `title` attr shows the title count |
| Format | toggle chips from observed formats, `Other` excluded, max 8 | multi-select OR |
| Era | **two** range inputs (from / to), `min=yearFloor max=yearCeil step=1` | current value shown right-aligned as `1979–2026`; the from-slider clamps to `≤ yearTo`, the to-slider to `≥ yearFrom` |
| Minimum score | range, `0 … scoreCeil`, step `0.1` (0–10 data) or `0.05` (0–5 data) | label reads `8.2+` or `any` at 0 |
| Audience ceiling | range over `log10(members)`, `min=log10(memMin) max=log10(memMax)+0.05 step=0.05` | label reads `≤ 240k`; sub-line "Drag left to hide the blockbusters entirely." |

Chip states: unselected `background: transparent; color: var(--color-text); border: 1px solid var(--color-divider)`; selected `background: var(--color-accent); color: var(--color-bg); border-color: var(--color-accent)`; hover `border-color: var(--color-accent)`. 12px/600, `padding: 5px 9px`, zero radius.

Foot of the rail: `.hr` then a two-up counter grid — 30px/800 numbers over 11px/800 uppercase labels. Left is **In view** in ink, right is **Underseen** in `var(--color-accent-700)`. Both are `toLocaleString()`-formatted.

Predicate (all conjunctive, genre/format internally disjunctive):

```
score >= minScore
members <= 10 ** maxMembersLog
(!year) || (year >= yearFrom && year <= yearTo)     // undated titles are never excluded
formats.length === 0 || formats.includes(t.format)
genres.length === 0 || t.genres.some(g => genres.includes(g))
```

Any filter change also clears the current selection (`selId: null`).

### Visualization 1 — score against audience size (D3 scatter)

Section header 24px/800, `letter-spacing: -0.015em`. Sub-line, `max-width: 70ch`, `var(--color-neutral-700)`:
> Each mark is one title. Horizontal is audience on a log scale, vertical is score. The red field is the underseen quadrant: top 30% by score, bottom 40% by audience. Hover for detail, click to open a title.

A right-aligned 11px/800 uppercase status reads either `1,204 titles plotted` or `showing 2,600 of 18,412 marks`.

Host: `position: relative; width: 100%; height: 470px`. D3 renders one `<svg>` with `border: 2px solid var(--color-divider)`, `background: var(--color-neutral-100)`.

- Margins `{ t: 12, r: 14, b: 44, l: 46 }`.
- `x = d3.scaleLog().domain([max(10, memMin), max(100, memMax)]).range([0, iw]).clamp(true)`
- `y = d3.scaleLinear().domain([yLo, yHi]).range([ih, 0]).clamp(true)`
- **Quadrant field**: a rect from the origin corner to `(x(memThresh), y(scoreThresh))`, `fill: var(--color-accent)` at `fill-opacity: 0.1`, `stroke: var(--color-accent)` 2px drawn only on the two inner edges (via `stroke-dasharray`). Label `UNDERSEEN QUADRANT` in 11px/800 Archivo, `letter-spacing: 0.1em`, `var(--color-accent-700)`, at `x=8, y=y(scoreThresh)-8`.
- **Axes**: `scaleLog().ticks(n)` ignores `n` and returns every minor tick, which collides badly. Build tick values explicitly from decades — `d3.range(ceil(log10(d0)), floor(log10(d1)) + 1).map(p => 10 ** p)` — label them with a compact formatter (`10k`, `1.0M`), and add unlabelled 3px minor ticks at `2…9 × 10^p`. Vertical gridlines use the **same decade values**, `stroke: var(--color-text)` at `stroke-opacity: 0.1`. Axis text 11px/600 `var(--color-neutral-700)`; axis lines/paths `var(--color-divider)`. Y axis: 6 ticks, one decimal.
- **Axis titles**: `AUDIENCE SIZE (LOG) →` bottom-left, `SCORE →` rotated -90° at the left edge, both 11px/800 Archivo, `letter-spacing: 0.1em`.
- **Marks** are `<rect>`s, not circles — squares suit the system's zero-radius geometry.

| State | Size | Fill | Opacity | Stroke |
| --- | --- | --- | --- | --- |
| Selected | 16px | `var(--color-text)` | 1 | `var(--color-text)` 1px |
| Gem | 9px | `var(--color-accent)` | 0.95 | `var(--color-accent-700)` 1px |
| Other | 6px | `var(--color-neutral-600)` | 0.45 | none |

Marks are re-sorted each draw so selected paints above gems above the rest. Above 2,600 filtered rows the plot **samples**: all gems are kept, the remainder is evenly strided to fill the budget, and the status line reports the sampling. Keying the data join on `id` keeps enter/update/exit cheap.

### Visualization 2 — where the gems hide (D3 heatmap)

Sub-line:
> Share of titles in each genre and era that land in the underseen quadrant. Click a cell to filter everything to that genre and decade.

Rows are the **10 most frequent genres**; columns are fixed eras `pre-90 | 1990s | 2000s | 2010s | 2020s`, filtered to those intersecting the dataset's year span. Geometry: row-label gutter `L = 116` (92 in the fallback mode), row height 30, gap 2, top band 20 for column labels; column width `(W - L - gap*n) / n`, min 28. Column labels 11px/800 uppercase `var(--color-neutral-700)`; row labels 12px/800 ink, clickable (toggles that genre).

Each cell counts titles matching *(genre, era)* **over the full dataset** and divides gems by total. Cells with fewer than 5 titles render `null` — a 45°-rotated hatch pattern (`var(--color-neutral-300)` 3px lines on `var(--color-neutral-100)`, 6px tile) and no label — rather than a misleading percentage. Otherwise the cell shows `round(rate*100) + "%"` in 11px/800.

Fill is a five-step ramp on `rate / maxRate` so the strongest cell in the current view is always the darkest:

| Ratio | Fill | Label color |
| --- | --- | --- |
| `null` | `url(#hatch)` | — |
| `0` | `var(--color-neutral-100)` | `var(--color-text)` |
| `< 0.34` | `var(--color-accent-200)` | `var(--color-text)` |
| `< 0.58` | `var(--color-accent-300)` | `var(--color-text)` |
| `< 0.80` | `var(--color-accent-500)` | `var(--color-text)` |
| `>= 0.80` | `var(--color-accent-800)` | `var(--color-neutral-100)` |

The light label switches in only at the darkest step — white on `--color-accent-500` (#ff563c) is ~3.1:1 and fails at 11px.

Below the grid: a legend bar `linear-gradient(90deg, var(--color-neutral-100), var(--color-accent-300), var(--color-accent), var(--color-accent-800))`, 10px tall, flanked by `0%` and `gem rate 41%`; then the note "Hatched cells hold fewer than five titles and are left blank rather than shown as noise."

**Cross-filter**: clicking a rated cell sets `genres = [cellGenre]` and clamps the era sliders to that decade; clicking the already-active cell clears both. The active cell carries `stroke: var(--color-text)` 2px. This is the link between the two visualizations — it drives the scatter, the counters and the ranked list.

### Ranked list — recommended

Sub-line is stateful: `Ranked by underseen index. Pick genres on the left to re-rank on taste match.` → `Ranked by underseen index weighted by how well each title matches Mystery / Drama.`

Candidates are filtered rows with `gem > 0 && sp >= 60`, scored as:

```
match = genres.length ? |t.genres ∩ genres| / genres.length : null
rank  = gem * (match === null ? 1 : 0.45 + 0.55 * min(1, match))
```

Top 12, descending. Ranking on the index alone surfaces obscurity for its own sake, hence the taste weight; the 0.45 floor stops a perfect-match bias from burying strong non-matches entirely.

Each row is a full-width `<button>` on a grid: `[38px cover] 26px 1fr 58px`, `gap: 12px`, `padding: 9px 4px`, `border-bottom: 1px solid var(--color-neutral-300)`, hover `background: var(--color-accent-200)`, selected `var(--color-accent-200)`. The cover column exists only when the dataset has image URLs.

- Cover: 38×54, `object-fit: cover`, 1px divider border, `loading="lazy"`; on error the element hides itself (`visibility: hidden`) so a dead CDN link never leaves a broken-image glyph.
- Rank: 13px/800 **italic** `var(--color-neutral-600)`, zero-padded (`01`).
- Title: 14px/800, single line, ellipsis.
- Meta: 11px `var(--color-neutral-700)`, single line, ellipsis — `TV · 2014 · 8.61 score · 290k votes · 67% taste match`.
- Index bar: 4px track `var(--color-neutral-300)`, fill `var(--color-accent)` at `width: clamp(3, gem, 100)%`.
- Index value: 17px/800 signed (`+52`) over a 10px/800 uppercase `index` caption.

Empty state: "Nothing clears the bar with these filters. Loosen the minimum score or widen the era."

### Detail drawer (detail-on-demand)

Opens on click of any scatter mark or list row; `selId` in state. `position: fixed; top:0; right:0; bottom:0; width: 380px; max-width: 92vw`, `background: var(--color-bg)`, `border-left: 2px solid var(--color-text)`, `box-shadow: var(--shadow-lg)`, `z-index: 200`, `overflow-y: auto`, `padding: 24px 24px 32px`.

Contents, top to bottom:

1. Badge, 11px/800 uppercase `var(--color-accent-700)` — `Underseen pick` when the gem predicate holds, `Slightly under-watched` when `gem > 0`, else `Widely seen`. A `.btn.btn-ghost` **Close** sits opposite.
2. Cover art when present: full width, `height: 300px`, `object-fit: cover`, `border: 2px solid var(--color-text)`, same hide-on-error.
3. Title, 26px/800, `line-height: 1.06`, `letter-spacing: -0.02em`.
4. Meta line, 13px `var(--color-neutral-700)` — format · year · episodes · studio, empty parts dropped.
5. Genre `.tag.tag-outline` chips, or a single `No genre data in this file`.
6. `.hr`, then a 2×3 stat grid — 24px/800 values over 10px/800 uppercase captions: **Score**, **Votes**, **Score percentile** (ordinal, e.g. `93rd`), **Audience percentile**, **Underseen index** (signed, `var(--color-accent-700)` when positive), **Taste match** (`—` when no genres are selected).
7. `.hr`, then the plain-language reading: `Rated better than 93% of the dataset while reaching a smaller audience than 78% of it.`
8. Synopsis when the column exists, 12px `var(--color-neutral-800)`, truncated to 420 chars at ingest.

Write the ordinal suffix properly — `11th/12th/13th`, not `11st/12nd/13rd`.

### Method section

Three prose columns, `flex: 1 1 250px`, 13px, `max-width: 46ch`, `text-wrap: pretty`, under a 13px/800 uppercase heading **How the index works**. The copy is in the prototype and should ship verbatim; it documents the index definition, the taste weighting, and the honest caveat that thin vote counts make obscure high scores volatile ("Treat the quadrant as a shortlist, not a verdict."). For a graded project this section is not decoration — it is the methods statement.

## Interactions & behavior

| Trigger | Result |
| --- | --- |
| Genre / format chip click | toggle in the multi-select; both charts, both counters and the list recompute; selection clears |
| Era / score / audience slider | same, with the from/to clamping described above |
| Heatmap cell click | cross-filter to that genre + decade, or clear if already active |
| Heatmap row label click | toggle that genre |
| Scatter mark hover | tooltip follows the mark |
| Heatmap cell hover | tooltip below the cell |
| Scatter mark or list row click | opens the drawer; the mark grows to 16px and turns ink; the list row tints |
| Reset | clears genres, formats, min score; restores the audience ceiling and both era bounds |
| CSV load | full re-ingest; all filters reset to the new dataset's bounds |

**Tooltips** are a single reused absolutely-positioned `div.d3-tip` per chart host (created once, `opacity` toggled, `transition: opacity .08s linear`, `pointer-events: none`, `z-index: 60`). `background: var(--color-neutral-900)`, `color: var(--color-neutral-100)`, `padding: 8px 12px`, `max-width: 250px`, 11px/600. Title line 13px/800; a trailing accent line in `var(--color-accent-400)` carries the index. Position clamps to the host: `left = min(px + 12, W - 250)`, `top = max(4, py - tipHeight - 10)`. Escape the title before injecting it.

No transitions on the marks — filtering is expected to feel instant, and animating thousands of rects fights that. Everything else is a CSS hover tint.

### Responsive behavior

Charts are redrawn from measured `clientWidth` via a `ResizeObserver` on the scatter host. Two traps, both hit during development:

1. Setting the SVG's width/height inside the observer callback resizes the observed subtree and re-fires the observer → *"ResizeObserver loop completed with undelivered notifications."* Defer the redraw to `requestAnimationFrame`, skip it when the measured width is unchanged, seed the last-width cache **before** calling `observe()`, and only write the width/height attributes when they actually differ.
2. The heatmap has no observer of its own — it redraws whenever the scatter does and on every state change, which is sufficient because the two share a resize.

### Loading, error and degraded states

- **Initial**: a bundled demo sample (`design/anime-data.js`, ~175 titles, approximate MAL figures) loads via dynamic `import()` so the page is never empty. It exists so the page demos without a 100MB download; it is **not** the research data and the source label says so. Drop it if the real dataset ships with the app.
- **Parsing**: the dataset label becomes `Parsing <filename>…`.
- **Error**: a full-width strip below the header — `background: var(--color-accent-200)`, `border-bottom: 2px solid var(--color-accent-700)`, 13px/600 `var(--color-accent-800)` — carrying the thrown message. The previous dataset stays loaded and the label reads `Demo sample (upload rejected)`.
- **Degraded modes**: with no genre column the rail hides taste matching ("This file carries no genre column, so taste matching is off.") and the heatmap **switches its row dimension to audience bands** (`0–100`, `100–1k`, `1k–10k`, `10k–100k`, `100k+`) with an adjusted sub-line, so the second visualization still carries information. With no year column the era filter has nothing to bite on and undated titles are never excluded. Keep both fallbacks — the Kaggle bundle's episode table triggers the first one.

## State management

```ts
type Title = {
  id: string; title: string; score: number; members: number;
  year: number | null; format: string; genres: string[];
  episodes: number | null; studio: string | null;
  synopsis: string | null; image: string | null;
  sp: number; mp: number; gem: number;      // derived at ingest
};

type State = {
  titles: Title[];                 // full dataset, percentiles baked in
  source: string;                  // human-readable dataset label
  mapping: Record<string,string> | null;
  skipped: number;
  error: string;
  genres: string[];                // multi-select, OR
  formats: string[];               // multi-select, OR
  yearFrom: number; yearTo: number;
  minScore: number;
  maxMembersLog: number;           // slider is log10(members)
  selId: string | null;            // drawer subject
  // ingest-derived constants
  scoreMax: number; yLo: number; yHi: number;
  scoreThresh: number; memThresh: number;
  memMin: number; memMax: number;
  yearFloor: number; yearCeil: number;
};
```

The only side-effecting flow is the file read: `input change → file.text() → parseCSV → mapRows → ingest(setState)`. No network fetches beyond the cover images and the d3 script. In React, memoize the filtered array on `[titles, genres, formats, yearFrom, yearTo, minScore, maxMembersLog]` and the heatmap cell matrix on `[titles, genres.length && …, yearFloor, yearCeil]` — the heatmap counts over the full dataset, so it only depends on the era columns in view, not on the filters.

## Design tokens

From the bound **Modernist** design system (`design/_ds/modernist-*/styles.css`) — link that stylesheet and read `var(--*)`; do not hard-code these hexes.

**Colors**

| Token | Value |
| --- | --- |
| `--color-bg` | `#f3f2f2` |
| `--color-surface` | `#eae9e9` |
| `--color-text` | `#201e1d` |
| `--color-accent` | `#ec3013` |
| `--color-divider` | `color-mix(in srgb, #201e1d 40%, transparent)` |
| `--color-neutral-100…900` | `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b` |
| `--color-accent-100…900` | `#fff2ef #ffe0d9 #ffc4b8 #ff9783 #ff563c #dd2b0f #ae1800 #7c1405 #4d170e` |

The scheme is mono: `--color-accent-2-*` is a machine-derived stand-in that reads the same as the accent — treat them as one role. The accent-to-ground pair is ~3:1, so accent-colored **body** text must use `--color-accent-700`.

**Typography** — `--font-heading` / `--font-body` are both `"Archivo", system-ui, sans-serif`, heading weight 800. Add `Noto Sans JP` 700 for the Japanese spine only. Sizes in use: 68/44/26/24/17/15/14/13/12/11/10px; the display wordmark is italic 800 at `clamp(40px, 6vw, 68px)`.

**Spacing** — `--space-1…8` = 4 / 8 / 12 / 16 / 24 / 32px. **Radius** — `--radius-sm/md/lg` are all `0px`; do not round a corner anywhere. **Shadow** — `--shadow-sm/md/lg`; only `lg` is used, on the drawer.

Design-system rules this page follows and that a port must keep: everything flush left (including button labels), 2px rules rather than hairlines, the accent used sparingly with the one red field being the header spine, zero radius, and a themed `:focus-visible` ring (`2px solid var(--color-accent)`, `outline-offset: 2px`) rather than the browser default.

## Assets

- **Cover art** is loaded at view time from the URL in the dataset (MyAnimeList's CDN). Nothing is bundled. Expect dead links and hotlink failures — the hide-on-error handler is required, not optional. If the deployment needs reliability, mirror the images and rewrite the URLs at ingest.
- **No decorative imagery.** The screentone dot field and the speed-line rule are pure CSS gradients. There is no key art, illustration or icon set in this design; if you add icons, the design system specifies Lucide.
- **d3 v7** is loaded from `https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js`. In a real build, install `d3` (or just `d3-scale`, `d3-axis`, `d3-selection`, `d3-array`) and drop the CDN tag.
- **Fonts**: Archivo and Noto Sans JP from Google Fonts.

## Files

```
design/
  Underseen.dc.html    the design reference — template (markup + inline styles) and logic class
  csv.js               CSV parser + fuzzy column mapper + episode aggregator — transfers as-is
  anime-data.js        bundled ~175-title demo sample (approximate figures; not research data)
  support.js           the prototype runtime that mounts the .dc.html — DO NOT port
  _ds/modernist-*/     the bound design system: styles.css (tokens) and its component bundle
```

Open `design/Underseen.dc.html` directly in a browser to see the running prototype.

## Suggested build order

1. Port `csv.js` unchanged; unit-test the column mapper against both Kaggle tables and a header-only file.
2. Build the ingest/derive pass and assert percentiles are computed on the full dataset.
3. Static shell: header, rail, section frames, tokens wired.
4. Scatter (explicit decade ticks, sampling, tooltip, click-to-select).
5. Heatmap with the low-n hatch and the genre/audience row fallback.
6. Cross-filter linking, then the ranked list and the drawer.
7. Degraded modes and the error strip — these are what a grader will poke at first.
