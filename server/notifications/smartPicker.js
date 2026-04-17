const { getDb } = require('../db');

// Returns a single film pick shaped for "just put something on right now."
// Time-aware: late night → low-commitment comfort rewatch; weekday evening →
// discovery prime time; weekend afternoon → can handle ambitious runtimes.

function classifyContext(now = new Date()) {
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  const weekend = day === 0 || day === 6;

  // Hour buckets
  let slot;
  if (hour >= 22 || hour < 5) slot = 'late_night';
  else if (hour >= 18) slot = 'prime';
  else if (hour >= 14) slot = 'afternoon';
  else slot = 'daytime';

  return { hour, day, weekend, slot };
}

function pickParamsFor(ctx) {
  // Bias toward discovery during prime weekend/evening slots; bias toward
  // low-friction rewatch in late night and daytime. Cap runtime tight late.
  if (ctx.slot === 'late_night') {
    return { preferDiscovery: false, maxRuntime: 115, minRating: 8 };
  }
  if (ctx.slot === 'prime') {
    // Evening: lean discovery but allow up to ~160 min
    return { preferDiscovery: true, maxRuntime: 160, minRating: 8 };
  }
  if (ctx.slot === 'afternoon' && ctx.weekend) {
    // Weekend afternoon: the ambitious slot
    return { preferDiscovery: true, maxRuntime: 200, minRating: 8 };
  }
  // Daytime / weekend morning → background-friendly rewatch
  return { preferDiscovery: false, maxRuntime: 140, minRating: 8 };
}

function pickDiscovery(db, { maxRuntime }) {
  // Date-seeded offset so the same hour bucket doesn't serve identical picks.
  // Count pool size first so small libraries don't fall off the end.
  const runtimeClause = maxRuntime
    ? 'AND (runtime IS NULL OR runtime <= ' + Number(maxRuntime) + ')'
    : '';
  const count = db.prepare(`
    SELECT COUNT(*) AS c FROM discovery_pool
    WHERE excluded = 0 AND taste_score IS NOT NULL AND taste_score >= 60 ${runtimeClause}
  `).get().c;
  if (!count) return null;
  const seed = Math.floor(Date.now() / (1000 * 60 * 60)) % Math.min(count, 20);
  return db.prepare(`
    SELECT id, title, year, runtime, genres, imdb_id, tmdb_id, poster_path,
      taste_score, taste_rationale, imdb_rating, rt_tomatometer
    FROM discovery_pool
    WHERE excluded = 0 AND taste_score IS NOT NULL AND taste_score >= 60 ${runtimeClause}
    ORDER BY taste_score DESC
    LIMIT 1 OFFSET ?
  `).get(seed);
}

function pickComfortRewatch(db, { minRating, maxRuntime }) {
  const runtimeClause = maxRuntime
    ? 'AND (f.runtime IS NULL OR f.runtime <= ' + Number(maxRuntime) + ')'
    : '';
  const count = db.prepare(`
    SELECT COUNT(*) AS c FROM films f
    JOIN ratings r ON r.film_id = f.id
    WHERE r.rating >= ? ${runtimeClause}
  `).get(minRating).c;
  if (!count) return null;
  const seed = Math.floor(Date.now() / (1000 * 60 * 60)) % Math.min(count, 40);
  return db.prepare(`
    SELECT f.id, f.title, f.year, f.runtime, f.imdb_id, f.tmdb_id, f.poster_path,
      r.rating,
      (SELECT GROUP_CONCAT(DISTINCT g.name) FROM film_genres fg
        JOIN genres g ON g.id = fg.genre_id WHERE fg.film_id = f.id) AS genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id
        WHERE fc.film_id = f.id AND fc.role = 'director') AS directors,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) AS last_watched
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    WHERE r.rating >= ? ${runtimeClause}
    ORDER BY r.rating DESC,
      CASE WHEN (SELECT MAX(w2.watched_at) FROM watches w2 WHERE w2.film_id = f.id) IS NULL THEN 0 ELSE 1 END,
      (SELECT MAX(w2.watched_at) FROM watches w2 WHERE w2.film_id = f.id) ASC
    LIMIT 1 OFFSET ?
  `).get(minRating, seed);
}

function stremioUrl(film) {
  if (film?.imdb_id) return `stremio:///detail/movie/${film.imdb_id}`;
  if (film?.tmdb_id) return `stremio:///detail/movie/tmdb:${film.tmdb_id}`;
  return null;
}

function getSmartPick({ now = new Date(), mode } = {}) {
  const db = getDb();
  const ctx = classifyContext(now);
  const params = pickParamsFor(ctx);

  // Explicit override from caller
  if (mode === 'discovery') params.preferDiscovery = true;
  if (mode === 'comfort') params.preferDiscovery = false;

  // Try with current constraints; if nothing matches (small library, tight
  // runtime cap, etc.), relax progressively so we always return something.
  const attempts = [
    params,
    { ...params, maxRuntime: null },          // drop runtime cap
    { ...params, maxRuntime: null, minRating: Math.max(6, (params.minRating || 8) - 2) },
  ];

  let film = null;
  let pickType = null;

  for (const p of attempts) {
    if (params.preferDiscovery) {
      film = pickDiscovery(db, p);
      pickType = 'discovery';
      if (!film) { film = pickComfortRewatch(db, p); pickType = 'comfort'; }
    } else {
      film = pickComfortRewatch(db, p);
      pickType = 'comfort';
      if (!film) { film = pickDiscovery(db, p); pickType = 'discovery'; }
    }
    if (film) break;
  }

  if (!film) return null;

  let rationale;
  if (pickType === 'comfort') {
    const last = film.last_watched ? new Date(film.last_watched) : null;
    const daysSince = last ? Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24)) : null;
    rationale = last
      ? `You rated this ${film.rating}/10 · last watched ${daysSince < 365 ? daysSince + ' days ago' : Math.floor(daysSince / 365) + ' years ago'}`
      : `You rated this ${film.rating}/10`;
  } else {
    const reasons = (() => { try { return JSON.parse(film.taste_rationale); } catch { return null; } })();
    rationale = Array.isArray(reasons) && reasons[0] ? reasons[0] : 'Matched to your taste';
  }

  const slotLabel = {
    late_night: 'something low-key before bed',
    prime: 'prime time — a proper pick',
    afternoon: ctx.weekend ? 'weekend afternoon — go for it' : 'afternoon break',
    daytime: 'background-friendly',
  }[ctx.slot];

  return {
    pick_type: pickType,
    slot: ctx.slot,
    slot_label: slotLabel,
    film: {
      id: film.id,
      title: film.title,
      year: film.year,
      runtime: film.runtime,
      genres: film.genres,
      imdb_id: film.imdb_id,
      tmdb_id: film.tmdb_id,
      poster_path: film.poster_path,
      rating: film.rating || null,
      taste_score: film.taste_score || null,
      directors: film.directors || null,
    },
    rationale,
    stremio_url: stremioUrl(film),
    generated_at: now.toISOString(),
  };
}

module.exports = { getSmartPick, classifyContext };
