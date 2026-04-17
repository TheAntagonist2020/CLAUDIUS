const express = require('express');
const router = express.Router();
const { startDeviceAuth, pollForToken } = require('../trakt/traktAuth');
const { syncFromTrakt, getSyncStatus } = require('../trakt/traktSync');
const { isAuthenticated, loadTokens } = require('../trakt/traktClient');
const { queryOne } = require('../db');

router.get('/auth/status', async (req, res) => {
  try {
    const tokens = await loadTokens();
    if (!tokens?.access_token) return res.json({ authenticated: false });

    const expiresAt = (tokens.obtained_at || 0) + (tokens.expires_in || 7776000) * 1000;
    res.json({
      authenticated: true,
      username: tokens.username || null,
      expires_at: new Date(expiresAt).toISOString(),
      valid: Date.now() < expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/start', async (req, res) => {
  try {
    const data = await startDeviceAuth();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/poll', async (req, res) => {
  const { device_code } = req.body;
  if (!device_code) return res.status(400).json({ error: 'device_code required' });
  try {
    const result = await pollForToken(device_code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sync/status', async (req, res) => {
  try {
    const status = getSyncStatus();
    const lastLog = await queryOne('SELECT * FROM trakt_sync_log ORDER BY id DESC LIMIT 1');
    res.json({ ...status, last_log: lastLog || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/run', async (req, res) => {
  try {
    const authed = isAuthenticated();
    if (!authed) {
      return res.status(401).json({ error: 'Not authenticated with Trakt' });
    }
    const current = getSyncStatus();
    if (current.running) {
      return res.json({ message: 'Sync already running' });
    }
    res.json({ message: 'Trakt sync started' });
    syncFromTrakt().catch(err => console.error('[Trakt] Sync error:', err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
