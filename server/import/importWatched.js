const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const config = require('../config');

function importWatched() {
  const db = getDb();
  let data;

  // Try CSV first, fall back to XLSX
  if (fs.existsSync(config.WATCHED_DATA_PATH)) {
    const csvContent = fs.readFileSync(config.WATCHED_DATA_PATH, 'utf8');
    data = parseCSV(csvContent);
  } else if (fs.existsSync(config.XLSX_DATA_PATH)) {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(config.XLSX_DATA_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    data = XLSX.utils.sheet_to_json(sheet);
  } else {
    console.warn(`  No watched-data file found at ${config.WATCHED_DATA_PATH} or ${config.XLSX_DATA_PATH} — skipping.`);
    return 0;
  }

  console.log(`Importing ${data.length} films...`);

  const insertFilm = db.prepare(`
    INSERT OR IGNORE INTO films (title, year, tmdb_id, imdb_id, trakt_id, slug)
    VALUES (@title, @year, @tmdb_id, @imdb_id, @trakt_id, @slug)
  `);

  const insertWatch = db.prepare(`
    INSERT INTO watches (film_id, watched_at, source)
    VALUES (@film_id, @watched_at, 'trakt')
  `);

  const insertRating = db.prepare(`
    INSERT OR REPLACE INTO ratings (film_id, rating, rated_at, source)
    VALUES (@film_id, @rating, @rated_at, 'trakt')
  `);

  const getFilmByTmdb = db.prepare('SELECT id FROM films WHERE tmdb_id = ?');

  const importAll = db.transaction(() => {
    let imported = 0;
    for (const row of data) {
      const title = row.Title || row.title;
      const year = row.Year || row.year;
      const tmdbId = row.TMDb || row.tmdb_id || row.TMDb_ID;
      const imdbId = row.IMDb || row.imdb_id || row.IMDB;
      const traktId = row.TraktID || row.trakt_id;
      const slug = row.Slug || row.slug || '';
      const watchedAt = row.WatchedAt || row.watched_at || '';
      const rating = row.Rating || row.rating;
      const ratedAt = row.RatedAt || row.rated_at || '';

      if (!title || !tmdbId) continue;

      insertFilm.run({
        title,
        year: year ? Math.floor(Number(year)) : null,
        tmdb_id: Number(tmdbId),
        imdb_id: imdbId || null,
        trakt_id: traktId ? Number(traktId) : null,
        slug: slug || null,
      });

      const film = getFilmByTmdb.get(Number(tmdbId));
      if (!film) continue;

      if (watchedAt) {
        insertWatch.run({ film_id: film.id, watched_at: watchedAt });
      }

      if (rating && !isNaN(Number(rating))) {
        const r = Math.round(Number(rating));
        if (r >= 1 && r <= 10) {
          insertRating.run({
            film_id: film.id,
            rating: r,
            rated_at: ratedAt || null,
          });
        }
      }

      imported++;
    }
    return imported;
  });

  const count = importAll();
  console.log(`Imported ${count} films with watches and ratings.`);
  return count;
}

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

module.exports = { importWatched };
