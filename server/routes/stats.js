const { Router } = require('express');
const { getDb } = require('../db');
const router = Router();

router.get('/overview', (req, res) => {
  const db = getDb();

  const totalWatched = db.prepare('SELECT COUNT(*) as cnt FROM films').get().cnt;
  const totalRated = db.prepare('SELECT COUNT(*) as cnt FROM ratings').get().cnt;
  const avgRating = db.prepare('SELECT AVG(rating) as avg FROM ratings').get().avg;
  const totalHours = db.prepare('SELECT SUM(runtime) / 60 as hours FROM films WHERE runtime IS NOT NULL').get().hours;
  const yearRange = db.prepare('SELECT MIN(year) as min_year, MAX(year) as max_year FROM films').get();
  const enriched = db.prepare('SELECT COUNT(*) as cnt FROM films WHERE enriched = 1').get().cnt;
  const discoveryPool = db.prepare('SELECT COUNT(*) as cnt FROM discovery_pool WHERE excluded = 0').get().cnt;
  const watchlistCount = db.prepare('SELECT COUNT(*) as cnt FROM watchlist').get().cnt;

  // Recent activity
  const recentWatches = db.prepare(`
    SELECT f.title, f.year, f.poster_path, r.rating, w.watched_at
    FROM watches w
    JOIN films f ON f.id = w.film_id
    LEFT JOIN ratings r ON r.film_id = f.id
    ORDER BY w.watched_at DESC LIMIT 10
  `).all();

  // Rating distribution
  const ratingDist = db.prepare(`
    SELECT rating, COUNT(*) as count FROM ratings GROUP BY rating ORDER BY rating
  `).all();

  // Top genres by count
  const topGenres = db.prepare(`
    SELECT g.name, COUNT(*) as count, AVG(r.rating) as avg_rating
    FROM film_genres fg
    JOIN genres g ON g.id = fg.genre_id
    LEFT JOIN ratings r ON r.film_id = fg.film_id
    GROUP BY g.id
    ORDER BY count DESC
    LIMIT 10
  `).all();

  // Films by decade
  const byDecade = db.prepare(`
    SELECT (year / 10 * 10) as decade, COUNT(*) as count, AVG(r.rating) as avg_rating
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE f.year IS NOT NULL
    GROUP BY decade
    ORDER BY decade
  `).all();

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
});

module.exports = router;
