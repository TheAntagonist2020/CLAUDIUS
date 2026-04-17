// Push notifications via ntfy.sh — free, no API key, iOS + Android apps.
// The user picks a hard-to-guess topic (like a secret path), subscribes on
// their phone, and the server POSTs to that URL to deliver a push.

const { getSmartPick } = require('./smartPicker');

const DEFAULT_BASE = 'https://ntfy.sh';

async function pushToNtfy({ topic, title, message, clickUrl, priority = 'default', tags, server } = {}) {
  if (!topic) throw new Error('ntfy topic is required');
  const base = server || DEFAULT_BASE;
  const url = `${base.replace(/\/$/, '')}/${encodeURIComponent(topic)}`;

  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Title': title || 'CLAUDIUS',
    'Priority': priority,
  };
  if (clickUrl) headers['Click'] = clickUrl;
  if (tags) headers['Tags'] = Array.isArray(tags) ? tags.join(',') : tags;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: message || '',
  });
  if (!res.ok) {
    throw new Error(`ntfy ${res.status}: ${await res.text()}`);
  }
  return true;
}

async function pushSmartPick({ topic, server }) {
  const pick = getSmartPick();
  if (!pick) {
    return { success: false, reason: 'no-pick-available' };
  }

  const f = pick.film;
  const runtime = f.runtime ? ` · ${f.runtime} min` : '';
  const badge = pick.pick_type === 'comfort' ? '🔁' : '✨';
  const body = `${badge} ${f.title} (${f.year})${runtime}\n${pick.rationale}`;

  // Prefer Stremio deep-link; fall back to the film page in the app
  const clickUrl = pick.stremio_url || null;

  await pushToNtfy({
    topic,
    title: `CLAUDIUS — ${pick.slot_label}`,
    message: body,
    clickUrl,
    tags: pick.pick_type === 'comfort' ? 'popcorn' : 'sparkles',
    server,
  });
  return { success: true, pick };
}

module.exports = { pushToNtfy, pushSmartPick };
