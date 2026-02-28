const { Router } = require('express');
const { getDb } = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { search, genre, decade, rating_min, rating_max, sort = 'recent', page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = `
    SELECT f.*, r.rating,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) as last_watched,
      (SELECT COUNT(*) FROM watches w WHERE w.film_id = f.id) as watch_count,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id
    LEFT JOIN genres g ON g.id = fg.genre_id
  `;

  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('f.title LIKE ?');
    params.push(`%${search}%`);
  }
  if (genre) {
    conditions.push('f.id IN (SELECT fg2.film_id FROM film_genres fg2 JOIN genres g2 ON g2.id = fg2.genre_id WHERE g2.name = ?)');
    params.push(genre);
  }
  if (decade) {
    conditions.push('f.year >= ? AND f.year < ?');
    params.push(Number(decade), Number(decade) + 10);
  }
  if (rating_min) {
    conditions.push('r.rating >= ?');
    params.push(Number(rating_min));
  }
  if (rating_max) {
    conditions.push('r.rating <= ?');
    params.push(Number(rating_max));
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY f.id';

  const sortMap = {
    recent: 'last_watched DESC',
    rating_desc: 'r.rating DESC, f.title ASC',
    rating_asc: 'r.rating ASC, f.title ASC',
    year_desc: 'f.year DESC, f.title ASC',
    year_asc: 'f.year ASC, f.title ASC',
    title: 'f.title ASC',
  };
  query += ` ORDER BY ${sortMap[sort] || sortMap.recent}`;
  query += ' LIMIT ? OFFSET ?';
  params.push(Number(limit), offset);

  const films = db.prepare(query).all(...params);

  // Total count
  let countQuery = 'SELECT COUNT(DISTINCT f.id) as total FROM films f LEFT JOIN ratings r ON r.film_id = f.id';
  if (conditions.length > 0) countQuery += ' WHERE ' + conditions.join(' AND ');
  const total = db.prepare(countQuery).get(...params.slice(0, -2)).total;

  res.json({ films, total, page: Number(page), limit: Number(limit) });
});

router.get('/recent', (req, res) => {
  const db = getDb();
  const films = db.prepare(`
    SELECT f.*, r.rating, w.watched_at as last_watched,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f
    JOIN watches w ON w.film_id = f.id
    LEFT JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id
    LEFT JOIN genres g ON g.id = fg.genre_id
    GROUP BY f.id
    ORDER BY w.watched_at DESC
    LIMIT 20
  `).all();
  res.json(films);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const film = db.prepare(`
    SELECT f.*, r.rating, r.rated_at
    FROM films f
    LEFT JOIN ratings r ON r.film_id = f.id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!film) return res.status(404).json({ error: 'Film not found' });

  film.genres = db.prepare(`
    SELECT g.* FROM genres g JOIN film_genres fg ON fg.genre_id = g.id WHERE fg.film_id = ?
  `).all(film.id);

  film.credits = db.prepare(`
    SELECT fc.role, fc.character_name, fc.credit_order, p.id as person_id, p.name, p.profile_path
    FROM film_credits fc JOIN people p ON p.id = fc.person_id
    WHERE fc.film_id = ? ORDER BY fc.role, fc.credit_order
  `).all(film.id);

  film.watches = db.prepare('SELECT * FROM watches WHERE film_id = ? ORDER BY watched_at DESC').all(film.id);

  film.streaming = db.prepare(
    "SELECT * FROM streaming_availability WHERE film_id = ? AND region = 'US'"
  ).all(film.id);

  film.notes = db.prepare('SELECT * FROM film_notes WHERE film_id = ? ORDER BY created_at DESC').all(film.id);

  res.json(film);
});

module.exports = router;
