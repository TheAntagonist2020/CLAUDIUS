const { getDb } = require('../db');

/**
 * Generate a Letterboxd-compatible CSV for diary import.
 * Letterboxd diary CSV format:
 *   Title, Year, Rating, WatchedDate, Rewatch, Tags
 *
 * Rating: Letterboxd uses 0.5-5.0 scale (our 1-10 maps to 0.5-5.0)
 */
function exportLetterboxdDiary({ fromDate, toDate } = {}) {
  const db = getDb();

  let query = `
    SELECT dq.title, dq.year, dq.rating, dq.completed_at, dq.imdb_id
    FROM daily_queue dq
    WHERE dq.status = 'completed'
  `;
  const params = [];

  if (fromDate) {
    query += ' AND dq.completed_at >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    query += ' AND dq.completed_at <= ?';
    params.push(toDate);
  }
  query += ' ORDER BY dq.completed_at DESC';

  const rows = db.prepare(query).all(...params);

  // CSV header
  const lines = ['Title,Year,Rating,WatchedDate,Rewatch,Tags'];

  for (const row of rows) {
    const title = csvEscape(row.title);
    const year = row.year || '';
    const rating = row.rating ? (row.rating / 2).toFixed(1) : '';
    const watched = row.completed_at ? row.completed_at.split('T')[0] : '';
    const rewatch = ''; // Could check watch history
    const tags = 'claudius-queue';

    lines.push(`${title},${year},${rating},${watched},${rewatch},${tags}`);
  }

  return lines.join('\n');
}

/**
 * Generate a Letterboxd-compatible CSV for watchlist import.
 * Format: Title, Year, imdbID
 */
function exportLetterboxdWatchlist() {
  const db = getDb();

  const rows = db.prepare(`
    SELECT dq.title, dq.year, dq.imdb_id
    FROM daily_queue dq
    WHERE dq.status IN ('assigned', 'deferred')
    ORDER BY dq.queue_date DESC
  `).all();

  const lines = ['Title,Year,imdbID'];
  for (const row of rows) {
    lines.push(`${csvEscape(row.title)},${row.year || ''},${row.imdb_id || ''}`);
  }

  return lines.join('\n');
}

/**
 * Get all completed watches not yet logged to Letterboxd
 */
function getUnloggedWatches() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM daily_queue
    WHERE status = 'completed' AND letterboxd_logged = 0
    ORDER BY completed_at DESC
  `).all();
}

/**
 * Mark watches as logged to Letterboxd
 */
function markAsLogged(ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE daily_queue SET letterboxd_logged = 1 WHERE id = ?');
  for (const id of ids) {
    stmt.run(id);
  }
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = {
  exportLetterboxdDiary,
  exportLetterboxdWatchlist,
  getUnloggedWatches,
  markAsLogged,
};
