const { Router } = require('express');
const { getRewatchSuggestions, getMoods } = require('../rewatch/rewatchRadar');
const router = Router();

router.get('/suggestions', async (req, res) => {
  try {
    const { mood, count } = req.query;
    const suggestions = await getRewatchSuggestions({
      mood: mood || null,
      count: count ? Number(count) : 20,
    });
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/moods', (req, res) => {
  res.json(getMoods());
});

module.exports = router;
