const fs = require('fs');
const { getDb } = require('../db');
const config = require('../config');

function importSuperList() {
  const db = getDb();
  if (!fs.existsSync(config.SUPER_LIST_PATH)) {
    console.warn(`  No super-list file at ${config.SUPER_LIST_PATH} — skipping.`);
    return 0;
  }
  const content = fs.readFileSync(config.SUPER_LIST_PATH, 'utf8');
  const data = parseCSV(content);

  console.log(`Importing ${data.length} discovery pool films...`);

  // Get all TMDb IDs already in the user's library
  const watchedTmdbIds = new Set(
    db.prepare('SELECT tmdb_id FROM films WHERE tmdb_id IS NOT NULL').all().map(r => r.tmdb_id)
  );

  const insert = db.prepare(`
    INSERT OR IGNORE INTO discovery_pool
    (title, year, tmdb_id, imdb_id, trakt_id, runtime, genres, country, language,
     trakt_rating, imdb_rating, tmdb_rating, rt_tomatometer, rt_audience, metascore, source_lists)
    VALUES (@title, @year, @tmdb_id, @imdb_id, @trakt_id, @runtime, @genres, @country, @language,
            @trakt_rating, @imdb_rating, @tmdb_rating, @rt_tomatometer, @rt_audience, @metascore, @source_lists)
  `);

  const importAll = db.transaction(() => {
    let imported = 0;
    for (const row of data) {
      const tmdbId = Number(row.tmdb_id);
      if (!row.title || !tmdbId || isNaN(tmdbId)) continue;
      if (watchedTmdbIds.has(tmdbId)) continue; // Skip already watched
      if (row.type !== 'movie') continue; // Only movies

      insert.run({
        title: row.title,
        year: row.year ? Math.floor(Number(row.year)) : null,
        tmdb_id: tmdbId,
        imdb_id: row.imdb_id || null,
        trakt_id: row.trakt_id ? Number(row.trakt_id) : null,
        runtime: row.runtime ? Number(row.runtime) : null,
        genres: row.genres || null,
        country: row.country || null,
        language: row.language || null,
        trakt_rating: row.trakt_rating ? Number(row.trakt_rating) : null,
        imdb_rating: row.imdb_rating ? Number(row.imdb_rating) : null,
        tmdb_rating: row.tmdb_rating ? Number(row.tmdb_rating) : null,
        rt_tomatometer: row.rt_tomatometer ? Number(row.rt_tomatometer) : null,
        rt_audience: row.rt_audience ? Number(row.rt_audience) : null,
        metascore: row.metascore ? Number(row.metascore) : null,
        source_lists: row.source_lists || null,
      });
      imported++;
    }
    return imported;
  });

  const count = importAll();
  console.log(`Imported ${count} films into discovery pool (${watchedTmdbIds.size} already watched, skipped).`);
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
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
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

module.exports = { importSuperList };
