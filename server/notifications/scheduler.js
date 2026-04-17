// Cross-platform daily push scheduler.
// Ticks every minute, fires configured pushes when the local HH:MM matches.
// Settings persist in data/push-settings.json.

const fs = require('fs');
const path = require('path');
const { pushSmartPick } = require('./ntfy');

const SETTINGS_PATH = path.join(__dirname, '..', '..', 'data', 'push-settings.json');

const DEFAULTS = {
  enabled: false,
  ntfy_topic: '',       // e.g. "claudius-dalton-7k9x" — keep this unguessable
  ntfy_server: '',      // optional self-hosted ntfy base URL
  times: ['18:00'],     // HH:MM (24h, local) — multiple allowed
  days: [0, 1, 2, 3, 4, 5, 6], // 0=Sun..6=Sat
  last_fired: {},       // { "YYYY-MM-DD HH:MM": "iso" }
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function hhmm(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let interval = null;

async function tick() {
  const settings = loadSettings();
  if (!settings.enabled || !settings.ntfy_topic) return;

  const now = new Date();
  if (!settings.days.includes(now.getDay())) return;

  const nowStr = hhmm(now);
  if (!settings.times.includes(nowStr)) return;

  const key = `${ymd(now)} ${nowStr}`;
  if (settings.last_fired?.[key]) return; // already fired this minute today

  try {
    const result = await pushSmartPick({
      topic: settings.ntfy_topic,
      server: settings.ntfy_server || undefined,
    });
    if (result.success) {
      const updated = loadSettings();
      updated.last_fired = { ...(updated.last_fired || {}), [key]: new Date().toISOString() };
      // Trim history to ~30 most recent fires
      const entries = Object.entries(updated.last_fired).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 30);
      updated.last_fired = Object.fromEntries(entries);
      saveSettings(updated);
      console.log(`[push] fired ${nowStr}: ${result.pick.film.title}`);
    }
  } catch (err) {
    console.error('[push] error:', err.message);
  }
}

function startScheduler() {
  if (interval) return;
  interval = setInterval(tick, 60 * 1000); // every minute
  console.log('[push] scheduler started');
}

function stopScheduler() {
  if (interval) { clearInterval(interval); interval = null; }
}

module.exports = { loadSettings, saveSettings, startScheduler, stopScheduler, tick };
