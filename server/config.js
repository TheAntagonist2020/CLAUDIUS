require('dotenv').config();

// Default paths for local Windows development
const LOCAL_DATA_DIR = 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop';

module.exports = {
  PORT: process.env.PORT || 3001,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
  MDBLIST_API_KEY: process.env.MDBLIST_API_KEY || 'pzoitdmb31gwbtrfmgrq951rp',
  DATA_DIR: process.env.DATA_DIR || LOCAL_DATA_DIR,
  WATCHED_DATA_PATH: process.env.WATCHED_DATA_PATH || `${LOCAL_DATA_DIR}\\movie-database-files\\complete_movie_data.csv`,
  SUPER_LIST_PATH: process.env.SUPER_LIST_PATH || `${LOCAL_DATA_DIR}\\movie-database-files\\TheAntagonist2049-SUPER-LIST.csv`,
  WATCH_HISTORY_PATH: process.env.WATCH_HISTORY_PATH || `${LOCAL_DATA_DIR}\\movie-database-files\\complete_movie_watch_history.csv`,
  REVIEW_TRACKER_PATH: process.env.REVIEW_TRACKER_PATH || `${LOCAL_DATA_DIR}\\DALTON PAY ATTENTION\\LUNARA_Review_Tracker.csv`,
  GAP_LIST_PATH: process.env.GAP_LIST_PATH || `${LOCAL_DATA_DIR}\\movie-database-files\\dalton_gap_mustfix_29.csv`,
  GAP_MASTER_PATH: process.env.GAP_MASTER_PATH || `${LOCAL_DATA_DIR}\\movie-database-files\\dalton_gap_master_popculture_animation_oscars.csv`,
  XLSX_DATA_PATH: process.env.XLSX_DATA_PATH || `${LOCAL_DATA_DIR}\\DALTON PAY ATTENTION\\TRAKT^0LETTERBOXD_WATCHED_DATA.xlsx`,
};
