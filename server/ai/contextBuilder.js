const { query, queryOne } = require('../db');

// Compose a compact taste-profile snapshot for use as cached system-prompt context.
// Kept deterministic so the prompt-cache prefix doesn't rotate between requests.

function buildTasteContext() {
  const meta = {};
  for (const row of query('SELECT key, value FROM taste_profile_meta')) {
    meta[row.key] = row.value;
  }

  const parseJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

  const topGenres = query(`
    SELECT genre_name, films_watched, avg_rating, affinity_score
    FROM taste_genre_affinity
    ORDER BY affinity_score DESC
    LIMIT 15
  `);
  const topDirectors = query(`
    SELECT director_name, films_watched, avg_rating, affinity_score
    FROM taste_director_affinity
    WHERE films_watched >= 2
    ORDER BY affinity_score DESC
    LIMIT 25
  `);
  const topDecades = query(`
    SELECT decade, films_watched, avg_rating, affinity_score
    FROM taste_decade_affinity
    ORDER BY affinity_score DESC
    LIMIT 6
  `);

  const highestRated = query(`
    SELECT f.title, f.year, r.rating,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id
        WHERE fc.film_id = f.id AND fc.role = 'director') AS directors
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    ORDER BY r.rating DESC, f.title
    LIMIT 30
  `);

  const recentWatches = query(`
    SELECT f.title, f.year, r.rating,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) AS last_watched
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE EXISTS (SELECT 1 FROM watches w WHERE w.film_id = f.id)
    ORDER BY last_watched DESC
    LIMIT 30
  `);

  const recentHighs = query(`
    SELECT f.title, f.year, r.rating
    FROM films f JOIN ratings r ON r.film_id = f.id
    WHERE r.rating >= 9 AND r.rated_at >= date('now', '-180 days')
    ORDER BY r.rated_at DESC
    LIMIT 12
  `);

  const recentLows = query(`
    SELECT f.title, f.year, r.rating
    FROM films f JOIN ratings r ON r.film_id = f.id
    WHERE r.rating <= 5 AND r.rated_at >= date('now', '-180 days')
    ORDER BY r.rated_at DESC
    LIMIT 8
  `);

  const username = queryOne(`
    SELECT value FROM taste_profile_meta WHERE key = 'username'
  `)?.value || 'the user';

  const fmtFilm = (f) => `${f.title} (${f.year})${f.rating != null ? ` — ${f.rating}/10` : ''}${f.directors ? ` · ${f.directors}` : ''}`;

  const sections = [
    `Username: ${username}`,
    `Overall avg rating: ${meta.overall_avg_rating ?? '?'} | Total watched: ${meta.total_watched ?? '?'} | Rated: ${meta.total_rated ?? '?'}`,
    '',
    `TOP GENRES (affinity score, avg rating, films watched):`,
    ...topGenres.map(g => `  - ${g.genre_name}: ${g.affinity_score} (${g.avg_rating}/10, ${g.films_watched} films)`),
    '',
    `TOP DIRECTORS (affinity score, avg rating, films watched):`,
    ...topDirectors.map(d => `  - ${d.director_name}: ${d.affinity_score} (${d.avg_rating}/10, ${d.films_watched} films)`),
    '',
    `TOP DECADES:`,
    ...topDecades.map(d => `  - ${d.decade}s: affinity ${d.affinity_score} (${d.avg_rating}/10 across ${d.films_watched} films)`),
    '',
    `HIGHEST-RATED (sample of 30):`,
    ...highestRated.map(fmtFilm).map(s => `  - ${s}`),
    '',
    `RECENTLY WATCHED (30):`,
    ...recentWatches.map(fmtFilm).map(s => `  - ${s}`),
  ];

  if (recentHighs.length) {
    sections.push('', 'RECENT 9+ RATINGS (last 180 days):', ...recentHighs.map(fmtFilm).map(s => `  - ${s}`));
  }
  if (recentLows.length) {
    sections.push('', 'RECENT LOW RATINGS (last 180 days, ≤5):', ...recentLows.map(fmtFilm).map(s => `  - ${s}`));
  }

  return sections.join('\n');
}

module.exports = { buildTasteContext };
