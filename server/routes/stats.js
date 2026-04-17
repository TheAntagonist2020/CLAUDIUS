const { Router } = require('express');
const { queryOne, query } = require('../db');
const router = Router();

router.get('/overview', async (req, res) => {
  try {
    const totalWatched = (await queryOne('SELECT COUNT(*) as cnt FROM films')).cnt;
    const totalRated = (await queryOne('SELECT COUNT(*) as cnt FROM ratings')).cnt;
    const avgRating = (await queryOne('SELECT AVG(rating) as avg FROM ratings')).avg;
    const totalHours = (await queryOne('SELECT SUM(runtime) / 60 as hours FROM films WHERE runtime IS NOT NULL')).hours;
    const yearRange = await queryOne('SELECT MIN(year) as min_year, MAX(year) as max_year FROM films');
    const enriched = (await queryOne('SELECT COUNT(*) as cnt FROM films WHERE enriched = 1')).cnt;
    const discoveryPool = (await queryOne('SELECT COUNT(*) as cnt FROM discovery_pool WHERE excluded = 0')).cnt;
    const watchlistCount = (await queryOne('SELECT COUNT(*) as cnt FROM watchlist')).cnt;

    const recentWatches = await query(`
      SELECT f.title, f.year, f.poster_path, r.rating, w.watched_at
      FROM watches w
      JOIN films f ON f.id = w.film_id
      LEFT JOIN ratings r ON r.film_id = f.id
      ORDER BY w.watched_at DESC LIMIT 10
    `);

    const ratingDist = await query(`
      SELECT rating, COUNT(*) as count FROM ratings GROUP BY rating ORDER BY rating
    `);

    const topGenres = await query(`
      SELECT g.name, COUNT(*) as count, AVG(r.rating) as avg_rating
      FROM film_genres fg
      JOIN genres g ON g.id = fg.genre_id
      LEFT JOIN ratings r ON r.film_id = fg.film_id
      GROUP BY g.id, g.name
      ORDER BY count DESC
      LIMIT 10
    `);

    const byDecade = await query(`
      SELECT (f.year / 10 * 10) as decade, COUNT(*) as count, AVG(r.rating) as avg_rating
      FROM films f
      LEFT JOIN ratings r ON r.film_id = f.id
      WHERE f.year IS NOT NULL
      GROUP BY (f.year / 10 * 10)
      ORDER BY decade
    `);

    res.json({
      totalWatched,
      totalRated,
      avgRating: Math.round((avgRating || 0) * 100) / 100,
      totalHours: totalHours || 0,
      yearRange,
      enriched,
      discoveryPool,
      watchlistCount,
      recentWatches,
      ratingDist,
      topGenres,
      byDecade,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
