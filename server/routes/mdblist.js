const { Router } = require('express');
const { queryOne } = require('../db');
const mdbClient = require('../enrichment/mdblistClient');
const {
  getMovieByImdb, getMovieByTmdb, getUserLists,
  getListItems, addToList, removeFromList,
} = mdbClient;

const router = Router();

router.get('/movie/:filmId', async (req, res) => {
  try {
    const film = await queryOne('SELECT imdb_id, tmdb_id FROM films WHERE id = ?', [req.params.filmId]);
    if (!film) return res.status(404).json({ error: 'Film not found' });

    let data;
    if (film.imdb_id) {
      data = await getMovieByImdb(film.imdb_id);
    } else if (film.tmdb_id) {
      data = await getMovieByTmdb(film.tmdb_id);
    } else {
      return res.status(400).json({ error: 'No IMDb or TMDb ID' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/streams/:imdbId', async (req, res) => {
  try {
    const data = await getMovieByImdb(req.params.imdbId);
    res.json({
      streams: data.streams || [],
      watch_providers: data.watch_providers || [],
      ratings: data.ratings || [],
      score: data.score,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lists', async (req, res) => {
  try {
    const lists = await getUserLists();
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lists/:listId/items', async (req, res) => {
  try {
    const items = await getListItems(req.params.listId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/lists/:listId/add', async (req, res) => {
  const { imdb_ids } = req.body;
  if (!imdb_ids || !Array.isArray(imdb_ids)) {
    return res.status(400).json({ error: 'imdb_ids array required' });
  }
  try {
    const result = await addToList(req.params.listId, imdb_ids);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-to-stremio', async (req, res) => {
  const { film_id, list_id } = req.body;
  let imdbId;

  if (film_id) {
    const film = await queryOne('SELECT imdb_id FROM films WHERE id = ?', [film_id]);
    if (film) imdbId = film.imdb_id;
  }

  if (!imdbId && req.body.imdb_id) {
    imdbId = req.body.imdb_id;
  }

  if (!imdbId) {
    return res.status(400).json({ error: 'Could not find IMDb ID for this film' });
  }

  const targetList = list_id || mdbClient.CLAUDIUS_QUEUE_LIST_ID;
  if (!targetList) {
    return res.status(400).json({ error: 'list_id required' });
  }

  try {
    const result = await addToList(targetList, [imdbId]);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
