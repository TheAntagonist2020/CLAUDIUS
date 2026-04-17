const fs = require('fs');
const path = require('path');
const config = require('../config');

const TOKENS_PATH = path.join(__dirname, '../../db/trakt_tokens.json');
const BASE_URL = 'https://api.trakt.tv';

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function isAuthenticated() {
  return !!(loadTokens()?.access_token);
}

async function refreshAccessToken() {
  const tokens = loadTokens();
  if (!tokens?.refresh_token) throw new Error('No refresh token — re-authenticate with Trakt');

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Claudius/1.0' },
    body: JSON.stringify({
      refresh_token: tokens.refresh_token,
      client_id: config.TRAKT_CLIENT_ID,
      client_secret: config.TRAKT_CLIENT_SECRET,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const newTokens = await res.json();
  saveTokens({ ...tokens, ...newTokens, obtained_at: Date.now() });
  return newTokens.access_token;
}

async function traktFetch(endpoint, options = {}) {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Not authenticated with Trakt');

  // Refresh if within 60 seconds of expiry
  const expiresAt = (tokens.obtained_at || 0) + (tokens.expires_in || 7776000) * 1000;
  let accessToken = tokens.access_token;
  if (Date.now() > expiresAt - 60_000) {
    accessToken = await refreshAccessToken();
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Claudius/1.0',
      'trakt-api-version': '2',
      'trakt-api-key': config.TRAKT_CLIENT_ID,
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) throw new Error(`Trakt API ${res.status}: ${endpoint}`);
  return res.json();
}

module.exports = { traktFetch, loadTokens, saveTokens, isAuthenticated };
