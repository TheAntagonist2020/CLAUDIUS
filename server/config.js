require('dotenv').config();
const path = require('path');

// Default data directory — override via DATA_DIR env var
const DATA_DIR = process.env.DATA_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || '', 'claudius-data');

module.exports = {
  PORT: process.env.PORT || 3001,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
  MDBLIST_API_KEY: process.env.MDBLIST_API_KEY || '',
  MDBLIST_QUEUE_LIST_ID: process.env.MDBLIST_QUEUE_LIST_ID ? Number(process.env.MDBLIST_QUEUE_LIST_ID) : null,
  // How many days before cached streaming availability is considered stale
  STREAMING_STALE_DAYS: process.env.STREAMING_STALE_DAYS ? Number(process.env.STREAMING_STALE_DAYS) : 30,
  DATA_DIR,
  WATCHED_DATA_PATH: process.env.WATCHED_DATA_PATH || path.join(DATA_DIR, 'complete_movie_data.csv'),
  SUPER_LIST_PATH: process.env.SUPER_LIST_PATH || path.join(DATA_DIR, 'TheAntagonist2049-SUPER-LIST.csv'),
  WATCH_HISTORY_PATH: process.env.WATCH_HISTORY_PATH || path.join(DATA_DIR, 'complete_movie_watch_history.csv'),
  REVIEW_TRACKER_PATH: process.env.REVIEW_TRACKER_PATH || path.join(DATA_DIR, 'LUNARA_Review_Tracker.csv'),
  GAP_LIST_PATH: process.env.GAP_LIST_PATH || path.join(DATA_DIR, 'dalton_gap_mustfix_29.csv'),
  GAP_MASTER_PATH: process.env.GAP_MASTER_PATH || path.join(DATA_DIR, 'dalton_gap_master_popculture_animation_oscars.csv'),
  XLSX_DATA_PATH: process.env.XLSX_DATA_PATH || path.join(DATA_DIR, 'TRAKT^0LETTERBOXD_WATCHED_DATA.xlsx'),
};
