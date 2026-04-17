const config = require('../config');
const { saveTokens, traktFetch } = require('./traktClient');

const BASE_URL = 'https://api.trakt.tv';

async function startDeviceAuth() {
  const res = await fetch(`${BASE_URL}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Claudius/1.0' },
    body: JSON.stringify({ client_id: config.TRAKT_CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`Device auth start failed: ${res.status}`);
  return res.json();
  // Returns: { device_code, user_code, verification_url, expires_in, interval }
}

async function pollForToken(deviceCode) {
  const res = await fetch(`${BASE_URL}/oauth/device/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Claudius/1.0' },
    body: JSON.stringify({
      code: deviceCode,
      client_id: config.TRAKT_CLIENT_ID,
      client_secret: config.TRAKT_CLIENT_SECRET,
    }),
  });

  if (res.status === 400) return { pending: true };  // still waiting
  if (res.status === 404) throw new Error('Device code expired');
  if (res.status === 409) return { pending: true };  // polling too fast
  if (res.status === 410) throw new Error('Device code already used');
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`);

  const tokens = await res.json();
  saveTokens({ ...tokens, obtained_at: Date.now() });

  // Fetch and store the Trakt username
  try {
    const profile = await traktFetch('/users/me');
    const existing = require('./traktClient').loadTokens();
    require('./traktClient').saveTokens({ ...existing, username: profile.username });
    return { success: true, username: profile.username };
  } catch {
    return { success: true };
  }
}

module.exports = { startDeviceAuth, pollForToken };
