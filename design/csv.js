// CSV ingest: tolerant parser + fuzzy column mapping for MAL-style dumps.

export function parseCSV(text, maxRows) {
  const rows = [];
  let field = "", row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (maxRows && rows.length > maxRows) break;
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const CANDIDATES = {
  title: ["title_english", "english_title", "title", "name", "title_romaji", "anime_title"],
  score: ["score", "mean_score", "average_score", "rating", "mal_score", "weighted_score"],
  members: ["members", "member_count", "popularity_members", "scored_by", "num_scoring_users", "num_list_users", "users", "score_votes", "votes", "favorites"],
  genres: ["genres", "genre", "genre_list", "tags", "themes"],
  format: ["type", "media_type", "format", "anime_type"],
  year: ["year", "start_year", "release_year", "premiered", "aired_from", "start_date", "aired", "season_year"],
  episodes: ["episodes", "num_episodes", "episode_count"],
  studio: ["studios", "studio", "producer", "producers"],
  synopsis: ["synopsis", "description", "overview", "about"],
  image: ["image_url", "main_picture", "picture_url", "cover_image", "cover_url", "picture", "cover", "img_url", "image", "poster"]
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "_");

function pick(header, key) {
  const h = header.map(norm);
  for (const cand of CANDIDATES[key]) {
    const i = h.indexOf(cand);
    if (i >= 0) return i;
  }
  for (const cand of CANDIDATES[key]) {
    const i = h.findIndex((x) => x.includes(cand));
    if (i >= 0) return i;
  }
  return -1;
}

const splitGenres = (v) => String(v || "")
  .replace(/[\[\]'"{}]/g, "")
  .split(/[,|;\/]/)
  .map((s) => s.trim())
  .filter((s) => s && s.toLowerCase() !== "nan" && s.toLowerCase() !== "unknown")
  .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));

const yearOf = (v) => {
  const m = String(v || "").match(/(19|20)\d{2}/);
  return m ? +m[0] : null;
};

// Some dumps store a JSON blob of sizes rather than a bare URL.
function imgOf(v) {
  const s = String(v || "").trim();
  if (!s || s.toLowerCase() === "nan") return null;
  const m = s.match(/https?:\/\/[^\s"'\\,}\]]+/);
  return m ? m[0] : null;
}

const FORMATS = ["TV", "Movie", "OVA", "ONA", "Special", "Music"];
function fmtOf(v) {
  const s = String(v || "").trim().toLowerCase();
  const hit = FORMATS.find((f) => f.toLowerCase() === s);
  if (hit) return hit;
  if (s.includes("tv")) return "TV";
  if (s.includes("movie") || s.includes("film")) return "Movie";
  if (s.includes("ova")) return "OVA";
  if (s.includes("ona") || s.includes("web")) return "ONA";
  if (s.includes("special")) return "Special";
  if (s.includes("music")) return "Music";
  return "Other";
}

const isEpisodeTable = (header) => {
  const h = header.map(norm);
  return h.some((x) => x === "episode_number" || x === "episode_id" || x === "episode");
};

// One row per episode -> one row per series: mean episode score, votes summed as
// the only available audience proxy, earliest air date as the year.
function aggregateEpisodes(rows) {
  const header = rows[0], h = header.map(norm);
  const col = (names) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } return -1; };
  const iId = col(["mal_id", "anime_id", "id"]);
  const iTitle = col(["anime_title", "title", "name"]);
  const iScore = col(["score", "episode_score", "rating"]);
  const iVotes = col(["score_votes", "votes", "scored_by"]);
  const iDate = col(["aired_date", "aired", "air_date", "date"]);
  if (iTitle < 0 || iScore < 0) throw new Error("This looks like an episode table but has no title or score column.");
  const byKey = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const key = (iId >= 0 ? row[iId] : "") || row[iTitle];
    const sc = parseFloat(row[iScore]);
    if (!key || !isFinite(sc) || sc <= 0) continue;
    let a = byKey.get(key);
    if (!a) { a = { title: (row[iTitle] || "").trim(), sum: 0, n: 0, votes: 0, year: null }; byKey.set(key, a); }
    a.sum += sc; a.n++;
    if (iVotes >= 0) { const v = parseFloat(String(row[iVotes]).replace(/[^0-9.]/g, "")); if (isFinite(v)) a.votes += v; }
    if (iDate >= 0) { const y = yearOf(row[iDate]); if (y && (!a.year || y < a.year)) a.year = y; }
  }
  const out = [];
  let i = 0;
  for (const a of byKey.values()) {
    if (!a.n || !a.title) continue;
    out.push({
      id: "e" + (i++), title: a.title, score: Math.round((a.sum / a.n) * 100) / 100,
      members: a.votes, year: a.year, format: "Other", genres: [], episodes: a.n, studio: null, synopsis: null
    });
  }
  const withAudience = out.filter((t) => t.members >= 1);
  if (withAudience.length < Math.max(20, out.length * 0.1)) {
    throw new Error(
      "That is the per-episode table (" + out.length.toLocaleString() + " series, " + (rows.length - 1).toLocaleString() +
      " episode rows) and its vote column is empty, so there is no audience measure to compare scores against. " +
      "Drop the per-anime table from the same Kaggle bundle instead — the file with score plus members (or scored_by), genres, type and year."
    );
  }
  return { titles: withAudience, mapping: { title: header[iTitle], score: header[iScore] + " (mean across episodes)", members: (iVotes >= 0 ? header[iVotes] : "votes") + " (summed)", year: iDate >= 0 ? header[iDate] : undefined }, skipped: out.length - withAudience.length, aggregated: true };
}

// Returns { titles, mapping, skipped, scoreMax }
export function mapRows(rows) {
  if (!rows.length) return { titles: [], mapping: {}, skipped: 0, scoreMax: 10 };
  const header = rows[0];
  if (isEpisodeTable(header)) return withScale(aggregateEpisodes(rows));
  const idx = {};
  for (const k of Object.keys(CANDIDATES)) idx[k] = pick(header, k);
  if (idx.title < 0 || idx.score < 0 || idx.members < 0) {
    const missing = ["title", "score", "members"].filter((k) => idx[k] < 0);
    throw new Error(
      "No column matched: " + missing.join(", ") + ". Need a title, a score, and an audience-size column (members, scored_by, num_list_users or score_votes). This file's columns are: " +
        header.slice(0, 16).join(", ") + (header.length > 16 ? ", …" : "")
    );
  }
  const titles = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const score = parseFloat(row[idx.score]);
    const members = parseFloat(String(row[idx.members]).replace(/[^0-9.]/g, ""));
    const title = (row[idx.title] || "").trim();
    if (!title || !isFinite(score) || score <= 0 || !isFinite(members) || members < 1) { skipped++; continue; }
    titles.push({
      id: "r" + r,
      title,
      score: Math.round(score * 100) / 100,
      members: Math.round(members),
      year: idx.year >= 0 ? yearOf(row[idx.year]) : null,
      format: idx.format >= 0 ? fmtOf(row[idx.format]) : "Other",
      genres: idx.genres >= 0 ? splitGenres(row[idx.genres]) : [],
      episodes: idx.episodes >= 0 ? parseInt(row[idx.episodes], 10) || null : null,
      studio: idx.studio >= 0 ? splitGenres(row[idx.studio])[0] || null : null,
      synopsis: idx.synopsis >= 0 ? (row[idx.synopsis] || "").slice(0, 420) : null,
      image: idx.image >= 0 ? imgOf(row[idx.image]) : null
    });
  }
  const mapping = {};
  for (const k of Object.keys(idx)) if (idx[k] >= 0) mapping[k] = header[idx[k]];
  return withScale({ titles, mapping, skipped });
}

// Scores come on a 0-5 or 0-10 scale depending on the table; report which.
function withScale(out) {
  let max = 0;
  for (const t of out.titles) if (t.score > max) max = t.score;
  out.scoreMax = max > 5.2 ? 10 : 5;
  return out;
}
