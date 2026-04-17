const Bottleneck = require('bottleneck');
const config = require('../config');

const limiter = new Bottleneck({
  reservoir: 38,
  reservoirRefreshAmount: 38,
  reservoirRefreshInterval: 10 * 1000,
  maxConcurrent: 8,
});

async function tmdbFetch(endpoint, params = {}) {
  if (!config.TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is not set — add it to .env (see .env.example).');
  }
  const url = new URL(`${config.TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', config.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  return limiter.schedule(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) {
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        return tmdbFetch(endpoint, params);
      }
      throw new Error(`TMDb ${res.status}: ${endpoint}`);
    }
    return res.json();
  });
}

async function getMovieDetails(tmdbId) {
  return tmdbFetch(`/movie/${tmdbId}`, { append_to_response: 'credits,watch/providers' });
}

async function searchMovie(title, year) {
  return tmdbFetch('/search/movie', { query: title, year: year || '' });
}

module.exports = { tmdbFetch, getMovieDetails, searchMovie };
