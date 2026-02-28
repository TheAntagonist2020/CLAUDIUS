const { Router } = require('express');
const { getDb } = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { category, lane, sort = 'priority' } = req.query;
  let query = 'SELECT * FROM watchlist WHERE 1=1';
  const params = [];

  if (category) { query += ' AND category = ?'; params.push(category); }
  if (lane) { query += ' AND lane = ?'; params.push(lane); }

  const sortMap = { priority: 'priority ASC', recent: 'added_at DESC', title: 'title ASC' };
  query += ` ORDER BY ${sortMap[sort] || sortMap.priority}`;

  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const db = getDb();
  const { title, year, tmdb_id, category = 'to_watch', priority = 0, lane, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO watchlist (title, year, tmdb_id, category, priority, lane, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
  `).run(title, year, tmdb_id, category, priority, lane, notes);
  res.json({ id: result.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
  const db = getDb();
  const { category, priority, notes } = req.body;
  const sets = [];
  const params = [];
  if (category !== undefined) { sets.push('category = ?'); params.push(category); }
  if (priority !== undefined) { sets.push('priority = ?'); params.push(priority); }
  if (notes !== undefined) { sets.push('notes = ?'); params.push(notes); }
  if (sets.length === 0) return res.json({ success: true });
  params.push(req.params.id);
  db.prepare(`UPDATE watchlist SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
