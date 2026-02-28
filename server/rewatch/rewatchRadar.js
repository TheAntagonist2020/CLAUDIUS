const { getDb } = require('../db');

const MOOD_MAP = {
  adrenaline: { genres: ['action', 'thriller'], boost: ['crime'] },
  comfort: { genres: ['comedy', 'animation', 'family'], boost: ['romance'] },
  cerebral: { genres: ['drama', 'mystery'], boost: ['science fiction'] },
  dark: { genres: ['horror', 'thriller', 'crime'], boost: [] },
  epic: { genres: ['war', 'adventure', 'history'], boost: ['science fiction'] },
  heartfelt: { genres: ['drama', 'romance'], boost: ['music'] },
  visual_feast: { genres: ['fantasy', 'science fiction', 'animation'], boost: ['adventure'] },
};

const REWATCHABLE_GENRES = new Set([
  'action', 'comedy', 'horror', 'science fiction', 'animation', 'adventure', 'fantasy', 'thriller'
]);

function getRewatchSuggestions({ mood, count = 20 } = {}) {
  const db = getDb();

  // Get all films rated 7+ with their last watch date and genres
  const films = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.runtime, r.rating,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) as last_watched,
      (SELECT COUNT(*) FROM watches w WHERE w.film_id = f.id) as watch_count,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id
    LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE r.rating >= 7
    GROUP BY f.id
    ORDER BY r.rating DESC
  `).all();

  const now = new Date();
  const scored = films.map(film => {
    const score = computeRewatchScore(film, now, mood);
    return { ...film, rewatch_score: score.score, rewatch_reasons: score.reasons };
  });

  scored.sort((a, b) => b.rewatch_score - a.rewatch_score);
  return scored.slice(0, count);
}

function computeRewatchScore(film, now, mood) {
  const reasons = [];

  // Rating factor (7=0.4, 8=0.6, 9=0.8, 10=1.0)
  const ratingFactor = (film.rating - 6) / 4;
  if (film.rating >= 9) reasons.push(`You rated this ${film.rating}/10`);

  // Time decay - longer since last watch = higher score
  let timeFactor = 0.5;
  if (film.last_watched) {
    const lastDate = new Date(film.last_watched);
    const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
    timeFactor = Math.min(1.0, daysSince / (365 * 2));
    if (daysSince > 365 * 2) {
      const years = Math.floor(daysSince / 365);
      reasons.push(`Last watched ${years} years ago`);
    } else if (daysSince > 365) {
      reasons.push('Last watched over a year ago');
    }
  }

  // Genre rewatchability
  let genreFactor = 0.5;
  if (film.genres) {
    const filmGenres = film.genres.split(',').map(g => g.trim().toLowerCase());
    const rewatchableCount = filmGenres.filter(g => REWATCHABLE_GENRES.has(g)).length;
    genreFactor = Math.min(1.0, 0.3 + rewatchableCount * 0.25);
  }

  // Mood matching
  let moodFactor = 0.5;
  if (mood && MOOD_MAP[mood] && film.genres) {
    const filmGenres = film.genres.split(',').map(g => g.trim().toLowerCase());
    const moodGenres = MOOD_MAP[mood].genres;
    const boostGenres = MOOD_MAP[mood].boost;
    const moodMatch = filmGenres.some(g => moodGenres.includes(g));
    const boostMatch = filmGenres.some(g => boostGenres.includes(g));

    if (moodMatch) {
      moodFactor = 0.9;
      reasons.push(`Matches your ${mood} mood`);
    }
    if (boostMatch) moodFactor = Math.min(1.0, moodFactor + 0.1);
    if (!moodMatch && !boostMatch) moodFactor = 0.1;
  }

  const score = mood
    ? 0.25 * ratingFactor + 0.20 * timeFactor + 0.10 * genreFactor + 0.45 * moodFactor
    : 0.35 * ratingFactor + 0.30 * timeFactor + 0.20 * genreFactor + 0.15 * 0.5;

  if (reasons.length === 0) reasons.push('Highly rated and due for a rewatch');

  return { score: Math.round(score * 1000) / 10, reasons };
}

function getMoods() {
  return Object.keys(MOOD_MAP).map(key => ({
    id: key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' '),
  }));
}

module.exports = { getRewatchSuggestions, getMoods };
