require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
  DATA_DIR: process.env.DATA_DIR || 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop',
  WATCHED_DATA_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\movie-database-files\\complete_movie_data.csv',
  SUPER_LIST_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\movie-database-files\\TheAntagonist2049-SUPER-LIST.csv',
  WATCH_HISTORY_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\movie-database-files\\complete_movie_watch_history.csv',
  REVIEW_TRACKER_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\DALTON PAY ATTENTION\\LUNARA_Review_Tracker.csv',
  GAP_LIST_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\movie-database-files\\dalton_gap_mustfix_29.csv',
  GAP_MASTER_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\movie-database-files\\dalton_gap_master_popculture_animation_oscars.csv',
  XLSX_DATA_PATH: 'C:\\Users\\silve_i21do49\\OneDrive\\Desktop\\DALTON PAY ATTENTION\\TRAKT^0LETTERBOXD_WATCHED_DATA.xlsx',
};
