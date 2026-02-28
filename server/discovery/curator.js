const { getDb } = require('../db');

// Pairing strategies — how two films connect
const PAIRING_STRATEGIES = [
  { name: 'genre_echo', label: 'Genre Echo', desc: 'Same genre, different era', hasRewatch: true, hasDiscovery: true },
  { name: 'director_deep', label: 'Director Deep Dive', desc: 'Two films from a director you love', hasRewatch: true, hasDiscovery: false },
  { name: 'new_and_classic', label: 'New & Classic', desc: 'A recent discovery paired with a proven classic', hasRewatch: true, hasDiscovery: true },
  { name: 'contrast', label: 'Counter-Program', desc: 'Two films that challenge each other', hasRewatch: true, hasDiscovery: false },
  { name: 'rewatch_plus', label: 'Rewatch + Discovery', desc: 'Revisit a favorite, then discover something new in the same vein', hasRewatch: true, hasDiscovery: true },
  { name: 'era_immersion', label: 'Era Immersion', desc: 'Two films from the same decade', hasRewatch: true, hasDiscovery: true },
  // Discovery-only strategies
  { name: 'discovery_double', label: 'Double Discovery', desc: 'Two films you haven\'t seen, matched to your taste', hasRewatch: false, hasDiscovery: true },
  { name: 'discovery_contrast', label: 'Discovery Contrast', desc: 'Two unseen films from opposite ends of the spectrum', hasRewatch: false, hasDiscovery: true },
];

// Runtime constraint helper — builds SQL fragment
function runtimeFilter(table, maxRuntime) {
  if (!maxRuntime) return '';
  return `AND ${table}.runtime IS NOT NULL AND ${table}.runtime <= ${Number(maxRuntime)}`;
}

// Combined runtime for a double feature
function pairRuntimeLimit(maxRuntime) {
  if (!maxRuntime) return null;
  return Math.floor(Number(maxRuntime) / 2) + 15;
}

// rewatch: 'yes' = rewatch only, 'no' = discovery only, 'either' = mixed (default)
function getCuratedPicks({ mood, seed, maxRuntime, rewatch = 'either' } = {}) {
  const db = getDb();
  const perFilmMax = pairRuntimeLimit(maxRuntime);

  // Filter strategies based on rewatch preference
  let available;
  if (rewatch === 'no') {
    available = PAIRING_STRATEGIES.filter(s => s.hasDiscovery && !['director_deep', 'contrast', 'rewatch_plus'].includes(s.name));
  } else if (rewatch === 'yes') {
    available = PAIRING_STRATEGIES.filter(s => s.hasRewatch && !['discovery_double', 'discovery_contrast', 'rewatch_plus'].includes(s.name));
  } else {
    // 'either' — exclude the discovery-only strategies to keep the original mix, but allow them as fallback
    available = PAIRING_STRATEGIES.filter(s => !['discovery_double', 'discovery_contrast'].includes(s.name));
  }

  if (available.length === 0) available = PAIRING_STRATEGIES;

  const strategy = seed
    ? available[seed % available.length]
    : available[Math.floor(Math.random() * available.length)];

  let picks;
  switch (strategy.name) {
    case 'rewatch_plus':
      picks = buildRewatchPlusDiscovery(db, mood, perFilmMax);
      break;
    case 'director_deep':
      picks = buildDirectorDeepDive(db, perFilmMax);
      break;
    case 'era_immersion':
      picks = rewatch === 'no'
        ? buildEraDiscoveryOnly(db, mood, perFilmMax)
        : rewatch === 'yes'
        ? buildEraRewatchOnly(db, mood, perFilmMax)
        : buildEraImmersion(db, mood, perFilmMax);
      break;
    case 'new_and_classic':
      picks = rewatch === 'no'
        ? buildNewAndClassicDiscoveryOnly(db, mood, perFilmMax)
        : rewatch === 'yes'
        ? buildNewAndClassicRewatchOnly(db, mood, perFilmMax)
        : buildNewAndClassic(db, mood, perFilmMax);
      break;
    case 'contrast':
      picks = buildContrast(db, mood, perFilmMax);
      break;
    case 'genre_echo':
      picks = rewatch === 'no'
        ? buildGenreEchoDiscoveryOnly(db, mood, perFilmMax)
        : rewatch === 'yes'
        ? buildGenreEchoRewatchOnly(db, mood, perFilmMax)
        : buildGenreEcho(db, mood, perFilmMax);
      break;
    case 'discovery_double':
      picks = buildDiscoveryDouble(db, mood, perFilmMax);
      break;
    case 'discovery_contrast':
      picks = buildDiscoveryContrast(db, mood, perFilmMax);
      break;
    default:
      picks = buildGenreEcho(db, mood, perFilmMax);
      break;
  }

  // Fallback
  if (!picks || picks.length === 0) {
    if (rewatch === 'no') {
      picks = buildDiscoveryFallback(db, perFilmMax);
    } else if (rewatch === 'yes') {
      picks = buildRewatchFallback(db, perFilmMax);
    } else {
      picks = buildFallback(db, perFilmMax);
    }
  }

  const totalRuntime = picks.reduce((sum, f) => sum + (f.runtime || 0), 0);

  return {
    strategy: strategy.name,
    label: strategy.label,
    description: strategy.desc,
    totalRuntime,
    films: picks,
  };
}

// ─── MIXED STRATEGIES (rewatch + discovery) ─────────────────────────

function buildRewatchPlusDiscovery(db, mood, perFilmMax) {
  let genreFilter = '';
  if (mood) {
    const moodGenres = getMoodGenres(mood);
    if (moodGenres.length) genreFilter = `AND g.name IN (${moodGenres.map(g => `'${g}'`).join(',')})`;
  }

  const rewatch = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) as last_watched
    FROM films f
    JOIN ratings r ON r.film_id = f.id
    JOIN film_genres fg ON fg.film_id = f.id
    JOIN genres g ON g.id = fg.genre_id
    WHERE r.rating >= 8 ${genreFilter} ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get();

  if (!rewatch) return [];

  const rewatchGenres = (rewatch.genres || '').split(',').map(g => g.trim().toLowerCase());
  const genreMatch = rewatchGenres.length > 0
    ? `AND LOWER(d.genres) LIKE '%${rewatchGenres[0]}%'`
    : '';

  const discovery = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.metascore, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.taste_score IS NOT NULL ${genreMatch} ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 20
  `).all();

  const pick = discovery[Math.floor(Math.random() * Math.min(discovery.length, 10))];
  const films = [
    { ...rewatch, pick_type: 'rewatch', rationale: `Rated ${rewatch.rating}/10 — time to revisit this one` },
  ];
  if (pick) {
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({
      ...pick, pick_type: 'discovery',
      rationale: rationale[0] || `Pairs with ${rewatch.title} — same energy, fresh eyes`,
    });
  }
  return films;
}

function buildDirectorDeepDive(db, perFilmMax) {
  const director = db.prepare(`
    SELECT td.person_id, td.director_name, td.avg_rating, td.films_watched
    FROM taste_director_affinity td WHERE td.films_watched >= 3
    ORDER BY td.affinity_score DESC LIMIT 15
  `).all();

  if (director.length === 0) return [];
  const pick = director[Math.floor(Math.random() * Math.min(director.length, 8))];

  const films = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      ? as directors,
      (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) as last_watched
    FROM films f
    JOIN film_credits fc ON fc.film_id = f.id AND fc.person_id = ? AND fc.role = 'director'
    LEFT JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id
    LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE 1=1 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 2
  `).all(pick.director_name, pick.person_id);

  return films.map((f, i) => ({
    ...f, pick_type: 'rewatch',
    rationale: i === 0
      ? `${pick.director_name} — you've watched ${pick.films_watched} of their films (avg ${pick.avg_rating})`
      : `The companion piece`,
  }));
}

function buildEraImmersion(db, mood, perFilmMax) {
  const topDecades = db.prepare(`
    SELECT decade FROM taste_decade_affinity WHERE films_watched >= 10
    ORDER BY affinity_score DESC LIMIT 5
  `).all();
  if (topDecades.length === 0) return [];
  const decade = topDecades[Math.floor(Math.random() * topDecades.length)].decade;

  const rewatch = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE f.year >= ? AND f.year < ? AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get(decade, decade + 10);

  const discovery = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year >= ? AND d.year < ? AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 10
  `).all(decade, decade + 10);

  const films = [];
  if (rewatch) films.push({ ...rewatch, pick_type: 'rewatch', rationale: `A ${decade}s gem you rated ${rewatch.rating}/10` });
  if (discovery.length > 0) {
    const pick = discovery[Math.floor(Math.random() * Math.min(discovery.length, 5))];
    films.push({ ...pick, pick_type: 'discovery', rationale: `Another ${decade}s essential you haven't seen` });
  }
  return films;
}

function buildNewAndClassic(db, mood, perFilmMax) {
  const recent = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year >= 2015 AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 15
  `).all();

  const classic = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE f.year < 1970 AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get();

  const films = [];
  if (recent.length > 0) {
    const pick = recent[Math.floor(Math.random() * Math.min(recent.length, 8))];
    films.push({ ...pick, pick_type: 'discovery', rationale: `A modern standout matched to your taste` });
  }
  if (classic) films.push({ ...classic, pick_type: 'rewatch', rationale: `Pair it with a pre-'70s classic you loved` });
  return films;
}

function buildContrast(db, mood, perFilmMax) {
  const action = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    JOIN film_genres fg ON fg.film_id = f.id JOIN genres g ON g.id = fg.genre_id
    WHERE g.name IN ('Action', 'Thriller', 'Horror') AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get();

  const cerebral = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    JOIN film_genres fg ON fg.film_id = f.id JOIN genres g ON g.id = fg.genre_id
    WHERE g.name IN ('Drama', 'Romance', 'Music') AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get();

  const films = [];
  if (action) films.push({ ...action, pick_type: 'rewatch', rationale: `The adrenaline hit` });
  if (cerebral) films.push({ ...cerebral, pick_type: 'rewatch', rationale: `The counter-program — slow it down` });
  return films;
}

function buildGenreEcho(db, mood, perFilmMax) {
  const genres = ['Drama', 'Thriller', 'Crime', 'Horror', 'Science Fiction', 'Comedy', 'War', 'Mystery'];
  const genre = mood ? getMoodGenres(mood)[0] || genres[Math.floor(Math.random() * genres.length)]
    : genres[Math.floor(Math.random() * genres.length)];

  const oldFilm = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    JOIN film_genres fg ON fg.film_id = f.id JOIN genres g ON g.id = fg.genre_id
    WHERE g.name = ? AND r.rating >= 8 AND f.year < 2000 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get(genre);

  const newFilm = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year >= 2010 AND LOWER(d.genres) LIKE ? AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 10
  `).all(`%${genre.toLowerCase()}%`);

  const films = [];
  if (oldFilm) films.push({ ...oldFilm, pick_type: 'rewatch', rationale: `A ${genre.toLowerCase()} benchmark you rated ${oldFilm.rating}/10` });
  if (newFilm.length > 0) {
    const pick = newFilm[Math.floor(Math.random() * Math.min(newFilm.length, 5))];
    films.push({ ...pick, pick_type: 'discovery', rationale: `The modern echo — same genre DNA, new voice` });
  }
  return films;
}

// ─── DISCOVERY-ONLY VARIANTS ────────────────────────────────────────

function buildGenreEchoDiscoveryOnly(db, mood, perFilmMax) {
  const genres = ['Drama', 'Thriller', 'Crime', 'Horror', 'Science Fiction', 'Comedy', 'War', 'Mystery'];
  const genre = mood ? getMoodGenres(mood)[0] || genres[Math.floor(Math.random() * genres.length)]
    : genres[Math.floor(Math.random() * genres.length)];

  const older = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year < 2000 AND LOWER(d.genres) LIKE ? AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 10
  `).all(`%${genre.toLowerCase()}%`);

  const newer = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year >= 2010 AND LOWER(d.genres) LIKE ? AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 10
  `).all(`%${genre.toLowerCase()}%`);

  const films = [];
  if (older.length > 0) {
    const pick = older[Math.floor(Math.random() * Math.min(older.length, 5))];
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({ ...pick, pick_type: 'discovery', rationale: rationale[0] || `A ${genre.toLowerCase()} classic you haven't seen` });
  }
  if (newer.length > 0) {
    const pick = newer[Math.floor(Math.random() * Math.min(newer.length, 5))];
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({ ...pick, pick_type: 'discovery', rationale: rationale[0] || `The modern echo — fresh ${genre.toLowerCase()}` });
  }
  return films;
}

function buildEraDiscoveryOnly(db, mood, perFilmMax) {
  const topDecades = db.prepare(`
    SELECT decade FROM taste_decade_affinity WHERE films_watched >= 10
    ORDER BY affinity_score DESC LIMIT 5
  `).all();
  if (topDecades.length === 0) return [];
  const decade = topDecades[Math.floor(Math.random() * topDecades.length)].decade;

  const films = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year >= ? AND d.year < ? AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 15
  `).all(decade, decade + 10);

  if (films.length < 2) return [];
  const shuffled = films.sort(() => Math.random() - 0.5).slice(0, 2);
  return shuffled.map((f, i) => {
    const rationale = f.taste_rationale ? JSON.parse(f.taste_rationale) : [];
    return { ...f, pick_type: 'discovery', rationale: rationale[0] || `A ${decade}s essential you haven't seen` };
  });
}

function buildNewAndClassicDiscoveryOnly(db, mood, perFilmMax) {
  const recent = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year >= 2015 AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 15
  `).all();

  const classic = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.year < 1970 AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 15
  `).all();

  const films = [];
  if (recent.length > 0) {
    const pick = recent[Math.floor(Math.random() * Math.min(recent.length, 8))];
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({ ...pick, pick_type: 'discovery', rationale: rationale[0] || `A modern standout matched to your taste` });
  }
  if (classic.length > 0) {
    const pick = classic[Math.floor(Math.random() * Math.min(classic.length, 8))];
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({ ...pick, pick_type: 'discovery', rationale: rationale[0] || `A pre-'70s classic you've been missing` });
  }
  return films;
}

function buildDiscoveryDouble(db, mood, perFilmMax) {
  let genreFilter = '';
  if (mood) {
    const moodGenres = getMoodGenres(mood);
    if (moodGenres.length) genreFilter = `AND LOWER(d.genres) LIKE '%${moodGenres[0].toLowerCase()}%'`;
  }

  const films = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.taste_score IS NOT NULL ${genreFilter} ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 20
  `).all();

  if (films.length < 2) return [];
  const shuffled = films.sort(() => Math.random() - 0.5).slice(0, 2);
  return shuffled.map(f => {
    const rationale = f.taste_rationale ? JSON.parse(f.taste_rationale) : [];
    return { ...f, pick_type: 'discovery', rationale: rationale[0] || 'Matched to your taste' };
  });
}

function buildDiscoveryContrast(db, mood, perFilmMax) {
  const intense = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.taste_score IS NOT NULL
      AND (LOWER(d.genres) LIKE '%action%' OR LOWER(d.genres) LIKE '%thriller%' OR LOWER(d.genres) LIKE '%horror%')
      ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 10
  `).all();

  const calm = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.taste_score IS NOT NULL
      AND (LOWER(d.genres) LIKE '%drama%' OR LOWER(d.genres) LIKE '%romance%' OR LOWER(d.genres) LIKE '%comedy%')
      ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 10
  `).all();

  const films = [];
  if (intense.length > 0) {
    const pick = intense[Math.floor(Math.random() * Math.min(intense.length, 5))];
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({ ...pick, pick_type: 'discovery', rationale: rationale[0] || 'The intensity' });
  }
  if (calm.length > 0) {
    const pick = calm[Math.floor(Math.random() * Math.min(calm.length, 5))];
    const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
    films.push({ ...pick, pick_type: 'discovery', rationale: rationale[0] || 'The cool-down' });
  }
  return films;
}

// ─── REWATCH-ONLY VARIANTS ──────────────────────────────────────────

function buildGenreEchoRewatchOnly(db, mood, perFilmMax) {
  const genres = ['Drama', 'Thriller', 'Crime', 'Horror', 'Science Fiction', 'Comedy', 'War', 'Mystery'];
  const genre = mood ? getMoodGenres(mood)[0] || genres[Math.floor(Math.random() * genres.length)]
    : genres[Math.floor(Math.random() * genres.length)];

  const films = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    JOIN film_genres fg ON fg.film_id = f.id JOIN genres g ON g.id = fg.genre_id
    WHERE g.name = ? AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 2
  `).all(genre);

  return films.map((f, i) => ({
    ...f, pick_type: 'rewatch',
    rationale: i === 0 ? `A ${genre.toLowerCase()} you rated ${f.rating}/10` : `The double — same genre, different energy`,
  }));
}

function buildEraRewatchOnly(db, mood, perFilmMax) {
  const topDecades = db.prepare(`
    SELECT decade FROM taste_decade_affinity WHERE films_watched >= 10
    ORDER BY affinity_score DESC LIMIT 5
  `).all();
  if (topDecades.length === 0) return [];
  const decade = topDecades[Math.floor(Math.random() * topDecades.length)].decade;

  const films = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE f.year >= ? AND f.year < ? AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 2
  `).all(decade, decade + 10);

  return films.map(f => ({
    ...f, pick_type: 'rewatch', rationale: `A ${decade}s favorite you rated ${f.rating}/10`,
  }));
}

function buildNewAndClassicRewatchOnly(db, mood, perFilmMax) {
  const recent = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE f.year >= 2010 AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get();

  const classic = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE f.year < 1970 AND r.rating >= 8 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 1
  `).get();

  const films = [];
  if (recent) films.push({ ...recent, pick_type: 'rewatch', rationale: `A recent favorite — rated ${recent.rating}/10` });
  if (classic) films.push({ ...classic, pick_type: 'rewatch', rationale: `Pair it with a classic you loved` });
  return films;
}

// ─── FALLBACKS ──────────────────────────────────────────────────────

function buildFallback(db, perFilmMax) {
  const films = db.prepare(`
    SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
      r.rating, f.imdb_id, f.tmdb_id,
      GROUP_CONCAT(DISTINCT g.name) as genres,
      (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
        JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors
    FROM films f JOIN ratings r ON r.film_id = f.id
    LEFT JOIN film_genres fg ON fg.film_id = f.id LEFT JOIN genres g ON g.id = fg.genre_id
    WHERE r.rating >= 9 ${runtimeFilter('f', perFilmMax)}
    GROUP BY f.id ORDER BY RANDOM() LIMIT 2
  `).all();
  return films.map(f => ({ ...f, pick_type: 'rewatch', rationale: `One of your all-time favorites` }));
}

function buildRewatchFallback(db, perFilmMax) {
  return buildFallback(db, perFilmMax);
}

function buildDiscoveryFallback(db, perFilmMax) {
  const films = db.prepare(`
    SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
      d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
    FROM discovery_pool d
    WHERE d.excluded = 0 AND d.taste_score IS NOT NULL ${runtimeFilter('d', perFilmMax)}
    ORDER BY d.taste_score DESC LIMIT 15
  `).all();
  if (films.length === 0) return [];
  const shuffled = films.sort(() => Math.random() - 0.5).slice(0, 2);
  return shuffled.map(f => {
    const rationale = f.taste_rationale ? JSON.parse(f.taste_rationale) : [];
    return { ...f, pick_type: 'discovery', rationale: rationale[0] || 'Matched to your taste' };
  });
}

// ─── HELPERS ────────────────────────────────────────────────────────

function getMoodGenres(mood) {
  const map = {
    adrenaline: ['Action', 'Thriller'],
    comfort: ['Comedy', 'Animation'],
    cerebral: ['Drama', 'Mystery'],
    dark: ['Horror', 'Thriller', 'Crime'],
    epic: ['War', 'Adventure', 'History'],
    heartfelt: ['Drama', 'Romance'],
    visual_feast: ['Fantasy', 'Science Fiction'],
  };
  return map[mood] || [];
}

// Single perfect pick for "just one film"
function getSinglePick({ mood, maxRuntime, rewatch = 'either' } = {}) {
  const db = getDb();

  let genreFilter = '';
  if (mood) {
    const genres = getMoodGenres(mood);
    if (genres.length) genreFilter = `AND g.name IN (${genres.map(g => `'${g}'`).join(',')})`;
  }

  // Rewatch pick
  if (rewatch !== 'no') {
    const tryRewatch = rewatch === 'yes' || Math.random() > 0.5;
    if (tryRewatch) {
      const film = db.prepare(`
        SELECT f.id, f.title, f.year, f.poster_path, f.backdrop_path, f.runtime, f.overview,
          r.rating, f.imdb_id, f.tmdb_id,
          GROUP_CONCAT(DISTINCT g.name) as genres,
          (SELECT GROUP_CONCAT(DISTINCT p.name) FROM film_credits fc
            JOIN people p ON p.id = fc.person_id WHERE fc.film_id = f.id AND fc.role = 'director') as directors,
          (SELECT MAX(w.watched_at) FROM watches w WHERE w.film_id = f.id) as last_watched
        FROM films f JOIN ratings r ON r.film_id = f.id
        JOIN film_genres fg ON fg.film_id = f.id JOIN genres g ON g.id = fg.genre_id
        WHERE r.rating >= 9 ${genreFilter} ${runtimeFilter('f', maxRuntime)}
        GROUP BY f.id ORDER BY RANDOM() LIMIT 1
      `).get();

      if (film) return { ...film, pick_type: 'rewatch', rationale: `You rated this ${film.rating}/10 — tonight's the night` };
      if (rewatch === 'yes') return null;
    }
  }

  // Discovery pick
  if (rewatch !== 'yes') {
    let discoveryGenreFilter = '';
    if (mood) {
      const moodGenres = getMoodGenres(mood);
      if (moodGenres.length) discoveryGenreFilter = `AND LOWER(d.genres) LIKE '%${moodGenres[0].toLowerCase()}%'`;
    }

    const discovery = db.prepare(`
      SELECT d.id, d.title, d.year, d.runtime, d.genres, d.imdb_id, d.tmdb_id,
        d.taste_score, d.taste_rationale, d.imdb_rating, d.rt_tomatometer, d.poster_path
      FROM discovery_pool d
      WHERE d.excluded = 0 AND d.taste_score IS NOT NULL AND d.taste_score >= 50
        ${discoveryGenreFilter} ${runtimeFilter('d', maxRuntime)}
      ORDER BY d.taste_score DESC LIMIT 20
    `).all();

    if (discovery.length > 0) {
      const pick = discovery[Math.floor(Math.random() * Math.min(discovery.length, 10))];
      const rationale = pick.taste_rationale ? JSON.parse(pick.taste_rationale) : [];
      return { ...pick, pick_type: 'discovery', rationale: rationale[0] || 'Matched to your taste' };
    }
  }

  return null;
}

module.exports = { getCuratedPicks, getSinglePick, PAIRING_STRATEGIES };
