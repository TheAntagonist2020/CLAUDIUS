const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { getDb } = require('./db');
const { runFullImport } = require('./import/runFullImport');
const { enrichFilms, getEnrichmentStatus } = require('./enrichment/enrichFilms');
const { buildTasteProfile } = require('./taste/buildProfile');
const { scoreDiscoveryPool } = require('./discovery/recommend');
const {
  getDailyPick, getReminderStatus,
  setupScheduledReminder, removeScheduledReminder,
} = require('./reminder');
const { isAuthenticated } = require('./trakt/traktClient');
const { syncFromTrakt } = require('./trakt/traktSync');
const { startScheduler: startPushScheduler } = require('./notifications/scheduler');

const app = express();
app.use(cors());
app.use(express.json());

// Auth — generate a session token on startup
const SESSION_TOKEN = require('crypto').randomBytes(32).toString('hex');

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!config.APP_PASSWORD || password === config.APP_PASSWORD) {
    return res.json({ token: SESSION_TOKEN });
  }
  res.status(401).json({ error: 'Wrong password' });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  res.json({ valid: token === SESSION_TOKEN });
});

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
app.use('/api/queue', require('./routes/queue'));
app.use('/api/trakt', require('./routes/trakt'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/put-it-on', require('./routes/putItOn'));

// Import endpoint
app.post('/api/import/run', (req, res) => {
  try {
    const result = runFullImport();
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

app.listen(config.PORT, () => {
  console.log(`\n  CLAUDIUS server running on http://localhost:${config.PORT}\n`);

  // Scheduled Trakt sync
  const syncIntervalMs = config.TRAKT_SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    if (!isAuthenticated()) return;
    console.log('[Trakt] Running scheduled sync...');
    syncFromTrakt().catch(err => console.error('[Trakt] Scheduled sync error:', err.message));
  }, syncIntervalMs);

  // Push-notification scheduler (ntfy.sh)
  startPushScheduler();
});
