const { Router } = require('express');
const { getRewatchSuggestions, getMoods } = require('../rewatch/rewatchRadar');
const router = Router();

router.get('/suggestions', (req, res) => {
  const { mood, count } = req.query;
  const suggestions = getRewatchSuggestions({
    mood: mood || null,
    count: count ? Number(count) : 20,
  });
  res.json(suggestions);
});

router.get('/moods', (req, res) => {
  res.json(getMoods());
});

module.exports = router;
