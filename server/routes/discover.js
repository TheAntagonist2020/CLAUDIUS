const { Router } = require('express');
const { queryOne, execute } = require('../db');
const { scoreDiscoveryPool, getRecommendations } = require('../discovery/recommend');
const router = Router();

router.get('/recommendations', async (req, res) => {
  try {
    const { count, genre, decade, min_runtime, max_runtime, mood } = req.query;
    const recs = await getRecommendations({
      count: count ? Number(count) : 20,
      genre, decade,
      minRuntime: min_runtime,
      maxRuntime: max_runtime,
      mood,
    });

    const results = recs.map(r => ({
      ...r,
      taste_rationale: r.taste_rationale ? JSON.parse(r.taste_rationale) : [],
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/score', async (req, res) => {
  try {
    await scoreDiscoveryPool();
    res.json({ success: true, message: 'Discovery pool scored.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dismiss/:id', async (req, res) => {
  try {
    await execute('UPDATE discovery_pool SET excluded = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = (await queryOne('SELECT COUNT(*) as cnt FROM discovery_pool WHERE excluded = 0')).cnt;
    const scored = (await queryOne('SELECT COUNT(*) as cnt FROM discovery_pool WHERE taste_score IS NOT NULL AND excluded = 0')).cnt;
    const avgScore = (await queryOne('SELECT AVG(taste_score) as avg FROM discovery_pool WHERE taste_score IS NOT NULL AND excluded = 0')).avg;

    res.json({ total, scored, avgScore: Math.round((avgScore || 0) * 10) / 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
