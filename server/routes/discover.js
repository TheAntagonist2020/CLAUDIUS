const { Router } = require('express');
const { getDb } = require('../db');
const { scoreDiscoveryPool, getRecommendations } = require('../discovery/recommend');
const router = Router();

router.get('/recommendations', (req, res) => {
  const { count, genre, decade, min_runtime, max_runtime, mood } = req.query;
  const recs = getRecommendations({
    count: count ? Number(count) : 20,
    genre, decade,
    minRuntime: min_runtime,
    maxRuntime: max_runtime,
    mood,
  });

  // Parse rationale JSON
  const results = recs.map(r => ({
    ...r,
    taste_rationale: r.taste_rationale ? JSON.parse(r.taste_rationale) : [],
  }));

  res.json(results);
});

router.post('/score', (req, res) => {
  try {
    scoreDiscoveryPool();
    res.json({ success: true, message: 'Discovery pool scored.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dismiss/:id', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE discovery_pool SET excluded = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.get('/stats', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as cnt FROM discovery_pool WHERE excluded = 0').get().cnt;
  const scored = db.prepare('SELECT COUNT(*) as cnt FROM discovery_pool WHERE taste_score IS NOT NULL AND excluded = 0').get().cnt;
  const avgScore = db.prepare('SELECT AVG(taste_score) as avg FROM discovery_pool WHERE taste_score IS NOT NULL AND excluded = 0').get().avg;

  res.json({ total, scored, avgScore: Math.round((avgScore || 0) * 10) / 10 });
});

module.exports = router;
