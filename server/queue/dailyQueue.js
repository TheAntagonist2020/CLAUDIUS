const { getDb } = require('../db');
const { getUserLists, getListItems, getMovieByImdb } = require('../enrichment/mdblistClient');

// Languages we consider "English-friendly" for daytime viewing
const ENGLISH_FRIENDLY = new Set(['en', 'english']);

/**
 * Initialize queue tables if they don't exist yet.
 * Called on server startup.
 */
function initQueueTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_date      TEXT NOT NULL,
      slot            TEXT NOT NULL CHECK(slot IN ('morning', 'afternoon', 'evening', 'bonus')),
      title           TEXT NOT NULL,
      year            INTEGER,
      imdb_id         TEXT,
      tmdb_id         INTEGER,
      source_type     TEXT NOT NULL DEFAULT 'mdblist',
      source_list     TEXT,
      source_list_id  INTEGER,
      runtime         INTEGER,
      genres          TEXT,
      language        TEXT DEFAULT 'en',
      poster_path     TEXT,
      streaming_on    TEXT,
      reason          TEXT,
      status          TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned', 'watching', 'completed', 'skipped', 'deferred')),
      assigned_at     TEXT DEFAULT (datetime('now')),
      started_at      TEXT,
      completed_at    TEXT,
      rating          INTEGER CHECK(rating BETWEEN 1 AND 10),
      letterboxd_logged INTEGER DEFAULT 0,
      notes           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queue_date ON daily_queue(queue_date);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON daily_queue(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_date_slot ON daily_queue(queue_date, slot);

    CREATE TABLE IF NOT EXISTS queue_history (
      imdb_id         TEXT PRIMARY KEY,
      title           TEXT,
      queued_count    INTEGER DEFAULT 1,
      last_queued     TEXT DEFAULT (datetime('now')),
      completed       INTEGER DEFAULT 0,
      skipped         INTEGER DEFAULT 0
    );
  `);
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get today's queue — the films assigned for today
 */
function getTodayQueue() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM daily_queue
    WHERE queue_date = ?
    ORDER BY CASE slot
      WHEN 'morning' THEN 1
      WHEN 'afternoon' THEN 2
      WHEN 'evening' THEN 3
      WHEN 'bonus' THEN 4
    END
  `).all(todayStr());
}

/**
 * Get the current assignment — the next film that needs watching
 */
function getCurrentAssignment() {
  const db = getDb();
  // First: any film currently being watched
  let current = db.prepare(`
    SELECT * FROM daily_queue
    WHERE queue_date = ? AND status = 'watching'
    ORDER BY assigned_at LIMIT 1
  `).get(todayStr());

  if (current) return { ...current, state: 'in_progress' };

  // Next: the first assigned film not yet started
  current = db.prepare(`
    SELECT * FROM daily_queue
    WHERE queue_date = ? AND status = 'assigned'
    ORDER BY CASE slot
      WHEN 'morning' THEN 1
      WHEN 'afternoon' THEN 2
      WHEN 'evening' THEN 3
      WHEN 'bonus' THEN 4
    END
    LIMIT 1
  `).get(todayStr());

  if (current) return { ...current, state: 'up_next' };

  // All done for today
  const completed = db.prepare(`
    SELECT COUNT(*) as count FROM daily_queue
    WHERE queue_date = ? AND status = 'completed'
  `).get(todayStr());

  return { state: 'all_done', completed_count: completed.count };
}

/**
 * Mark a film as "watching" (started)
 */
function startWatching(queueId) {
  const db = getDb();
  db.prepare(`
    UPDATE daily_queue SET status = 'watching', started_at = datetime('now')
    WHERE id = ? AND status = 'assigned'
  `).run(queueId);
  return getCurrentAssignment();
}

/**
 * Mark a film as completed, with optional rating
 */
function completeWatch(queueId, rating = null, notes = null) {
  const db = getDb();
  db.prepare(`
    UPDATE daily_queue
    SET status = 'completed', completed_at = datetime('now'),
        rating = COALESCE(?, rating), notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(rating, notes, queueId);

  // Update queue history
  const item = db.prepare('SELECT imdb_id, title FROM daily_queue WHERE id = ?').get(queueId);
  if (item && item.imdb_id) {
    db.prepare(`
      INSERT INTO queue_history (imdb_id, title, completed)
      VALUES (?, ?, 1)
      ON CONFLICT(imdb_id) DO UPDATE SET completed = completed + 1, last_queued = datetime('now')
    `).run(item.imdb_id, item.title);
  }

  return getCurrentAssignment();
}

/**
 * Skip a film (with reason)
 */
function skipFilm(queueId, reason = null) {
  const db = getDb();
  db.prepare(`
    UPDATE daily_queue SET status = 'skipped', notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(reason, queueId);

  const item = db.prepare('SELECT imdb_id FROM daily_queue WHERE id = ?').get(queueId);
  if (item && item.imdb_id) {
    db.prepare(`
      INSERT INTO queue_history (imdb_id, title, skipped)
      VALUES (?, '', 1)
      ON CONFLICT(imdb_id) DO UPDATE SET skipped = skipped + 1
    `).run(item.imdb_id);
  }

  return getCurrentAssignment();
}

/**
 * Defer a film to tomorrow
 */
function deferFilm(queueId) {
  const db = getDb();
  db.prepare(`
    UPDATE daily_queue SET status = 'deferred'
    WHERE id = ?
  `).run(queueId);
  return getCurrentAssignment();
}

/**
 * Pull films from all MDB lists and build today's queue.
 * This is the core engine — it runs once per day.
 *
 * Rules:
 * - 2 films minimum (morning + afternoon)
 * - English-language preferred for daytime slots
 * - Never repeat a film already in queue_history (unless completed pool is exhausted)
 * - Pulls from ALL user MDB lists, shuffled
 */
async function buildDailyQueue(forceRebuild = false) {
  const db = getDb();
  const today = todayStr();

  // Check if queue already exists for today
  const existing = db.prepare('SELECT COUNT(*) as count FROM daily_queue WHERE queue_date = ?').get(today);
  if (existing.count > 0 && !forceRebuild) {
    console.log(`[Queue] Today's queue already built (${existing.count} films). Use forceRebuild to override.`);
    return getTodayQueue();
  }

  // If forcing rebuild, clear today's queue
  if (forceRebuild) {
    db.prepare('DELETE FROM daily_queue WHERE queue_date = ? AND status = \'assigned\'').run(today);
  }

  console.log('[Queue] Building daily queue...');

  // Get all previously queued IMDb IDs to avoid repeats
  const previouslyQueued = new Set(
    db.prepare('SELECT imdb_id FROM queue_history').all().map(r => r.imdb_id)
  );

  // Also exclude films already watched (from the main films table)
  const alreadyWatched = new Set(
    db.prepare('SELECT imdb_id FROM films WHERE imdb_id IS NOT NULL').all().map(r => r.imdb_id)
  );

  // Pull from MDB lists
  let allCandidates = [];
  try {
    const lists = await getUserLists();
    console.log(`[Queue] Found ${lists.length} MDB lists`);

    for (const list of lists) {
      try {
        const items = await getListItems(list.id);
        const withSource = (Array.isArray(items) ? items : []).map(item => ({
          ...item,
          source_list: list.name,
          source_list_id: list.id,
        }));
        allCandidates.push(...withSource);
      } catch (err) {
        console.warn(`[Queue] Failed to fetch list "${list.name}": ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[Queue] Failed to fetch MDB lists: ${err.message}`);

    // Fallback: pull from discovery_pool
    console.log('[Queue] Falling back to discovery pool...');
    const pool = db.prepare(`
      SELECT title, year, imdb_id, tmdb_id, runtime, genres, language,
             taste_score, taste_rationale, poster_path
      FROM discovery_pool
      WHERE excluded = 0 AND taste_score IS NOT NULL
      ORDER BY taste_score DESC
      LIMIT 200
    `).all();

    allCandidates = pool.map(p => ({
      title: p.title,
      year: p.year,
      imdb_id: p.imdb_id,
      tmdb_id: p.tmdb_id,
      runtime: p.runtime,
      genre: p.genres,
      language: p.language || 'en',
      source_list: 'Discovery Pool',
      source_list_id: null,
      score: p.taste_score,
      poster: p.poster_path,
    }));
  }

  console.log(`[Queue] ${allCandidates.length} total candidates across all lists`);

  // Filter out already queued and already watched
  let fresh = allCandidates.filter(c => {
    const id = c.imdb_id || c.imdb;
    return id && !previouslyQueued.has(id) && !alreadyWatched.has(id);
  });

  console.log(`[Queue] ${fresh.length} fresh candidates after filtering`);

  // Separate English and non-English
  const english = fresh.filter(c => {
    const lang = (c.language || c.lang || '').toLowerCase();
    return !lang || ENGLISH_FRIENDLY.has(lang);
  });

  const nonEnglish = fresh.filter(c => {
    const lang = (c.language || c.lang || '').toLowerCase();
    return lang && !ENGLISH_FRIENDLY.has(lang);
  });

  // Shuffle both pools
  shuffle(english);
  shuffle(nonEnglish);

  // Pick films for each slot
  const slots = ['morning', 'afternoon'];
  const picks = [];

  for (const slot of slots) {
    // Daytime: English only. Evening: allow non-English.
    const pool = slot === 'evening' ? [...nonEnglish, ...english] : english;
    const pick = pool.shift();
    if (pick) {
      // Remove from english array too if we took from combined
      if (slot === 'evening') {
        const idx = english.indexOf(pick);
        if (idx >= 0) english.splice(idx, 1);
        const nIdx = nonEnglish.indexOf(pick);
        if (nIdx >= 0) nonEnglish.splice(nIdx, 1);
      }

      picks.push({ slot, film: pick });
    }
  }

  if (picks.length === 0) {
    console.warn('[Queue] No candidates available for today\'s queue!');
    return [];
  }

  // Insert picks into daily_queue
  const insert = db.prepare(`
    INSERT OR IGNORE INTO daily_queue
    (queue_date, slot, title, year, imdb_id, tmdb_id, source_type, source_list,
     source_list_id, runtime, genres, language, poster_path, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'mdblist', ?, ?, ?, ?, ?, ?, ?, 'assigned')
  `);

  const historyInsert = db.prepare(`
    INSERT OR IGNORE INTO queue_history (imdb_id, title) VALUES (?, ?)
  `);

  for (const { slot, film } of picks) {
    const imdbId = film.imdb_id || film.imdb || null;
    const title = film.title || 'Unknown';
    const year = film.year || null;
    const tmdbId = film.tmdb_id || film.tmdb || null;
    const genres = film.genre || film.genres || '';
    const lang = film.language || film.lang || 'en';
    const runtime = film.runtime || null;
    const poster = film.poster || film.poster_path || null;
    const reason = buildReason(film, slot);

    insert.run(today, slot, title, year, imdbId, tmdbId,
      film.source_list, film.source_list_id,
      runtime, genres, lang, poster, reason);

    if (imdbId) {
      historyInsert.run(imdbId, title);
    }
  }

  console.log(`[Queue] Built queue with ${picks.length} films for ${today}`);
  return getTodayQueue();
}

/**
 * Build a one-line reason why this film was picked
 */
function buildReason(film, slot) {
  const parts = [];
  if (film.source_list) parts.push(`From your "${film.source_list}" list`);
  if (film.score && film.score > 70) parts.push(`Taste score: ${Math.round(film.score)}`);
  if (film.imdb_rating && film.imdb_rating > 7) parts.push(`IMDb: ${film.imdb_rating}`);
  if (slot === 'morning') parts.push('Morning session');
  if (slot === 'afternoon') parts.push('Afternoon session');
  return parts.join(' · ') || 'Selected for you';
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Get queue stats (streak, completion rate, etc.)
 */
function getQueueStats() {
  const db = getDb();

  const totalAssigned = db.prepare('SELECT COUNT(*) as count FROM daily_queue').get().count;
  const totalCompleted = db.prepare('SELECT COUNT(*) as count FROM daily_queue WHERE status = \'completed\'').get().count;
  const totalSkipped = db.prepare('SELECT COUNT(*) as count FROM daily_queue WHERE status = \'skipped\'').get().count;

  // Streak: consecutive days with at least 1 completion
  const days = db.prepare(`
    SELECT DISTINCT queue_date FROM daily_queue
    WHERE status = 'completed'
    ORDER BY queue_date DESC
    LIMIT 30
  `).all().map(r => r.queue_date);

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];
    if (days[i] === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  // Today's progress
  const todayTotal = db.prepare('SELECT COUNT(*) as count FROM daily_queue WHERE queue_date = ?').get(todayStr()).count;
  const todayDone = db.prepare('SELECT COUNT(*) as count FROM daily_queue WHERE queue_date = ? AND status = \'completed\'').get(todayStr()).count;

  return {
    total_assigned: totalAssigned,
    total_completed: totalCompleted,
    total_skipped: totalSkipped,
    completion_rate: totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0,
    current_streak: streak,
    today_total: todayTotal,
    today_completed: todayDone,
  };
}

/**
 * Get recent queue history
 */
function getQueueHistory(limit = 14) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM daily_queue
    ORDER BY queue_date DESC, assigned_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  initQueueTables,
  getTodayQueue,
  getCurrentAssignment,
  startWatching,
  completeWatch,
  skipFilm,
  deferFilm,
  buildDailyQueue,
  getQueueStats,
  getQueueHistory,
};
