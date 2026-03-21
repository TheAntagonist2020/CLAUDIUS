const express = require('express');
const router = express.Router();
const {
  getTodayQueue,
  getCurrentAssignment,
  startWatching,
  completeWatch,
  skipFilm,
  deferFilm,
  buildDailyQueue,
  getQueueStats,
  getQueueHistory,
} = require('../queue/dailyQueue');
const {
  exportLetterboxdDiary,
  exportLetterboxdWatchlist,
  getUnloggedWatches,
  markAsLogged,
} = require('../queue/letterboxd');

// GET /api/queue/today — today's full queue
router.get('/today', (req, res) => {
  try {
    res.json(getTodayQueue());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/queue/current — the current assignment (what to watch RIGHT NOW)
router.get('/current', (req, res) => {
  try {
    res.json(getCurrentAssignment());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/start/:id — mark a film as "watching"
router.post('/start/:id', (req, res) => {
  try {
    res.json(startWatching(Number(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/complete/:id — mark a film as completed
router.post('/complete/:id', (req, res) => {
  try {
    const { rating, notes } = req.body || {};
    res.json(completeWatch(Number(req.params.id), rating, notes));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/skip/:id — skip a film
router.post('/skip/:id', (req, res) => {
  try {
    const { reason } = req.body || {};
    res.json(skipFilm(Number(req.params.id), reason));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/defer/:id — defer to tomorrow
router.post('/defer/:id', (req, res) => {
  try {
    res.json(deferFilm(Number(req.params.id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/build — manually trigger queue build
router.post('/build', async (req, res) => {
  try {
    const { force } = req.body || {};
    const queue = await buildDailyQueue(!!force);
    res.json({ success: true, queue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/queue/stats — queue performance stats
router.get('/stats', (req, res) => {
  try {
    res.json(getQueueStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/queue/history — recent queue history
router.get('/history', (req, res) => {
  try {
    const { limit = 30 } = req.query;
    res.json(getQueueHistory(Number(limit)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Letterboxd exports ---

// GET /api/queue/letterboxd/diary — download diary CSV
router.get('/letterboxd/diary', (req, res) => {
  try {
    const { from, to } = req.query;
    const csv = exportLetterboxdDiary({ fromDate: from, toDate: to });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="claudius-letterboxd-diary.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/queue/letterboxd/watchlist — download watchlist CSV
router.get('/letterboxd/watchlist', (req, res) => {
  try {
    const csv = exportLetterboxdWatchlist();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="claudius-letterboxd-watchlist.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/queue/letterboxd/unlogged — watches not yet logged
router.get('/letterboxd/unlogged', (req, res) => {
  try {
    res.json(getUnloggedWatches());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queue/letterboxd/mark-logged — mark watches as logged
router.post('/letterboxd/mark-logged', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    markAsLogged(ids);
    res.json({ success: true, marked: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
