const { getDb } = require('./db');
const { getCuratedPicks, getSinglePick } = require('./discovery/curator');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Date-seeded daily pick — same result all day, changes at midnight
function getDailyPick() {
  const today = new Date();
  const dateSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  // Use the date seed for deterministic "random" selection
  const db = getDb();

  // Try to get a discovery film using date-based offset
  const discovery = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.taste_score IS NOT NULL AND d.taste_score >= 50
    ORDER BY d.taste_score DESC
    LIMIT 1 OFFSET ?
  `).get(dateSeed % 50);

  if (discovery) {
    const rationale = discovery.taste_rationale ? JSON.parse(discovery.taste_rationale) : [];
    return {
      ...discovery,
      pick_type: 'discovery',
      rationale: rationale[0] || 'Matched to your taste',
      date: today.toISOString().split('T')[0],
    };
  }

  // Fallback to a highly rated rewatch
  const rewatch = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.runtime, f.imdb_id,
      r.rating,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id
    LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE r.rating >= 9
    GROUP BY f.id
    ORDER BY r.rating DESC, f.title
    LIMIT 1 OFFSET ?
  `).get(dateSeed % 100);

  if (rewatch) {
    return {
      ...rewatch,
      pick_type: 'rewatch',
      rationale: `You rated this ${rewatch.rating}/10`,
      date: today.toISOString().split('T')[0],
    };
  }

  return null;
}

// Reminder settings — stored in a simple JSON file
const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'reminder-settings.json');

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch {}
  return { enabled: false, time: '19:00', lastSet: null };
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// Windows Task Scheduler integration
const TASK_NAME = 'CLAUDIUS_MovieReminder';

function setupScheduledReminder(time) {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'reminder-toast.ps1');
  const [hours, minutes] = time.split(':');

  try {
    // Remove existing task first
    try {
      execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'ignore' });
    } catch {}

    // Create new scheduled task
    execSync(
      `schtasks /create /tn "${TASK_NAME}" /tr "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \\"${scriptPath}\\"" /sc daily /st ${hours}:${minutes} /f`,
      { stdio: 'pipe' }
    );

    const settings = getSettings();
    settings.enabled = true;
    settings.time = time;
    settings.lastSet = new Date().toISOString();
    saveSettings(settings);

    return { success: true, message: `Reminder set for ${time} daily` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function removeScheduledReminder() {
  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe' });
  } catch {}

  const settings = getSettings();
  settings.enabled = false;
  saveSettings(settings);

  return { success: true, message: 'Reminder removed' };
}

function getReminderStatus() {
  const settings = getSettings();
  let taskExists = false;
  try {
    execSync(`schtasks /query /tn "${TASK_NAME}"`, { stdio: 'pipe' });
    taskExists = true;
  } catch {}

  return {
    ...settings,
    taskExists,
  };
}

module.exports = {
  getDailyPick,
  getSettings,
  saveSettings,
  setupScheduledReminder,
  removeScheduledReminder,
  getReminderStatus,
};
