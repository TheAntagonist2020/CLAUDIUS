const Bottleneck = require('bottleneck');

const MDBLIST_API_KEY = 'pzoitdmb31gwbtrfmgrq951rp';
const BASE_URL = 'https://mdblist.com/api';
const API_BASE_URL = 'https://api.mdblist.com';
const CLAUDIUS_QUEUE_LIST_ID = 149225;

const limiter = new Bottleneck({
  reservoir: 20,
  reservoirRefreshAmount: 20,
  reservoirRefreshInterval: 10 * 1000,
  maxConcurrent: 5,
});

async function mdblistFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apikey', MDBLIST_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  return limiter.schedule(async () => {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`MDBList ${res.status}: ${path}`);
    return res.json();
  });
}

// Get movie info by IMDb ID - returns ratings, streams, score
async function getMovieByImdb(imdbId) {
  return mdblistFetch('/', { i: imdbId });
}

// Get movie info by TMDb ID
async function getMovieByTmdb(tmdbId) {
  return mdblistFetch('/', { tm: tmdbId });
}

// Get user's lists
async function getUserLists() {
  const res = await fetch(`https://mdblist.com/api/lists/user/?apikey=${MDBLIST_API_KEY}`);
  if (!res.ok) throw new Error(`MDBList lists ${res.status}`);
  return res.json();
}

// Get items in a list
async function getListItems(listId) {
  const res = await fetch(`${API_BASE_URL}/lists/${listId}/items/?apikey=${MDBLIST_API_KEY}`);
  if (!res.ok) throw new Error(`MDBList list items ${res.status}`);
  return res.json();
}

// Add movies to a static list (non-Trakt)
// Key format: { "imdb": "tt0137523" } — NOT imdb_id
async function addToList(listId, imdbIds) {
  const movies = imdbIds.map(id => ({ imdb: id }));
  const res = await fetch(`${API_BASE_URL}/lists/${listId}/items/add?apikey=${MDBLIST_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movies }),
  });
  if (!res.ok) throw new Error(`MDBList add ${res.status}`);
  return res.json();
}

// Remove movies from a list
async function removeFromList(listId, imdbIds) {
  const movies = imdbIds.map(id => ({ imdb_id: id }));
  const res = await fetch(`${API_BASE_URL}/lists/${listId}/items/remove?apikey=${MDBLIST_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movies }),
  });
  if (!res.ok) throw new Error(`MDBList remove ${res.status}`);
  return res.json();
}

module.exports = {
  getMovieByImdb,
  getMovieByTmdb,
  getUserLists,
  getListItems,
  addToList,
  removeFromList,
  CLAUDIUS_QUEUE_LIST_ID,
};
