const { getDb } = require('../db');

/**
 * CLAUDIUS Queue Generator
 *
 * No choices. No browsing. Just assignments.
 * Generates 2-3 films per day from the discovery pool and rewatch candidates.
 * Prefers English-language films for daytime slots.
 * Each slot is a command: watch THIS. It's on [service]. Go.
 */

const SLOTS = ['morning', 'afternoon'];

function generateDailyQueue(date) {
  const db = getDb();
  const queueDate = date || today();

  // Check if queue already exists for this date
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM queue WHERE queue_date = ?').get(queueDate);
  if (existing.cnt > 0) {
    return { generated: false, message: 'Queue already exists for this date', date: queueDate };
  }

  const assignments = [];

  // Get films already in queue (to avoid repeats within a week)
  const recentQueued = db.prepare(`
    SELECT imdb_id FROM queue WHERE queue_date >= date(?, '-7 days') AND imdb_id IS NOT NULL
  `).all(queueDate).map(r => r.imdb_id);

  // Get films already watched (from the watches table)
  const watched = new Set(
    db.prepare('SELECT DISTINCT f.imdb_id FROM watches w JOIN films f ON f.id = w.film_id WHERE f.imdb_id IS NOT NULL')
      .all().map(r => r.imdb_id)
  );

  const recentSet = new Set(recentQueued);

  for (const slot of SLOTS) {
    const pick = pickFilmForSlot(db, slot, watched, recentSet, queueDate);
    if (pick) {
      assignments.push(pick);
      if (pick.imdb_id) recentSet.add(pick.imdb_id);
    }
  }

  // Insert assignments
  const insert = db.prepare(`
    INSERT INTO queue (queue_date, slot, title, year, runtime, genres, directors, poster_path,
      imdb_id, tmdb_id, film_id, source, source_detail, taste_score, rationale, streaming_info, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned')
  `);

  const insertAll = db.transaction(() => {
    for (const a of assignments) {
      insert.run(
        queueDate, a.slot, a.title, a.year, a.runtime, a.genres, a.directors, a.poster_path,
        a.imdb_id, a.tmdb_id, a.film_id, a.source, a.source_detail,
        a.taste_score, a.rationale, a.streaming_info
      );
    }
  });

  insertAll();

  return { generated: true, date: queueDate, count: assignments.length, films: assignments.map(a => `${a.title} (${a.year})`) };
}

function pickFilmForSlot(db, slot, watchedSet, recentSet, queueDate) {
  // Strategy: pull from discovery_pool (taste-scored, English preferred for daytime)
  // Morning = something accessible, Afternoon = can be more adventurous

  const langFilter = (slot === 'morning' || slot === 'afternoon')
    ? "AND (d.language IS NULL OR d.language = '' OR LOWER(d.language) = 'en' OR LOWER(d.language) = 'english')"
    : '';

  // Seed based on date + slot for deterministic but varied picks
  const dateSeed = dateToSeed(queueDate);
  const slotOffset = slot === 'morning' ? 0 : slot === 'afternoon' ? 1 : slot === 'evening' ? 2 : 3;

  // Try discovery pool first (highest taste scores, not yet watched)
  const discoveryFilms = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.poster_path, d.source_lists,
      d.imdb_rating, d.rt_tomatometer
    FROM discovery_pool d
    WHERE d.excluded = 0
      AND d.taste_score IS NOT NULL
      AND d.taste_score >= 40
      AND d.runtime IS NOT NULL
      AND d.runtime >= 70
      AND d.runtime <= 180
      ${langFilter}
    ORDER BY d.taste_score DESC
    LIMIT 100
  `).all();

  // Filter out watched and recently queued
  const candidates = discoveryFilms.filter(f =>
    f.imdb_id && !watchedSet.has(f.imdb_id) && !recentSet.has(f.imdb_id)
  );

  if (candidates.length > 0) {
    // Use date seed + slot to pick deterministically but with variety
    const index = (dateSeed + slotOffset * 7) % Math.min(candidates.length, 30);
    const pick = candidates[index];

    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];

    return {
      slot,
      title: pick.title,
      year: pick.year,
      runtime: pick.runtime,
      genres: pick.genres,
      directors: null,
      poster_path: pick.poster_path,
      imdb_id: pick.imdb_id,
      tmdb_id: pick.tmdb_id,
      film_id: null,
      source: 'discovery',
      source_detail: pick.source_lists || 'taste-matched',
      taste_score: pick.taste_score,
      rationale: rationale[0] || 'Matched to your taste profile',
      streaming_info: null,
    };
  }

  // Fallback: highly-rated rewatch candidates
  const rewatchFilms = db.prepare(`
    SELECT f.id, f.title, f.year, f.runtime, f.poster_path, f.imdb_id, f.tmdb_id,
      r.rating,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id
    LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE r.rating >= 8
      AND f.runtime IS NOT NULL AND f.runtime >= 70 AND f.runtime <= 180
      ${(slot === 'morning' || slot === 'afternoon') ? "AND (f.original_language IS NULL OR f.original_language = 'en')" : ''}
    GROUP BY f.id
    ORDER BY r.rating DESC, RANDOM()
    LIMIT 50
  `).all();

  const rewatchCandidates = rewatchFilms.filter(f =>
    f.imdb_id && !recentSet.has(f.imdb_id)
  );

  if (rewatchCandidates.length > 0) {
    const index = (dateSeed + slotOffset * 13) % rewatchCandidates.length;
    const pick = rewatchCandidates[index];

    return {
      slot,
      title: pick.title,
      year: pick.year,
      runtime: pick.runtime,
      genres: pick.genres,
      directors: pick.directors,
      poster_path: pick.poster_path,
      imdb_id: pick.imdb_id,
      tmdb_id: pick.tmdb_id,
      film_id: pick.id,
      source: 'rewatch',
      source_detail: `You rated this ${pick.rating}/10`,
      taste_score: pick.rating * 10,
      rationale: `You rated this ${pick.rating}/10 — time to revisit`,
      streaming_info: null,
    };
  }

  return null;
}

function addBonusSlot(queueDate) {
  const db = getDb();
  queueDate = queueDate || today();

  // Check if bonus already exists
  const bonus = db.prepare("SELECT id FROM queue WHERE queue_date = ? AND slot = 'bonus'").get(queueDate);
  if (bonus) return { added: false, message: 'Bonus slot already exists' };

  const watched = new Set(
    db.prepare('SELECT DISTINCT f.imdb_id FROM watches w JOIN films f ON f.id = w.film_id WHERE f.imdb_id IS NOT NULL')
      .all().map(r => r.imdb_id)
  );

  const recentQueued = new Set(
    db.prepare(`SELECT imdb_id FROM queue WHERE queue_date >= date(?, '-7 days') AND imdb_id IS NOT NULL`)
      .all(queueDate).map(r => r.imdb_id)
  );

  const pick = pickFilmForSlot(db, 'bonus', watched, recentQueued, queueDate);
  if (!pick) return { added: false, message: 'No films available' };

  db.prepare(`
    INSERT INTO queue (queue_date, slot, title, year, runtime, genres, directors, poster_path,
      imdb_id, tmdb_id, film_id, source, source_detail, taste_score, rationale, streaming_info, status)
    VALUES (?, 'bonus', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned')
  `).run(
    queueDate, pick.title, pick.year, pick.runtime, pick.genres, pick.directors,
    pick.poster_path, pick.imdb_id, pick.tmdb_id, pick.film_id, pick.source,
    pick.source_detail, pick.taste_score, pick.rationale, pick.streaming_info
  );

  return { added: true, film: `${pick.title} (${pick.year})` };
}

// Helpers
function today() {
  return new Date().toISOString().split('T')[0];
}

function dateToSeed(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

module.exports = { generateDailyQueue, addBonusSlot };
