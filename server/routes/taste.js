const { Router } = require('express');
const { getDb } = require('../db');
const { buildTasteProfile } = require('../taste/buildProfile');
const router = Router();

router.get('/profile', (req, res) => {
  const db = getDb();
  const meta = {};
  db.prepare('SELECT key, value FROM taste_profile_meta').all().forEach(row => {
    try { meta[row.key] = JSON.parse(row.value); } catch { meta[row.key] = row.value; }
  });
  res.json(meta);
});

router.get('/genres', (req, res) => {
  const db = getDb();
  const genres = db.prepare('SELECT * FROM taste_genre_affinity ORDER BY affinity_score DESC').all();
  res.json(genres);
});

router.get('/directors', (req, res) => {
  const db = getDb();
  const directors = db.prepare('SELECT * FROM taste_director_affinity ORDER BY affinity_score DESC LIMIT 50').all();
  res.json(directors);
});

router.get('/decades', (req, res) => {
  const db = getDb();
  const decades = db.prepare('SELECT * FROM taste_decade_affinity ORDER BY decade').all();
  res.json(decades);
});

router.post('/rebuild', (req, res) => {
  try {
    buildTasteProfile();
    res.json({ success: true, message: 'Taste profile rebuilt.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
