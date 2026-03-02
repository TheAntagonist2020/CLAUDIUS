const express = require('express');
const router = express.Router();
const { runScrape, getScrapeStatus, NORTH_STAR_USERNAME } = require('../scraper/scrapeLetterboxd');
const { getDb } = require('../db');

// POST /api/letterboxd/scrape  — kick off a background scrape
router.post('/scrape', async (req, res) => {
  const { username = NORTH_STAR_USERNAME } = req.body || {};
  try {
    await runScrape(username);
    res.json({ message: `Scrape started for @${username}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/letterboxd/status  — poll scrape progress + DB counts
router.get('/status', (req, res) => {
  res.json(getScrapeStatus());
});

// GET /api/letterboxd/films  — browse scraped films (with optional ?rated=1&limit=50)
router.get('/films', (req, res) => {
  const db = getDb();
  const { rated, limit = 100, offset = 0 } = req.query;

  let sql = `
    SELECT lb_slug, title, lb_rating, rating_10, tmdb_id, year
    FROM letterboxd_influences
    WHERE username = ?
  `;
  const params = [NORTH_STAR_USERNAME];

  if (rated === '1') {
    sql += ' AND lb_rating IS NOT NULL';
  }

  sql += ' ORDER BY lb_rating DESC NULLS LAST, title ASC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const films = db.prepare(sql).all(...params);
  res.json(films);
});

module.exports = router;
