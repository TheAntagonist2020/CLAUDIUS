const { query, queryOne, execute, transaction } = require('../db');

async function buildTasteProfile() {
  console.log('Building taste profile...');

  await buildGenreAffinity();
  await buildDirectorAffinity();
  await buildDecadeAffinity();
  await buildProfileMeta();

  console.log('Taste profile built.');
}

async function buildGenreAffinity() {
  await execute('DELETE FROM taste_genre_affinity');

  const overallAvg = (await queryOne('SELECT AVG(rating) as avg FROM ratings')).avg || 7;

  const genres = await query(`
    SELECT g.id, g.name,
      COUNT(DISTINCT fg.film_id) as films_watched,
      COUNT(DISTINCT r.film_id) as films_rated,
      AVG(r.rating) as avg_rating,
      SUM(CASE WHEN r.rating >= 8 THEN 1 ELSE 0 END) * 100.0 / MAX(COUNT(r.film_id), 1) as high_rate_pct
    FROM genres g
    JOIN film_genres fg ON fg.genre_id = g.id
    LEFT JOIN ratings r ON r.film_id = fg.film_id
    GROUP BY g.id, g.name
    HAVING COUNT(DISTINCT r.film_id) >= 5
    ORDER BY AVG(r.rating) DESC
  `);

  const maxWatched = Math.max(...genres.map(g => g.films_watched), 1);

  await transaction(async (client) => {
    for (const g of genres) {
      const ratingNorm = Math.max(0, (g.avg_rating - overallAvg + 2) / 4) * 100;
      const highRateNorm = g.high_rate_pct;
      const volumeNorm = (g.films_watched / maxWatched) * 100;
      const affinity = 0.4 * ratingNorm + 0.3 * highRateNorm + 0.3 * volumeNorm;

      await client.query(`
        INSERT INTO taste_genre_affinity (genre_id, genre_name, films_watched, films_rated, avg_rating, high_rate_pct, affinity_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [g.id, g.name, g.films_watched, g.films_rated,
        Math.round(g.avg_rating * 100) / 100, Math.round(g.high_rate_pct * 10) / 10,
        Math.round(affinity * 10) / 10]);
    }
  });
}

async function buildDirectorAffinity() {
  await execute('DELETE FROM taste_director_affinity');

  const directors = await query(`
    SELECT p.id, p.name,
      COUNT(DISTINCT fc.film_id) as films_watched,
      COUNT(DISTINCT r.film_id) as films_rated,
      AVG(r.rating) as avg_rating
    FROM people p
    JOIN film_credits fc ON fc.person_id = p.id AND fc.role = 'director'
    LEFT JOIN ratings r ON r.film_id = fc.film_id
    GROUP BY p.id, p.name
    HAVING COUNT(DISTINCT r.film_id) >= 2
    ORDER BY AVG(r.rating) DESC
  `);

  await transaction(async (client) => {
    for (const d of directors) {
      const ratingScore = Math.max(0, ((d.avg_rating - 5) / 5)) * 100;
      const volumeBonus = Math.min(d.films_watched * 5, 30);
      const affinity = Math.min(100, ratingScore + volumeBonus);

      await client.query(`
        INSERT INTO taste_director_affinity (person_id, director_name, films_watched, films_rated, avg_rating, affinity_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [d.id, d.name, d.films_watched, d.films_rated,
        Math.round(d.avg_rating * 100) / 100, Math.round(affinity * 10) / 10]);
    }
  });
}

async function buildDecadeAffinity() {
  await execute('DELETE FROM taste_decade_affinity');

  const overallAvg = (await queryOne('SELECT AVG(rating) as avg FROM ratings')).avg || 7;

  const decades = await query(`
    SELECT (f.year / 10 * 10) as decade,
      COUNT(DISTINCT f.id) as films_watched,
      COUNT(DISTINCT r.film_id) as films_rated,
      AVG(r.rating) as avg_rating
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE f.year IS NOT NULL
    GROUP BY (f.year / 10 * 10)
    ORDER BY (f.year / 10 * 10)
  `);

  const maxWatched = Math.max(...decades.map(d => d.films_watched), 1);

  await transaction(async (client) => {
    for (const d of decades) {
      const volumeScore = (d.films_watched / maxWatched) * 100;
      const qualityScore = d.avg_rating ? Math.max(0, ((d.avg_rating - overallAvg + 2) / 4)) * 100 : 50;
      const affinity = 0.5 * qualityScore + 0.5 * volumeScore;

      await client.query(`
        INSERT INTO taste_decade_affinity (decade, films_watched, films_rated, avg_rating, volume_score, quality_score, affinity_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [d.decade, d.films_watched, d.films_rated,
        d.avg_rating ? Math.round(d.avg_rating * 100) / 100 : null,
        Math.round(volumeScore * 10) / 10,
        Math.round(qualityScore * 10) / 10,
        Math.round(affinity * 10) / 10]);
    }
  });
}

async function buildProfileMeta() {
  await execute('DELETE FROM taste_profile_meta');

  const stats = await queryOne(`
    SELECT
      COUNT(DISTINCT f.id) as total_watched,
      (SELECT COUNT(*) FROM ratings) as total_rated,
      (SELECT AVG(rating) FROM ratings) as overall_avg,
      (SELECT MIN(year) FROM films) as min_year,
      (SELECT MAX(year) FROM films) as max_year,
      (SELECT SUM(runtime) FROM films WHERE runtime IS NOT NULL) as total_runtime_min
    FROM films f
  `);

  const inserts = [
    ['total_watched', stats.total_watched],
    ['total_rated', stats.total_rated],
    ['overall_avg_rating', Math.round((stats.overall_avg || 0) * 100) / 100],
    ['year_range', JSON.stringify([stats.min_year, stats.max_year])],
    ['total_runtime_hours', Math.round((stats.total_runtime_min || 0) / 60)],
  ];

  const dist = await query('SELECT rating, COUNT(*) as cnt FROM ratings GROUP BY rating ORDER BY rating');
  inserts.push(['rating_distribution', JSON.stringify(dist)]);

  const topGenres = await query('SELECT genre_name, affinity_score FROM taste_genre_affinity ORDER BY affinity_score DESC LIMIT 10');
  inserts.push(['top_genres', JSON.stringify(topGenres)]);

  const topDirectors = await query('SELECT director_name, avg_rating, films_watched FROM taste_director_affinity ORDER BY affinity_score DESC LIMIT 20');
  inserts.push(['top_directors', JSON.stringify(topDirectors)]);

  const topDecades = await query('SELECT decade, affinity_score FROM taste_decade_affinity ORDER BY affinity_score DESC LIMIT 5');
  inserts.push(['top_decades', JSON.stringify(topDecades)]);

  await transaction(async (client) => {
    for (const [key, value] of inserts) {
      await client.query(
        'INSERT INTO taste_profile_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, String(value)]
      );
    }
  });
}

module.exports = { buildTasteProfile };
