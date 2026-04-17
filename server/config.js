require('dotenv').config();
const path = require('path');

// Default data directory: <repo>/data. Override with DATA_DIR env var.
// Each specific path can also be overridden individually via env.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function dataPath(name) {
  return path.join(DATA_DIR, name);
}

module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  HOST: process.env.HOST || '0.0.0.0',
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
  MDBLIST_API_KEY: process.env.MDBLIST_API_KEY || '',
  MDBLIST_QUEUE_LIST_ID: process.env.MDBLIST_QUEUE_LIST_ID || '',
  DATA_DIR,
  WATCHED_DATA_PATH: process.env.WATCHED_DATA_PATH || dataPath('watched.csv'),
  SUPER_LIST_PATH: process.env.SUPER_LIST_PATH || dataPath('super-list.csv'),
  WATCH_HISTORY_PATH: process.env.WATCH_HISTORY_PATH || dataPath('watch-history.csv'),
  REVIEW_TRACKER_PATH: process.env.REVIEW_TRACKER_PATH || dataPath('review-tracker.csv'),
  GAP_LIST_PATH: process.env.GAP_LIST_PATH || dataPath('gap-list.csv'),
  GAP_MASTER_PATH: process.env.GAP_MASTER_PATH || dataPath('gap-master.csv'),
  XLSX_DATA_PATH: process.env.XLSX_DATA_PATH || dataPath('watched.xlsx'),
};
