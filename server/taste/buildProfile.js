const { getDb } = require('../db');

function buildTasteProfile() {
  const db = getDb();
  console.log('Building taste profile...');

  buildGenreAffinity(db);
  buildDirectorAffinity(db);
  buildDecadeAffinity(db);
  buildProfileMeta(db);

  console.log('Taste profile built.');
}

function buildGenreAffinity(db) {
  db.exec('DELETE FROM taste_genre_affinity');

  const overallAvg = db.prepare('SELECT AVG(rating) as avg FROM ratings').get().avg || 7;

  const genres = db.prepare(`
    SELECT g.id, g.name,
      COUNT(DISTINCT fg.film_id) as films_watched,
      COUNT(DISTINCT r.film_id) as films_rated,
      AVG(r.rating) as avg_rating,
      SUM(CASE WHEN r.rating >= 8 THEN 1 ELSE 0 END) * 100.0 / MAX(COUNT(r.film_id), 1) as high_rate_pct
    FROM genres g
    JOIN film_genres fg ON fg.genre_id = g.id
    LEFT JOIN ratings r ON r.film_id = fg.film_id
    GROUP BY g.id
    HAVING films_rated >= 5
    ORDER BY avg_rating DESC
  `).all();

  const maxWatched = Math.max(...genres.map(g => g.films_watched), 1);
  const insert = db.prepare(`
    INSERT INTO taste_genre_affinity (genre_id, genre_name, films_watched, films_rated, avg_rating, high_rate_pct, affinity_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const g of genres) {
    const ratingNorm = Math.max(0, (g.avg_rating - overallAvg + 2) / 4) * 100;
    const highRateNorm = g.high_rate_pct;
    const volumeNorm = (g.films_watched / maxWatched) * 100;
    const affinity = 0.4 * ratingNorm + 0.3 * highRateNorm + 0.3 * volumeNorm;

    insert.run(g.id, g.name, g.films_watched, g.films_rated,
      Math.round(g.avg_rating * 100) / 100, Math.round(g.high_rate_pct * 10) / 10,
      Math.round(affinity * 10) / 10);
  }
}

function buildDirectorAffinity(db) {
  db.exec('DELETE FROM taste_director_affinity');

  const directors = db.prepare(`
    SELECT p.id, p.name,
      COUNT(DISTINCT fc.film_id) as films_watched,
      COUNT(DISTINCT r.film_id) as films_rated,
      AVG(r.rating) as avg_rating
    FROM people p
    JOIN film_credits fc ON fc.person_id = p.id AND fc.role = 'director'
    LEFT JOIN ratings r ON r.film_id = fc.film_id
    GROUP BY p.id
    HAVING films_rated >= 2
    ORDER BY avg_rating DESC
  `).all();

  const insert = db.prepare(`
    INSERT INTO taste_director_affinity (person_id, director_name, films_watched, films_rated, avg_rating, affinity_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const d of directors) {
    const ratingScore = Math.max(0, ((d.avg_rating - 5) / 5)) * 100;
    const volumeBonus = Math.min(d.films_watched * 5, 30);
    const affinity = Math.min(100, ratingScore + volumeBonus);

    insert.run(d.id, d.name, d.films_watched, d.films_rated,
      Math.round(d.avg_rating * 100) / 100, Math.round(affinity * 10) / 10);
  }
}

function buildDecadeAffinity(db) {
  db.exec('DELETE FROM taste_decade_affinity');

  const overallAvg = db.prepare('SELECT AVG(rating) as avg FROM ratings').get().avg || 7;
  const totalRated = db.prepare('SELECT COUNT(*) as cnt FROM ratings').get().cnt || 1;

  const decades = db.prepare(`
    SELECT (f.year / 10 * 10) as decade,
      COUNT(DISTINCT f.id) as films_watched,
      COUNT(DISTINCT r.film_id) as films_rated,
      AVG(r.rating) as avg_rating
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE f.year IS NOT NULL
    GROUP BY decade
    ORDER BY decade
  `).all();

  const insert = db.prepare(`
    INSERT INTO taste_decade_affinity (decade, films_watched, films_rated, avg_rating, volume_score, quality_score, affinity_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const maxWatched = Math.max(...decades.map(d => d.films_watched), 1);

  for (const d of decades) {
    const volumeScore = (d.films_watched / maxWatched) * 100;
    const qualityScore = d.avg_rating ? Math.max(0, ((d.avg_rating - overallAvg + 2) / 4)) * 100 : 50;
    const affinity = 0.5 * qualityScore + 0.5 * volumeScore;

    insert.run(d.decade, d.films_watched, d.films_rated,
      d.avg_rating ? Math.round(d.avg_rating * 100) / 100 : null,
      Math.round(volumeScore * 10) / 10,
      Math.round(qualityScore * 10) / 10,
      Math.round(affinity * 10) / 10);
  }
}

function buildProfileMeta(db) {
  db.exec('DELETE FROM taste_profile_meta');
  const insert = db.prepare('INSERT OR REPLACE INTO taste_profile_meta (key, value) VALUES (?, ?)');

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT f.id) as total_watched,
      (SELECT COUNT(*) FROM ratings) as total_rated,
      (SELECT AVG(rating) FROM ratings) as overall_avg,
      (SELECT MIN(year) FROM films) as min_year,
      (SELECT MAX(year) FROM films) as max_year,
      (SELECT SUM(runtime) FROM films WHERE runtime IS NOT NULL) as total_runtime_min
    FROM films f
  `).get();

  insert.run('total_watched', stats.total_watched);
  insert.run('total_rated', stats.total_rated);
  insert.run('overall_avg_rating', Math.round((stats.overall_avg || 0) * 100) / 100);
  insert.run('year_range', JSON.stringify([stats.min_year, stats.max_year]));
  insert.run('total_runtime_hours', Math.round((stats.total_runtime_min || 0) / 60));

  // Rating distribution
  const dist = db.prepare(`
    SELECT rating, COUNT(*) as cnt FROM ratings GROUP BY rating ORDER BY rating
  `).all();
  insert.run('rating_distribution', JSON.stringify(dist));

  // Top genres
  const topGenres = db.prepare(`
    SELECT genre_name, affinity_score FROM taste_genre_affinity ORDER BY affinity_score DESC LIMIT 10
  `).all();
  insert.run('top_genres', JSON.stringify(topGenres));

  // Top directors
  const topDirectors = db.prepare(`
    SELECT director_name, avg_rating, films_watched FROM taste_director_affinity ORDER BY affinity_score DESC LIMIT 20
  `).all();
  insert.run('top_directors', JSON.stringify(topDirectors));

  // Top decades
  const topDecades = db.prepare(`
    SELECT decade, affinity_score FROM taste_decade_affinity ORDER BY affinity_score DESC LIMIT 5
  `).all();
  insert.run('top_decades', JSON.stringify(topDecades));
}

module.exports = { buildTasteProfile };
