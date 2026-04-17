const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { getDb } = require('../db');
const config = require('../config');

// Accepts either:
//   - a path to a Trakt-export zip file
//   - a directory containing already-extracted JSON files
// Looks in DATA_DIR by default for a *.zip or a trakt/ subfolder.

function findDefaultSource() {
  if (!fs.existsSync(config.DATA_DIR)) return null;

  const entries = fs.readdirSync(config.DATA_DIR);
  const zip = entries.find(f => /trakt.*\.zip$/i.test(f));
  if (zip) return path.join(config.DATA_DIR, zip);

  const traktDir = path.join(config.DATA_DIR, 'trakt');
  if (fs.existsSync(traktDir)) return traktDir;

  return null;
}

function loadJsonFiles(source) {
  // Returns a map of { basename_without_ext: parsed_json }
  const result = {};

  if (fs.statSync(source).isFile() && source.toLowerCase().endsWith('.zip')) {
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

  // Directory
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

// Find the first key matching any of the given substrings (case-insensitive)
function findKey(obj, ...needles) {
  const keys = Object.keys(obj);
  for (const needle of needles) {
    const match = keys.find(k => k.includes(needle));
    if (match) return match;
  }
  return null;
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
    console.error(`No Trakt export found. Place a trakt-export-*.zip in ${config.DATA_DIR}`);
    console.error(`or unzip it into ${config.DATA_DIR}/trakt/`);
    return { error: 'no-source' };
  }

  console.log(`Importing Trakt export from: ${source}`);
  const files = loadJsonFiles(source);
  const fileList = Object.keys(files);
  console.log(`  Found files: ${fileList.join(', ') || '(none)'}`);

  if (fileList.length === 0) {
    return { error: 'no-files' };
  }

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

  // --- Watched (history or watched file) ---
  const watchedKey = findKey(files, 'watched_movies', 'movies_watched', 'watched')
    || findKey(files, 'history_movies', 'history');
  if (watchedKey) {
    console.log(`  Watched entries from "${watchedKey}.json"...`);
    const tx = db.transaction(() => {
      for (const entry of files[watchedKey] || []) {
        if (entry.type && entry.type !== 'movie') continue;
        const ids = movieIds(entry);
        const filmId = upsertFilm(ids);
        if (!filmId) { stats.unmatched++; continue; }
        const watchedAt = entry.watched_at || entry.last_watched_at;
        if (watchedAt) {
          insertWatch.run(filmId, watchedAt);
          stats.watched++;
        } else if (entry.plays) {
          insertWatch.run(filmId, new Date().toISOString());
          stats.watched++;
        }
      }
    });
    tx();
  }

  // --- Ratings ---
  const ratingsKey = findKey(files, 'ratings_movies', 'movies_ratings', 'ratings');
  if (ratingsKey) {
    console.log(`  Ratings from "${ratingsKey}.json"...`);
    const tx = db.transaction(() => {
      for (const entry of files[ratingsKey] || []) {
        if (entry.type && entry.type !== 'movie') continue;
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
    tx();
  }

  // --- Watchlist ---
  const watchlistKey = findKey(files, 'watchlist_movies', 'movies_watchlist', 'watchlist');
  if (watchlistKey) {
    console.log(`  Watchlist from "${watchlistKey}.json"...`);
    const tx = db.transaction(() => {
      for (const entry of files[watchlistKey] || []) {
        if (entry.type && entry.type !== 'movie') continue;
        const ids = movieIds(entry);
        if (!ids.title) continue;
        // Also upsert into films so links resolve if the user watches it later
        upsertFilm(ids);
        insertWatchlist.run({
          title: ids.title,
          year: ids.year,
          tmdb_id: ids.tmdb_id,
        });
        stats.watchlist++;
      }
    });
    tx();
  }

  console.log(`Trakt import complete:`);
  console.log(`  ${stats.watched} watches, ${stats.ratings} ratings, ${stats.watchlist} watchlist items, ${stats.unmatched} unmatched.`);
  return stats;
}

if (require.main === module) {
  const arg = process.argv[2];
  importTraktExport(arg);
}

module.exports = { importTraktExport };
