require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  DATABASE_URL: process.env.DATABASE_URL,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  TMDB_BASE_URL: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
  TRAKT_CLIENT_ID: process.env.TRAKT_CLIENT_ID,
  TRAKT_CLIENT_SECRET: process.env.TRAKT_CLIENT_SECRET,
  TRAKT_SYNC_INTERVAL_HOURS: Number(process.env.TRAKT_SYNC_INTERVAL_HOURS) || 6,
  APP_PASSWORD: process.env.APP_PASSWORD || 'claudius',
  MDBLIST_API_KEY: process.env.MDBLIST_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET || 'claudius-dev-secret-change-in-prod',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
