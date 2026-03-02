const BASE = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Stats
  getOverview: () => apiFetch('/stats/overview'),

  // Films
  getFilms: (params) => apiFetch(`/films?${new URLSearchParams(params)}`),
  getRecentFilms: () => apiFetch('/films/recent'),
  getFilm: (id) => apiFetch(`/films/${id}`),

  // Taste
  getTasteProfile: () => apiFetch('/taste/profile'),
  getTasteGenres: () => apiFetch('/taste/genres'),
  getTasteDirectors: () => apiFetch('/taste/directors'),
  getTasteDecades: () => apiFetch('/taste/decades'),
  rebuildTaste: () => apiFetch('/taste/rebuild', { method: 'POST' }),

  // Discovery
  getRecommendations: (params) => apiFetch(`/discover/recommendations?${new URLSearchParams(params)}`),
  scoreDiscovery: () => apiFetch('/discover/score', { method: 'POST' }),
  dismissRecommendation: (id) => apiFetch(`/discover/dismiss/${id}`, { method: 'POST' }),
  getDiscoveryStats: () => apiFetch('/discover/stats'),

  // Rewatch
  getRewatchSuggestions: (params) => apiFetch(`/rewatch/suggestions?${new URLSearchParams(params)}`),
  getMoods: () => apiFetch('/rewatch/moods'),

  // Watchlist
  getWatchlist: (params) => apiFetch(`/watchlist?${new URLSearchParams(params)}`),
  addToWatchlist: (data) => apiFetch('/watchlist', { method: 'POST', body: JSON.stringify(data) }),
  deleteFromWatchlist: (id) => apiFetch(`/watchlist/${id}`, { method: 'DELETE' }),

  // Import & Enrich
  runImport: () => apiFetch('/import/run', { method: 'POST' }),
  runEnrich: (batch) => apiFetch('/enrich/run', { method: 'POST', body: JSON.stringify({ batch }) }),
  getEnrichStatus: () => apiFetch('/enrich/status'),

  // Search
  search: (q) => apiFetch(`/search?q=${encodeURIComponent(q)}`),

  // Notes
  addNote: (data) => apiFetch('/notes', { method: 'POST', body: JSON.stringify(data) }),
  deleteNote: (id) => apiFetch(`/notes/${id}`, { method: 'DELETE' }),

  // Curator
  getCuratedPicks: (params = {}) => apiFetch(`/curator/tonight?${new URLSearchParams(params)}`),
  getSinglePick: (params = {}) => apiFetch(`/curator/single?${new URLSearchParams(params)}`),

  // Reminders
  getDailyPick: () => apiFetch('/reminder/daily'),
  getReminderStatus: () => apiFetch('/reminder/status'),
  setupReminder: (time) => apiFetch('/reminder/setup', { method: 'POST', body: JSON.stringify({ time }) }),
  removeReminder: () => apiFetch('/reminder/remove', { method: 'POST' }),

  // MDBList
  getMdblistMovie: (filmId) => apiFetch(`/mdblist/movie/${filmId}`),
  getMdblistStreams: (imdbId) => apiFetch(`/mdblist/streams/${imdbId}`),
  getMdblistLists: () => apiFetch('/mdblist/lists'),
  getMdblistListItems: (listId) => apiFetch(`/mdblist/lists/${listId}/items`),
  sendToStremio: (data) => apiFetch('/mdblist/send-to-stremio', { method: 'POST', body: JSON.stringify(data) }),

  // Letterboxd influence (Sean Fennessey)
  scrapeLetterboxd: () => apiFetch('/letterboxd/scrape', { method: 'POST' }),
  getLetterboxdStatus: () => apiFetch('/letterboxd/status'),
  getLetterboxdFilms: (params = {}) => apiFetch(`/letterboxd/films?${new URLSearchParams(params)}`),
};
