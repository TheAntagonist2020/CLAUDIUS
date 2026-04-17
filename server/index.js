const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');
const { runFullImport } = require('./import/runFullImport');
const { importTraktExport } = require('./import/importTraktExport');
const { seedDemo } = require('./import/seedDemo');
const { enrichFilms, getEnrichmentStatus } = require('./enrichment/enrichFilms');
const { buildTasteProfile } = require('./taste/buildProfile');
const { scoreDiscoveryPool } = require('./discovery/recommend');
const {
  getDailyPick, getReminderStatus,
  setupScheduledReminder, removeScheduledReminder,
} = require('./reminder');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '..', 'dist')));

// API Routes
app.use('/api/films', require('./routes/films'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/taste', require('./routes/taste'));
app.use('/api/discover', require('./routes/discover'));
app.use('/api/rewatch', require('./routes/rewatch'));
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/mdblist', require('./routes/mdblist'));
app.use('/api/curator', require('./routes/curator'));

// Import endpoints
app.post('/api/import/run', (req, res) => {
  try {
    const result = runFullImport();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/trakt', (req, res) => {
  try {
    // Clear any stuck transaction from a previous failed run
    const db = getDb();
    if (db.inTransaction) { try { db.exec('ROLLBACK'); } catch {} }

    const sourcePath = (req.body && req.body.path) || null;
    const result = importTraktExport(sourcePath);
    if (result && result.error) {
      return res.status(400).json({ success: false, ...result });
    }

    if (db.inTransaction) { try { db.exec('ROLLBACK'); } catch {} }
    try { buildTasteProfile(); } catch (e) { console.error('buildTasteProfile:', e.message); }
    if (db.inTransaction) { try { db.exec('ROLLBACK'); } catch {} }
    try { scoreDiscoveryPool(); } catch (e) { console.error('scoreDiscoveryPool:', e.message); }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/seed', (req, res) => {
  try {
    const result = seedDemo();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enrichment endpoints
app.post('/api/enrich/run', async (req, res) => {
  const { batch = 100 } = req.body || {};
  res.json({ message: `Enrichment started for ${batch} films.` });
  try {
    await enrichFilms(Number(batch));
    // After enrichment, rebuild taste profile and score discovery
    buildTasteProfile();
    scoreDiscoveryPool();
  } catch (err) {
    console.error('Enrichment error:', err);
  }
});

app.get('/api/enrich/status', (req, res) => {
  res.json(getEnrichmentStatus());
});

// Notes
app.post('/api/notes', (req, res) => {
  const db = getDb();
  const { film_id, note_type = 'general', content } = req.body;
  const result = db.prepare('INSERT INTO film_notes (film_id, note_type, content) VALUES (?, ?, ?)').run(film_id, note_type, content);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/notes/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM film_notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Reminder system
app.get('/api/reminder/daily', (req, res) => {
  try {
    const pick = getDailyPick();
    if (!pick) return res.status(404).json({ error: 'No pick available' });
    res.json(pick);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reminder/status', (req, res) => {
  res.json(getReminderStatus());
});

app.post('/api/reminder/setup', (req, res) => {
  const { time } = req.body;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Time must be in HH:MM format' });
  }
  const result = setupScheduledReminder(time);
  res.json(result);
});

app.post('/api/reminder/remove', (req, res) => {
  const result = removeScheduledReminder();
  res.json(result);
});

// Search across everything
app.get('/api/search', (req, res) => {
  const db = getDb();
  const { q } = req.query;
  if (!q) return res.json({ films: [], discovery: [] });

  const films = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, r.rating
    FROM films f LEFT JOIN ratings r ON r.film_id = f.id
    WHERE f.title LIKE ? ORDER BY r.rating DESC LIMIT 10
  `).all(`%${q}%`);

  const discovery = db.prepare(`
    SELECT id, title, year, genres, taste_score
    FROM discovery_pool WHERE title LIKE ? AND excluded = 0
    ORDER BY taste_score DESC LIMIT 10
  `).all(`%${q}%`);

  res.json({ films, discovery });
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(config.PORT, config.HOST, () => {
  const shown = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
  console.log(`\n  CLAUDIUS server running on http://${shown}:${config.PORT}`);
  if (config.HOST === '0.0.0.0') {
    console.log(`  (reachable from other devices on your LAN at http://<your-ip>:${config.PORT})\n`);
  }
});
