const { query, queryOne } = require('../db');

// Tool definitions exposed to Claude. Keep descriptions sharp — Claude uses them to decide when to call.

const TOOLS = [
  {
    name: 'search_library',
    description: 'Search the user\'s WATCHED films. Filter by any combination of title substring, genre, decade, director, min/max rating, max runtime. Returns up to 30 films with id/title/year/rating/directors/genres.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Substring match against title (case-insensitive).' },
        genre: { type: 'string', description: 'Genre name, e.g. "Drama", "Sci-Fi".' },
        decade: { type: 'integer', description: 'Decade as a 4-digit year, e.g. 1970 or 2010.' },
        director: { type: 'string', description: 'Director name substring.' },
        min_rating: { type: 'integer', description: 'Minimum user rating (1-10).' },
        max_rating: { type: 'integer', description: 'Maximum user rating (1-10).' },
        max_runtime: { type: 'integer', description: 'Maximum runtime in minutes.' },
        limit: { type: 'integer', description: 'Max rows to return (default 20, cap 30).' },
      },
    },
  },
  {
    name: 'search_discovery',
    description: 'Search the DISCOVERY pool — films the user has NOT watched, scored against their taste. Filter by genre/decade/runtime/min_taste_score. Returns taste_score and rationale per film. Use this for "what should I watch that\'s new to me" questions.',
    input_schema: {
      type: 'object',
      properties: {
        genre: { type: 'string' },
        decade: { type: 'integer' },
        max_runtime: { type: 'integer' },
        min_taste_score: { type: 'number', description: 'Default 60.' },
        limit: { type: 'integer', description: 'Default 20, cap 30.' },
      },
    },
  },
  {
    name: 'get_film',
    description: 'Get full detail for one film (from the watched library), including overview, cast, notes, and streaming availability.',
    input_schema: {
      type: 'object',
      properties: {
        film_id: { type: 'integer', description: 'films.id.' },
      },
      required: ['film_id'],
    },
  },
  {
    name: 'list_watchlist',
    description: 'List films on the user\'s watchlist (to-watch). Optionally filter by category.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'e.g. "to_watch" or "gap_fill".' },
        limit: { type: 'integer', description: 'Default 20, cap 50.' },
      },
    },
  },
  {
    name: 'list_rewatch_candidates',
    description: 'Suggest films from the watched library worth rewatching (rated 7+, weighted by time since last watch + genre rewatchability).',
    input_schema: {
      type: 'object',
      properties: {
        mood: { type: 'string', description: 'Optional: action, cerebral, comfort, etc.' },
        limit: { type: 'integer', description: 'Default 10, cap 20.' },
      },
    },
  },
];

function normalizeLimit(n, def, cap) {
  const x = Number.isFinite(n) ? Math.floor(Number(n)) : def;
  return Math.max(1, Math.min(cap, x));
}

function searchLibrary(args = {}) {
  const params = [];
  const where = [];

  if (args.title) { where.push('f.title LIKE ?'); params.push(`%${args.title}%`); }
  if (args.genre) {
    where.push(`f.id IN (SELECT fg.film_id FROM film_genres fg JOIN genres g ON g.id = fg.genre_id WHERE g.name LIKE ?)`);
    params.push(`%${args.genre}%`);
  }
  if (args.decade) {
    where.push('f.year >= ? AND f.year < ?');
    params.push(Number(args.decade), Number(args.decade) + 10);
  }
  if (args.director) {
    where.push(`f.id IN (SELECT fc.film_id FROM film_credits fc JOIN people p ON p.id = fc.person_id WHERE fc.role = 'director' AND p.name LIKE ?)`);
    params.push(`%${args.director}%`);
  }
  if (args.min_rating != null) { where.push('r.rating >= ?'); params.push(Number(args.min_rating)); }
  if (args.max_rating != null) { where.push('r.rating <= ?'); params.push(Number(args.max_rating)); }
  if (args.max_runtime != null) { where.push('f.runtime <= ?'); params.push(Number(args.max_runtime)); }

  // Watched library implies at least one watch
  where.push('EXISTS (SELECT 1 FROM watches w WHERE w.film_id = f.id)');

  const limit = normalizeLimit(args.limit, 20, 30);
  const sql = `
    SELECT f.id, f.title, f.year, f.runtime, r.rating,
      (SELECT GROUP_CONCAT(DISTINCT g.name) FROM film_genres fg
        JOIN genres g ON g.id = fg.genre_id WHERE fg.film_id = f.id) AS genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id
        WHERE fc.film_id = f.id AND fc.role = 'director') AS directors
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE ${where.join(' AND ')}
    ORDER BY r.rating DESC, f.title
    LIMIT ?
  `;
  return query(sql, [...params, limit]);
}

function searchDiscovery(args = {}) {
  const params = [];
  const where = ['excluded = 0', 'taste_score IS NOT NULL'];

  const minScore = args.min_taste_score != null ? Number(args.min_taste_score) : 60;
  where.push('taste_score >= ?');
  params.push(minScore);

  if (args.genre) { where.push('LOWER(genres) LIKE ?'); params.push(`%${String(args.genre).toLowerCase()}%`); }
  if (args.decade) { where.push('year >= ? AND year < ?'); params.push(Number(args.decade), Number(args.decade) + 10); }
  if (args.max_runtime != null) { where.push('runtime <= ?'); params.push(Number(args.max_runtime)); }

  const limit = normalizeLimit(args.limit, 20, 30);
  const sql = `
    SELECT id, title, year, runtime, genres, taste_score, taste_rationale,
      imdb_rating, tmdb_rating, rt_tomatometer, metascore
    FROM discovery_pool
    WHERE ${where.join(' AND ')}
    ORDER BY taste_score DESC
    LIMIT ?
  `;
  const rows = query(sql, [...params, limit]);
  return rows.map(r => ({
    ...r,
    taste_rationale: (() => { try { return JSON.parse(r.taste_rationale); } catch { return r.taste_rationale; } })(),
  }));
}

function getFilm(args = {}) {
  const id = Number(args.film_id);
  if (!Number.isFinite(id)) return { error: 'film_id required' };

  const film = queryOne(`
    SELECT f.id, f.title, f.year, f.runtime, f.overview, f.tagline,
      f.tmdb_id, f.imdb_id, f.original_language,
      r.rating, r.rated_at,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) AS last_watched,
      (SELECT COUNT(*) FROM watches w WHERE w.film_id = f.id) AS watch_count
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE f.id = ?
  `, [id]);
  if (!film) return { error: 'not-found' };

  const genres = query(`
    SELECT g.name FROM film_genres fg JOIN genres g ON g.id = fg.genre_id WHERE fg.film_id = ?
  `, [id]).map(g => g.name);
  const directors = query(`
    SELECT p.name FROM film_credits fc JOIN people p ON p.id = fc.person_id
    WHERE fc.film_id = ? AND fc.role = 'director'
  `, [id]).map(p => p.name);
  const cast = query(`
    SELECT p.name, fc.character_name FROM film_credits fc JOIN people p ON p.id = fc.person_id
    WHERE fc.film_id = ? AND fc.role = 'actor' ORDER BY fc.credit_order LIMIT 10
  `, [id]);
  const notes = query(`
    SELECT note_type, content, created_at FROM film_notes WHERE film_id = ? ORDER BY created_at DESC
  `, [id]);
  const streaming = query(`
    SELECT provider_name, type FROM streaming_availability WHERE film_id = ?
  `, [id]);

  return { ...film, genres, directors, cast, notes, streaming };
}

function listWatchlist(args = {}) {
  const limit = normalizeLimit(args.limit, 20, 50);
  const params = [];
  let sql = 'SELECT id, title, year, category, priority, notes, added_at FROM watchlist';
  if (args.category) { sql += ' WHERE category = ?'; params.push(args.category); }
  sql += ' ORDER BY priority DESC, added_at DESC LIMIT ?';
  params.push(limit);
  return query(sql, params);
}

function listRewatchCandidates(args = {}) {
  const limit = normalizeLimit(args.limit, 10, 20);
  // Simple rewatch ranking: rating + time decay since last watch
  const rows = query(`
    SELECT f.id, f.title, f.year, f.runtime, r.rating,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) AS last_watched,
      (SELECT GROUP_CONCAT(DISTINCT g.name) FROM film_genres fg
        JOIN genres g ON g.id = fg.genre_id WHERE fg.film_id = f.id) AS genres
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    WHERE r.rating >= 7
    ORDER BY r.rating DESC, last_watched ASC
    LIMIT ?
  `, [limit * 3]);

  const now = Date.now();
  const scored = rows.map(r => {
    const daysSince = r.last_watched ? (now - new Date(r.last_watched).getTime()) / (1000 * 60 * 60 * 24) : 9999;
    const timeScore = Math.min(1, daysSince / (365 * 2));
    const ratingScore = (r.rating - 7) / 3;
    let moodBoost = 0;
    if (args.mood && r.genres) {
      const genres = r.genres.toLowerCase();
      const mood = args.mood.toLowerCase();
      if (mood.includes('comfort') && /comedy|romance|family/.test(genres)) moodBoost = 0.3;
      else if (mood.includes('action') && /action|thriller|adventure/.test(genres)) moodBoost = 0.3;
      else if (mood.includes('cerebral') && /drama|mystery|sci-fi|sci fi|documentary/.test(genres)) moodBoost = 0.3;
    }
    return { ...r, rewatch_score: Math.round((0.5 * ratingScore + 0.4 * timeScore + moodBoost) * 100) };
  });
  scored.sort((a, b) => b.rewatch_score - a.rewatch_score);
  return scored.slice(0, limit);
}

const HANDLERS = {
  search_library: searchLibrary,
  search_discovery: searchDiscovery,
  get_film: getFilm,
  list_watchlist: listWatchlist,
  list_rewatch_candidates: listRewatchCandidates,
};

function runTool(name, input) {
  const fn = HANDLERS[name];
  if (!fn) return { error: `unknown tool: ${name}` };
  try {
    return fn(input || {});
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { TOOLS, runTool };
