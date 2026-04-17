const { Router } = require('express');
const { query, queryOne, execute } = require('../db');
const router = Router();

router.get('/', async (req, res) => {
  try {
    const { category, lane, sort = 'priority' } = req.query;
    let sql = 'SELECT * FROM watchlist WHERE 1=1';
    const params = [];

    if (category) { sql += ` AND category = ?`; params.push(category); }
    if (lane) { sql += ` AND lane = ?`; params.push(lane); }

    const sortMap = { priority: 'priority ASC', recent: 'added_at DESC', title: 'title ASC' };
    sql += ` ORDER BY ${sortMap[sort] || sortMap.priority}`;

    res.json(await query(sql, params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, year, tmdb_id, category = 'to_watch', priority = 0, lane, notes } = req.body;
    const result = await execute(`
      INSERT INTO watchlist (title, year, tmdb_id, category, priority, lane, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
    `, [title, year, tmdb_id, category, priority, lane, notes]);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { category, priority, notes } = req.body;
    const sets = [];
    const params = [];
    if (category !== undefined) { sets.push(`category = ?`); params.push(category); }
    if (priority !== undefined) { sets.push(`priority = ?`); params.push(priority); }
    if (notes !== undefined) { sets.push(`notes = ?`); params.push(notes); }
    if (sets.length === 0) return res.json({ success: true });
    params.push(req.params.id);
    await execute(`UPDATE watchlist SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await execute('DELETE FROM watchlist WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
