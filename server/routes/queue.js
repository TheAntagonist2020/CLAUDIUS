const { Router } = require('express');
const { query, queryOne, execute } = require('../db');
const { generateDailyQueue, addBonusSlot } = require('../queue/generateQueue');

const router = Router();

const SLOT_ORDER = "CASE slot WHEN 'morning' THEN 1 WHEN 'afternoon' THEN 2 WHEN 'evening' THEN 3 WHEN 'bonus' THEN 4 END";

router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let queueRows = await query(
      `SELECT * FROM queue WHERE queue_date = ? ORDER BY ${SLOT_ORDER}`, [today]
    );

    if (queueRows.length === 0) {
      await generateDailyQueue(today);
      queueRows = await query(
        `SELECT * FROM queue WHERE queue_date = ? ORDER BY ${SLOT_ORDER}`, [today]
      );
    }

    const current = queueRows.find(q => q.status === 'watching') || queueRows.find(q => q.status === 'assigned');
    const completed = queueRows.filter(q => q.status === 'completed');
    const total = queueRows.length;

    res.json({
      date: today,
      queue: queueRows,
      current,
      progress: {
        completed: completed.length,
        total,
        pct: total > 0 ? Math.round((completed.length / total) * 100) : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/current', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const count = await queryOne('SELECT COUNT(*) as cnt FROM queue WHERE queue_date = ?', [today]);
    if (count.cnt === 0) {
      await generateDailyQueue(today);
    }

    let current = await queryOne(
      "SELECT * FROM queue WHERE queue_date = ? AND status = 'watching'", [today]
    );
    if (!current) {
      current = await queryOne(`
        SELECT * FROM queue WHERE queue_date = ? AND status = 'assigned'
        ORDER BY ${SLOT_ORDER} LIMIT 1
      `, [today]);
    }

    if (!current) {
      const completedCount = await queryOne(
        "SELECT COUNT(*) as cnt FROM queue WHERE queue_date = ? AND status = 'completed'", [today]
      );
      return res.json({
        done: true,
        completed: completedCount.cnt,
        message: completedCount.cnt > 0
          ? `You watched ${completedCount.cnt} film${completedCount.cnt > 1 ? 's' : ''} today.`
          : 'No films queued for today.',
      });
    }

    res.json({ done: false, film: current });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/start/:id', async (req, res) => {
  try {
    await execute("UPDATE queue SET status = 'watching', started_at = datetime('now') WHERE id = ?", [req.params.id]);
    const film = await queryOne('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    res.json({ success: true, film });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/complete/:id', async (req, res) => {
  try {
    const film = await queryOne('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    if (!film) return res.status(404).json({ error: 'Not found' });

    await execute("UPDATE queue SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [req.params.id]);

    await execute(`
      INSERT INTO queue_history (title, year, imdb_id, completed_at, slot, queue_date)
      VALUES (?, ?, ?, datetime('now'), ?, ?)
    `, [film.title, film.year, film.imdb_id, film.slot, film.queue_date]);

    const next = await queryOne(`
      SELECT * FROM queue WHERE queue_date = ? AND status = 'assigned'
      ORDER BY ${SLOT_ORDER} LIMIT 1
    `, [film.queue_date]);

    const completedCount = await queryOne(
      "SELECT COUNT(*) as cnt FROM queue WHERE queue_date = ? AND status = 'completed'", [film.queue_date]
    );

    res.json({
      success: true,
      completed: completedCount.cnt,
      next: next || null,
      allDone: !next,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skip/:id', async (req, res) => {
  try {
    const film = await queryOne('SELECT * FROM queue WHERE id = ?', [req.params.id]);
    if (!film) return res.status(404).json({ error: 'Not found' });

    await execute("UPDATE queue SET status = 'skipped' WHERE id = ?", [req.params.id]);

    const next = await queryOne(`
      SELECT * FROM queue WHERE queue_date = ? AND status = 'assigned'
      ORDER BY ${SLOT_ORDER} LIMIT 1
    `, [film.queue_date]);

    res.json({ success: true, next: next || null, allDone: !next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bonus', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await addBonusSlot(today);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/regenerate', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const started = await queryOne(
      "SELECT COUNT(*) as cnt FROM queue WHERE queue_date = ? AND status IN ('watching', 'completed')", [today]
    );
    if (started.cnt > 0) {
      return res.status(400).json({ error: 'Cannot regenerate — you already started watching today. Use skip or bonus instead.' });
    }

    await execute('DELETE FROM queue WHERE queue_date = ?', [today]);
    const result = await generateDailyQueue(today);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalCompleted = (await queryOne('SELECT COUNT(*) as cnt FROM queue_history')).cnt;
    const thisWeek = (await queryOne(`
      SELECT COUNT(*) as cnt FROM queue_history
      WHERE completed_at >= date('now', '-7 days')
    `)).cnt;
    const streak = await calculateStreak();
    const recent = await query('SELECT * FROM queue_history ORDER BY completed_at DESC LIMIT 10');

    res.json({ totalCompleted, thisWeek, streak, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function calculateStreak() {
  const days = (await query(`
    SELECT DISTINCT date(completed_at) as day FROM queue_history
    ORDER BY day DESC LIMIT 60
  `)).map(r => r.day);

  if (days.length === 0) return 0;

  let streak = 0;
  let expected = new Date();
  expected.setHours(0, 0, 0, 0);

  for (const day of days) {
    const d = new Date(day + 'T00:00:00');
    const diff = Math.round((expected - d) / (1000 * 60 * 60 * 24));
    if (diff <= 1) {
      streak++;
      expected = d;
      expected.setDate(expected.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

module.exports = router;
