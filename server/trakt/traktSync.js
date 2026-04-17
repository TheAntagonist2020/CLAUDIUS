const { traktFetch, loadTokens } = require('./traktClient');
const { getDb } = require('../db');

let syncStatus = { running: false, lastSync: null, stats: null, error: null };

function getSyncStatus() {
  return { ...syncStatus };
}

function getUsername() {
  const tokens = loadTokens();
  if (!tokens?.username) throw new Error('Trakt username not found — complete auth first');
  return tokens.username;
}

async function syncFromTrakt() {
  if (syncStatus.running) return { already_running: true };

  const username = getUsername();
  syncStatus = { running: true, lastSync: null, stats: null, error: null };

  const db = getDb();
  const stats = { watched: 0, ratings: 0, watchlist: 0 };

  const insertFilm = db.prepare(`
    INSERT OR IGNORE INTO films (title, year, tmdb_id, imdb_id, trakt_id, slug)
    VALUES (@title, @year, @tmdb_id, @imdb_id, @trakt_id, @slug)
  `);
  const getFilmByTmdb = db.prepare('SELECT id FROM films WHERE tmdb_id = ?');
  const getFilmByTrakt = db.prepare('SELECT id FROM films WHERE trakt_id = ?');

  function upsertFilm(movie) {
    const ids = movie.ids || {};
    if (!ids.tmdb && !ids.trakt) return null;
    insertFilm.run({
      title: movie.title,
      year: movie.year || null,
      tmdb_id: ids.tmdb || null,
      imdb_id: ids.imdb || null,
      trakt_id: ids.trakt || null,
      slug: ids.slug || null,
    });
    return ids.tmdb ? getFilmByTmdb.get(ids.tmdb) : getFilmByTrakt.get(ids.trakt);
  }

  try {
    // --- WATCHED MOVIES ---
    console.log('[Trakt] Fetching watched movies...');
    const watched = await traktFetch(`/users/${username}/watched/movies`);

    const watchExists = db.prepare(
      'SELECT 1 FROM watches WHERE film_id = ? AND watched_at = ?'
    );
    const insertWatch = db.prepare(`
      INSERT INTO watches (film_id, watched_at, source)
      VALUES (@film_id, @watched_at, 'trakt')
    `);

    const syncWatched = db.transaction(() => {
      for (const item of watched) {
        const film = upsertFilm(item.movie);
        if (!film || !item.last_watched_at) continue;
        if (!watchExists.get(film.id, item.last_watched_at)) {
          insertWatch.run({ film_id: film.id, watched_at: item.last_watched_at });
        }
        stats.watched++;
      }
    });
    syncWatched();

    // --- RATINGS ---
    console.log('[Trakt] Fetching ratings...');
    const ratings = await traktFetch(`/users/${username}/ratings/movies`);

    const insertRating = db.prepare(`
      INSERT OR REPLACE INTO ratings (film_id, rating, rated_at, source)
      VALUES (@film_id, @rating, @rated_at, 'trakt')
    `);

    const syncRatings = db.transaction(() => {
      for (const item of ratings) {
        const film = upsertFilm(item.movie);
        if (!film) continue;
        if (item.rating >= 1 && item.rating <= 10) {
          insertRating.run({
            film_id: film.id,
            rating: item.rating,
            rated_at: item.rated_at || null,
          });
          stats.ratings++;
        }
      }
    });
    syncRatings();

    // --- WATCHLIST ---
    console.log('[Trakt] Fetching watchlist...');
    const watchlist = await traktFetch(`/users/${username}/watchlist/movies`);

    const watchlistExists = db.prepare(
      'SELECT 1 FROM watchlist WHERE tmdb_id = ? AND category = ?'
    );
    const insertWatchlist = db.prepare(`
      INSERT INTO watchlist (film_id, tmdb_id, title, year, category, source, added_at)
      VALUES (@film_id, @tmdb_id, @title, @year, 'to_watch', 'trakt', @added_at)
    `);

    const syncWatchlist = db.transaction(() => {
      for (const item of watchlist) {
        const m = item.movie;
        const ids = m.ids || {};
        if (!ids.tmdb && !ids.trakt) continue;

        const film = upsertFilm(m);
        if (ids.tmdb && watchlistExists.get(ids.tmdb, 'to_watch')) continue;

        insertWatchlist.run({
          film_id: film ? film.id : null,
          tmdb_id: ids.tmdb || null,
          title: m.title,
          year: m.year || null,
          added_at: item.listed_at || new Date().toISOString(),
        });
        stats.watchlist++;
      }
    });
    syncWatchlist();

    // Log success
    db.prepare(`
      INSERT INTO trakt_sync_log (synced_at, watched_count, ratings_count, watchlist_count, status)
      VALUES (datetime('now'), ?, ?, ?, 'success')
    `).run(stats.watched, stats.ratings, stats.watchlist);

    syncStatus = { running: false, lastSync: new Date().toISOString(), stats, error: null };
    console.log('[Trakt] Sync complete:', stats);
    return stats;

  } catch (err) {
    try {
      db.prepare(`
        INSERT INTO trakt_sync_log (synced_at, status, error_message)
        VALUES (datetime('now'), 'error', ?)
      `).run(err.message);
    } catch {}
    syncStatus = { running: false, lastSync: new Date().toISOString(), stats: null, error: err.message };
    throw err;
  }
}

module.exports = { syncFromTrakt, getSyncStatus };
