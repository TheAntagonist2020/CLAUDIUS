const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { getDb } = require('../db');
const config = require('../config');

// Imports a Trakt data export. Accepts:
//   - a path to a trakt-export-*.zip file
//   - a directory containing already-extracted JSON files
//   - no argument → auto-discover in DATA_DIR (zip or extracted)
//
// Handles Trakt's real export format: multi-part numbered files, hyphens.
//   watched-movies-1.json, watched-movies-2.json, ...
//   watched-history-1.json, ... (individual play events)
//   ratings-movies-1.json, ratings-movies-2.json, ...
//   lists-watchlist.json

function findDefaultSource() {
  if (!fs.existsSync(config.DATA_DIR)) return null;

  const entries = fs.readdirSync(config.DATA_DIR);

  // Prefer extracted JSONs if they exist — avoids re-reading the zip every time
  const hasExtracted = entries.some(f =>
    /^(watched-movies|watched-history|ratings-movies|lists-watchlist)/i.test(f)
  );
  if (hasExtracted) return config.DATA_DIR;

  const zip = entries.find(f => /trakt.*\.zip$/i.test(f));
  if (zip) return path.join(config.DATA_DIR, zip);

  const traktDir = path.join(config.DATA_DIR, 'trakt');
  if (fs.existsSync(traktDir)) return traktDir;

  return null;
}

// Load raw entries: { filename_without_extension → parsed JSON }
function loadJsonFiles(source) {
  const result = {};

  const stat = fs.statSync(source);
  if (stat.isFile() && source.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(source);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (!entry.entryName.toLowerCase().endsWith('.json')) continue;
      const base = path.basename(entry.entryName, '.json').toLowerCase();
      try {
        result[base] = JSON.parse(entry.getData().toString('utf8'));
      } catch (err) {
        console.warn(`  Skipping ${entry.entryName}: ${err.message}`);
      }
    }
    return result;
  }

  for (const f of fs.readdirSync(source)) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const base = path.basename(f, '.json').toLowerCase();
    try {
      result[base] = JSON.parse(fs.readFileSync(path.join(source, f), 'utf8'));
    } catch (err) {
      console.warn(`  Skipping ${f}: ${err.message}`);
    }
  }
  return result;
}

// Merge every file whose normalized name starts with one of the given prefixes.
// Normalization strips trailing -N, -NN, -UUID-N, etc.
function collectMatching(files, prefixes) {
  const out = [];
  for (const [name, content] of Object.entries(files)) {
    if (!Array.isArray(content)) continue;
    if (prefixes.some(p => name.startsWith(p))) {
      out.push(...content);
    }
  }
  return out;
}

function movieIds(entry) {
  const m = entry.movie || entry;
  const ids = m.ids || {};
  return {
    title: m.title,
    year: m.year ? Math.floor(Number(m.year)) : null,
    tmdb_id: ids.tmdb ? Number(ids.tmdb) : null,
    imdb_id: ids.imdb || null,
    trakt_id: ids.trakt ? Number(ids.trakt) : null,
    slug: ids.slug || null,
  };
}

function importTraktExport(sourcePath) {
  const db = getDb();
  const source = sourcePath || findDefaultSource();

  if (!source) {
    console.error(`No Trakt export found. Place a trakt-export-*.zip or its extracted`);
    console.error(`JSON files in: ${config.DATA_DIR}`);
    return { error: 'no-source' };
  }

  console.log(`Importing Trakt export from: ${source}`);
  const files = loadJsonFiles(source);
  const fileList = Object.keys(files);
  console.log(`  Found ${fileList.length} json file(s).`);

  if (fileList.length === 0) {
    return { error: 'no-files' };
  }

  // Collect entries across all multi-part files
  const watchedMovies = collectMatching(files, ['watched-movies', 'watched_movies']);
  const watchedHistory = collectMatching(files, ['watched-history', 'watched_history']);
  const ratings = collectMatching(files, ['ratings-movies', 'ratings_movies']);
  const watchlist = collectMatching(files, ['lists-watchlist', 'watchlist-movies', 'watchlist_movies', 'watchlist']);

  // Prefer watched-history (individual play events with dates); fall back to
  // watched-movies (one summary row per film) if history isn't exported.
  const watchSource = watchedHistory.length > 0 ? watchedHistory : watchedMovies;
  const watchSourceLabel = watchedHistory.length > 0 ? 'watched-history-*' : 'watched-movies-*';

  console.log(`  watched entries: ${watchSource.length} (from ${watchSourceLabel})`);
  console.log(`  rating entries:  ${ratings.length}`);
  console.log(`  watchlist:       ${watchlist.length}`);

  const insertFilm = db.prepare(`
    INSERT OR IGNORE INTO films (title, year, tmdb_id, imdb_id, trakt_id, slug)
    VALUES (@title, @year, @tmdb_id, @imdb_id, @trakt_id, @slug)
  `);
  const updateFilmIds = db.prepare(`
    UPDATE films SET imdb_id = COALESCE(imdb_id, @imdb_id),
                     trakt_id = COALESCE(trakt_id, @trakt_id),
                     slug = COALESCE(slug, @slug)
    WHERE tmdb_id = @tmdb_id
  `);
  const getFilmIdByAny = db.prepare(`
    SELECT id FROM films
    WHERE (tmdb_id IS NOT NULL AND tmdb_id = @tmdb_id)
       OR (imdb_id IS NOT NULL AND imdb_id = @imdb_id)
       OR (trakt_id IS NOT NULL AND trakt_id = @trakt_id)
    LIMIT 1
  `);
  const insertWatch = db.prepare(`
    INSERT INTO watches (film_id, watched_at, source) VALUES (?, ?, 'trakt')
  `);
  const insertRating = db.prepare(`
    INSERT OR REPLACE INTO ratings (film_id, rating, rated_at, source)
    VALUES (?, ?, ?, 'trakt')
  `);
  const insertWatchlist = db.prepare(`
    INSERT OR IGNORE INTO watchlist (tmdb_id, title, year, category, source, notes)
    VALUES (@tmdb_id, @title, @year, 'to_watch', 'trakt', NULL)
  `);

  function upsertFilm(ids) {
    if (!ids.title) return null;
    if (!ids.tmdb_id && !ids.imdb_id && !ids.trakt_id) return null;
    insertFilm.run(ids);
    if (ids.tmdb_id) updateFilmIds.run(ids);
    const row = getFilmIdByAny.get(ids);
    return row ? row.id : null;
  }

  const stats = { watched: 0, ratings: 0, watchlist: 0, unmatched: 0 };

  const runWatches = db.transaction(() => {
    for (const entry of watchSource) {
      if (entry.type && entry.type !== 'movie') continue;
      if (!entry.movie) continue;
      const ids = movieIds(entry);
      const filmId = upsertFilm(ids);
      if (!filmId) { stats.unmatched++; continue; }
      const watchedAt = entry.watched_at || entry.last_watched_at;
      if (watchedAt) {
        insertWatch.run(filmId, watchedAt);
        stats.watched++;
      }
    }
  });

  const runRatings = db.transaction(() => {
    for (const entry of ratings) {
      if (entry.type && entry.type !== 'movie') continue;
      if (!entry.movie) continue;
      const ids = movieIds(entry);
      const filmId = upsertFilm(ids);
      if (!filmId || !entry.rating) { if (!filmId) stats.unmatched++; continue; }
      const r = Math.round(Number(entry.rating));
      if (r >= 1 && r <= 10) {
        insertRating.run(filmId, r, entry.rated_at || null);
        stats.ratings++;
      }
    }
  });

  const runWatchlist = db.transaction(() => {
    for (const entry of watchlist) {
      if (entry.type && entry.type !== 'movie') continue;
      if (!entry.movie) continue;
      const ids = movieIds(entry);
      if (!ids.title) continue;
      upsertFilm(ids);
      insertWatchlist.run({ title: ids.title, year: ids.year, tmdb_id: ids.tmdb_id });
      stats.watchlist++;
    }
  });

  if (watchSource.length) runWatches();
  if (ratings.length) runRatings();
  if (watchlist.length) runWatchlist();

  console.log(`Trakt import complete:`);
  console.log(`  ${stats.watched} watches, ${stats.ratings} ratings, ${stats.watchlist} watchlist items, ${stats.unmatched} unmatched.`);
  return stats;
}

if (require.main === module) {
  const arg = process.argv[2];
  importTraktExport(arg);
}

module.exports = { importTraktExport };
