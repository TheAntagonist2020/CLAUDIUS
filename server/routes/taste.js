const { Router } = require('express');
const { query } = require('../db');
const { buildTasteProfile } = require('../taste/buildProfile');
const router = Router();

router.get('/profile', async (req, res) => {
  try {
    const rows = await query('SELECT key, value FROM taste_profile_meta');
    const meta = {};
    rows.forEach(row => {
      try { meta[row.key] = JSON.parse(row.value); } catch { meta[row.key] = row.value; }
    });
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/genres', async (req, res) => {
  try {
    const genres = await query('SELECT * FROM taste_genre_affinity ORDER BY affinity_score DESC');
    res.json(genres);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/directors', async (req, res) => {
  try {
    const directors = await query('SELECT * FROM taste_director_affinity ORDER BY affinity_score DESC LIMIT 50');
    res.json(directors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/decades', async (req, res) => {
  try {
    const decades = await query('SELECT * FROM taste_decade_affinity ORDER BY decade');
    res.json(decades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rebuild', async (req, res) => {
  try {
    await buildTasteProfile();
    res.json({ success: true, message: 'Taste profile rebuilt.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
