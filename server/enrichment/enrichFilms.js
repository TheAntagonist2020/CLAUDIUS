const { getDb } = require('../db');
const { getMovieDetails } = require('./tmdbClient');
const config = require('../config');

let enrichmentStatus = { running: false, total: 0, completed: 0, errors: 0 };
let streamingStatus = { running: false, total: 0, completed: 0, errors: 0, staleDays: 30 };

function getEnrichmentStatus() {
  return { ...enrichmentStatus };
}

function getStreamingStatus() {
  return { ...streamingStatus };
}

async function enrichFilms(batchSize = 100) {
  const db = getDb();

  const unenriched = db.prepare(
    'SELECT id, tmdb_id, title, year FROM films WHERE enriched = 0 AND tmdb_id IS NOT NULL LIMIT ?'
  ).all(batchSize);

  if (unenriched.length === 0) {
    console.log('All films are already enriched.');
    return 0;
  }

  enrichmentStatus = { running: true, total: unenriched.length, completed: 0, errors: 0 };
  console.log(`Enriching ${unenriched.length} films...`);

  const updateFilm = db.prepare(`
    UPDATE films SET
      overview = @overview, tagline = @tagline, poster_path = @poster_path,
      backdrop_path = @backdrop_path, runtime = @runtime, release_date = @release_date,
      original_language = @original_language, tmdb_rating = @tmdb_rating,
      tmdb_vote_count = @tmdb_vote_count, enriched = 1, enriched_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = @id
  `);

  const insertGenre = db.prepare('INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)');
  const linkGenre = db.prepare('INSERT OR IGNORE INTO film_genres (film_id, genre_id) VALUES (?, ?)');
  const insertPerson = db.prepare('INSERT OR IGNORE INTO people (id, name, profile_path, known_for_department) VALUES (?, ?, ?, ?)');
  const linkCredit = db.prepare('INSERT OR IGNORE INTO film_credits (film_id, person_id, role, character_name, credit_order) VALUES (?, ?, ?, ?, ?)');
  const insertStreaming = db.prepare(`
    INSERT OR REPLACE INTO streaming_availability (film_id, provider_name, provider_logo, type, region)
    VALUES (?, ?, ?, ?, 'US')
  `);

  for (const film of unenriched) {
    try {
      const details = await getMovieDetails(film.tmdb_id);

      updateFilm.run({
        id: film.id,
        overview: details.overview || null,
        tagline: details.tagline || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        runtime: details.runtime || null,
        release_date: details.release_date || null,
        original_language: details.original_language || null,
        tmdb_rating: details.vote_average || null,
        tmdb_vote_count: details.vote_count || null,
      });

      // Genres
      if (details.genres) {
        for (const g of details.genres) {
          insertGenre.run(g.id, g.name);
          linkGenre.run(film.id, g.id);
        }
      }

      // Credits - directors + top 10 cast
      if (details.credits) {
        const directors = (details.credits.crew || []).filter(c => c.job === 'Director');
        for (const d of directors) {
          insertPerson.run(d.id, d.name, d.profile_path, 'Directing');
          linkCredit.run(film.id, d.id, 'director', null, null);
        }
        const cast = (details.credits.cast || []).slice(0, 10);
        for (const a of cast) {
          insertPerson.run(a.id, a.name, a.profile_path, 'Acting');
          linkCredit.run(film.id, a.id, 'actor', a.character || null, a.order);
        }
      }

      // Streaming providers (US)
      const providers = details['watch/providers']?.results?.US;
      if (providers) {
        for (const type of ['flatrate', 'rent', 'buy', 'free']) {
          if (providers[type]) {
            for (const p of providers[type]) {
              insertStreaming.run(film.id, p.provider_name, p.logo_path, type);
            }
          }
        }
      }

      enrichmentStatus.completed++;
      if (enrichmentStatus.completed % 50 === 0) {
        console.log(`  Enriched ${enrichmentStatus.completed}/${enrichmentStatus.total}...`);
      }
    } catch (err) {
      enrichmentStatus.errors++;
      console.error(`  Error enriching "${film.title}" (tmdb:${film.tmdb_id}): ${err.message}`);
    }
  }

  enrichmentStatus.running = false;
  console.log(`Enrichment complete: ${enrichmentStatus.completed} success, ${enrichmentStatus.errors} errors.`);
  return enrichmentStatus.completed;
}

/**
 * Re-fetch streaming availability from TMDb for films whose data is older
 * than `staleDays` days (default: config.STREAMING_STALE_DAYS).
 * Runs independently of full enrichment so availability stays current.
 */
async function refreshStreaming(batchSize = 200, staleDays = config.STREAMING_STALE_DAYS) {
  if (streamingStatus.running) {
    console.log('Streaming refresh already in progress.');
    return 0;
  }

  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffISO = cutoff.toISOString();

  // Films that are enriched and have stale (or missing) streaming data
  const stale = db.prepare(`
    SELECT f.id, f.tmdb_id, f.title
    FROM films f
    LEFT JOIN (
      SELECT film_id, MAX(fetched_at) AS latest_fetch
      FROM streaming_availability
      GROUP BY film_id
    ) sa ON sa.film_id = f.id
    WHERE f.enriched = 1 AND f.tmdb_id IS NOT NULL
      AND (sa.film_id IS NULL OR sa.latest_fetch < ?)
    LIMIT ?
  `).all(cutoffISO, batchSize);

  if (stale.length === 0) {
    console.log('No stale streaming data found — all up to date.');
    return 0;
  }

  streamingStatus = { running: true, total: stale.length, completed: 0, errors: 0, staleDays };
  console.log(`Refreshing streaming availability for ${stale.length} films (stale > ${staleDays}d)...`);

  const deleteStreaming = db.prepare('DELETE FROM streaming_availability WHERE film_id = ?');
  const insertStreaming = db.prepare(`
    INSERT OR REPLACE INTO streaming_availability (film_id, provider_name, provider_logo, type, region, fetched_at)
    VALUES (?, ?, ?, ?, 'US', datetime('now'))
  `);

  for (const film of stale) {
    try {
      const details = await getMovieDetails(film.tmdb_id);
      const providers = details['watch/providers']?.results?.US;

      deleteStreaming.run(film.id);
      if (providers) {
        for (const type of ['flatrate', 'rent', 'buy', 'free']) {
          if (providers[type]) {
            for (const p of providers[type]) {
              insertStreaming.run(film.id, p.provider_name, p.logo_path, type);
            }
          }
        }
      }

      streamingStatus.completed++;
      if (streamingStatus.completed % 50 === 0) {
        console.log(`  Streaming refresh: ${streamingStatus.completed}/${streamingStatus.total}...`);
      }
    } catch (err) {
      streamingStatus.errors++;
      console.error(`  Streaming refresh error for "${film.title}" (tmdb:${film.tmdb_id}): ${err.message}`);
    }
  }

  streamingStatus.running = false;
  console.log(`Streaming refresh complete: ${streamingStatus.completed} updated, ${streamingStatus.errors} errors.`);
  return streamingStatus.completed;
}

module.exports = { enrichFilms, getEnrichmentStatus, refreshStreaming, getStreamingStatus };
