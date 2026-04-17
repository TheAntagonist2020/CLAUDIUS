const { Router } = require('express');
const { getSmartPick } = require('../notifications/smartPicker');
const { pushToNtfy, pushSmartPick } = require('../notifications/ntfy');
const { loadSettings, saveSettings } = require('../notifications/scheduler');

const router = Router();

// Smart pick — GET /api/put-it-on?mode=discovery|comfort|auto
router.get('/', (req, res) => {
  try {
    const { mode } = req.query;
    const pick = getSmartPick({ mode: mode && mode !== 'auto' ? mode : undefined });
    if (!pick) return res.status(404).json({ error: 'No pick available' });
    res.json(pick);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push-notification settings
router.get('/push/settings', (req, res) => {
  const s = loadSettings();
  // Never return potentially sensitive server URL query params in full — fine here since it's self-configured
  res.json(s);
});

router.post('/push/settings', (req, res) => {
  const body = req.body || {};
  const current = loadSettings();
  const next = { ...current };

  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  if (typeof body.ntfy_topic === 'string') next.ntfy_topic = body.ntfy_topic.trim();
  if (typeof body.ntfy_server === 'string') next.ntfy_server = body.ntfy_server.trim();
  if (Array.isArray(body.times)) {
    const valid = body.times.filter(t => /^\d{2}:\d{2}$/.test(t));
    if (valid.length) next.times = [...new Set(valid)].sort();
  }
  if (Array.isArray(body.days)) {
    next.days = [...new Set(body.days.map(Number).filter(n => n >= 0 && n <= 6))].sort();
  }

  saveSettings(next);
  res.json(next);
});

// Fire a test push right now — useful for "did I set this up correctly"
router.post('/push/test', async (req, res) => {
  try {
    const settings = loadSettings();
    if (!settings.ntfy_topic) {
      return res.status(400).json({ error: 'ntfy_topic not set' });
    }
    await pushToNtfy({
      topic: settings.ntfy_topic,
      server: settings.ntfy_server || undefined,
      title: 'CLAUDIUS — test',
      message: "If you see this, push notifications are wired up correctly.",
      tags: 'white_check_mark',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fire a real pick right now (handy for a "push me a pick" button on mobile)
router.post('/push/now', async (req, res) => {
  try {
    const settings = loadSettings();
    if (!settings.ntfy_topic) {
      return res.status(400).json({ error: 'ntfy_topic not set' });
    }
    const result = await pushSmartPick({
      topic: settings.ntfy_topic,
      server: settings.ntfy_server || undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
