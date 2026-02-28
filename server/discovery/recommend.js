const { getDb } = require('../db');

function scoreDiscoveryPool() {
  const db = getDb();

  // Load taste profile
  const genreAffinities = {};
  db.prepare('SELECT genre_name, affinity_score FROM taste_genre_affinity').all()
    .forEach(g => { genreAffinities[g.genre_name.toLowerCase()] = g.affinity_score; });

  const overallAvg = Number(
    db.prepare("SELECT value FROM taste_profile_meta WHERE key = 'overall_avg_rating'").get()?.value || 7
  );

  const decadeAffinities = {};
  db.prepare('SELECT decade, affinity_score FROM taste_decade_affinity').all()
    .forEach(d => { decadeAffinities[d.decade] = d.affinity_score; });

  const pool = db.prepare('SELECT * FROM discovery_pool WHERE excluded = 0').all();
  console.log(`Scoring ${pool.length} discovery pool films...`);

  const update = db.prepare(
    'UPDATE discovery_pool SET taste_score = ?, taste_rationale = ? WHERE id = ?'
  );

  const updateAll = db.transaction(() => {
    for (const film of pool) {
      const { score, rationale } = scoreFilm(film, genreAffinities, decadeAffinities, overallAvg);
      update.run(Math.round(score * 10) / 10, JSON.stringify(rationale), film.id);
    }
  });

  updateAll();
  console.log('Discovery pool scored.');
}

function scoreFilm(film, genreAffinities, decadeAffinities, overallAvg) {
  const reasons = [];
  let genreScore = 0;
  let genreCount = 0;

  if (film.genres) {
    const genres = film.genres.split(',').map(g => g.trim().toLowerCase());
    for (const g of genres) {
      if (genreAffinities[g]) {
        genreScore += genreAffinities[g];
        genreCount++;
      }
    }
    if (genreCount > 0) {
      genreScore /= genreCount;
      if (genreScore > 60) {
        const topGenre = film.genres.split(',')[0].trim();
        reasons.push(`Strong match: your ${topGenre} affinity is high`);
      }
    }
  }

  // Decade match
  const decade = film.year ? Math.floor(film.year / 10) * 10 : null;
  const decadeScore = decade && decadeAffinities[decade] ? decadeAffinities[decade] : 50;
  if (decadeScore > 65 && decade) {
    reasons.push(`From the ${decade}s, one of your favorite eras`);
  }

  // Critical consensus (normalize various ratings to 0-100)
  let criticalScore = 0;
  let criticalSources = 0;

  if (film.imdb_rating && film.imdb_rating > 0) {
    criticalScore += (film.imdb_rating / 10) * 100;
    criticalSources++;
  }
  if (film.tmdb_rating && film.tmdb_rating > 0) {
    criticalScore += (film.tmdb_rating / 10) * 100;
    criticalSources++;
  }
  if (film.rt_tomatometer && film.rt_tomatometer > 0) {
    criticalScore += film.rt_tomatometer;
    criticalSources++;
  }
  if (film.metascore && film.metascore > 0) {
    criticalScore += film.metascore;
    criticalSources++;
  }

  criticalScore = criticalSources > 0 ? criticalScore / criticalSources : 50;

  if (criticalScore > 80) {
    reasons.push(`Strong critical consensus (${film.rt_tomatometer ? film.rt_tomatometer + '% RT' : 'highly rated'})`);
  }

  // List prestige - more source lists = more highly curated
  let listScore = 50;
  if (film.source_lists) {
    const listCount = film.source_lists.split(',').length;
    listScore = Math.min(100, 40 + listCount * 15);
    if (listCount >= 3) {
      reasons.push(`Appears on ${listCount} curated lists`);
    }
  }

  // Runtime preference (sweet spot: 90-140 min)
  let runtimeScore = 70;
  if (film.runtime) {
    if (film.runtime >= 90 && film.runtime <= 140) runtimeScore = 85;
    else if (film.runtime > 180) runtimeScore = 50;
    else if (film.runtime < 70) runtimeScore = 55;
  }

  const totalScore = (
    0.30 * genreScore +
    0.15 * decadeScore +
    0.25 * criticalScore +
    0.15 * listScore +
    0.10 * runtimeScore +
    0.05 * 60 // base
  );

  if (reasons.length === 0) {
    reasons.push('Matches your general viewing profile');
  }

  return { score: totalScore, rationale: reasons };
}

function getRecommendations({ count = 20, genre, decade, minRuntime, maxRuntime, mood } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM discovery_pool WHERE excluded = 0 AND taste_score IS NOT NULL';
  const params = [];

  if (genre) {
    query += ' AND LOWER(genres) LIKE ?';
    params.push(`%${genre.toLowerCase()}%`);
  }
  if (decade) {
    query += ' AND year >= ? AND year < ?';
    params.push(Number(decade), Number(decade) + 10);
  }
  if (minRuntime) {
    query += ' AND runtime >= ?';
    params.push(Number(minRuntime));
  }
  if (maxRuntime) {
    query += ' AND runtime <= ?';
    params.push(Number(maxRuntime));
  }

  query += ' ORDER BY taste_score DESC LIMIT ?';
  params.push(count);

  return db.prepare(query).all(...params);
}

module.exports = { scoreDiscoveryPool, getRecommendations };
