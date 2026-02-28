const { Router } = require('express');
const { getCuratedPicks, getSinglePick, PAIRING_STRATEGIES } = require('../discovery/curator');

const router = Router();

// Get tonight's double feature
router.get('/tonight', (req, res) => {
  try {
    const { mood, seed, maxRuntime, rewatch } = req.query;
    const result = getCuratedPicks({
      mood: mood || undefined,
      seed: seed ? Number(seed) : undefined,
      maxRuntime: maxRuntime ? Number(maxRuntime) : undefined,
      rewatch: rewatch || 'either',
    });
    res.json(result);
  } catch (err) {
    console.error('Curator error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single perfect pick
router.get('/single', (req, res) => {
  try {
    const { mood, maxRuntime, rewatch } = req.query;
    const film = getSinglePick({
      mood: mood || undefined,
      maxRuntime: maxRuntime ? Number(maxRuntime) : undefined,
      rewatch: rewatch || 'either',
    });
    if (!film) return res.status(404).json({ error: 'No pick found' });
    res.json(film);
  } catch (err) {
    console.error('Curator single error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List available pairing strategies
router.get('/strategies', (req, res) => {
  res.json(PAIRING_STRATEGIES);
});

module.exports = router;
