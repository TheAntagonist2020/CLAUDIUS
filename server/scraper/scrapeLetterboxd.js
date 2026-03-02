/**
 * Letterboxd scraper for north-star user taste data.
 * Scrapes a public Letterboxd profile's film ratings to inform discovery scoring.
 *
 * Target: Sean Fennessey (@seanfennessey) – The Ringer film critic
 */

const cheerio = require('cheerio');
const { getDb } = require('../db');

const LETTERBOXD_BASE = 'https://letterboxd.com';
const NORTH_STAR_USERNAME = 'seanfennessey';
const REQUEST_DELAY_MS = 1200; // be respectful – just over 1 req/sec

// In-memory status for the Admin UI to poll
let scrapeStatus = {
  running: false,
  phase: null,      // 'scraping' | 'storing' | 'matching' | null
  pagesTotal: 0,
  pagesDone: 0,
  filmsFound: 0,
  filmStored: 0,
  filmMatched: 0,
  lastRun: null,
  error: null,
};

// ─── HTML Fetching ────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CLAUDIUS-personal/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── HTML Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a Letterboxd /films/ list page.
 * Returns array of { slug, title, lbRating (0.5–5.0 or null) }
 */
function parseFilmsPage(html) {
  const $ = cheerio.load(html);
  const films = [];

  // Each film is a <li class="poster-container"> containing a film-poster div
  $('li.poster-container').each((_, li) => {
    const posterDiv = $(li).find('[data-film-slug]').first();
    const slug = posterDiv.attr('data-film-slug');
    if (!slug) return;

    // Title from img alt text
    const title = posterDiv.find('img').attr('alt') || null;

    // Rating – sibling <p class="film-detail-content"> contains a rated-N span
    // The span's class is like: "rating rated-8" meaning 4.0 stars (N/2)
    let lbRating = null;
    const ratingSpan = $(li).find('span[class*="rated-"]');
    if (ratingSpan.length) {
      const classes = ratingSpan.attr('class') || '';
      const m = classes.match(/\brated-(\d+)\b/);
      if (m) lbRating = parseInt(m[1], 10) / 2;
    }

    films.push({ slug, title, lbRating });
  });

  return films;
}

/**
 * Find the last page number from the pagination block.
 * Returns 1 if no pagination is found (single page).
 */
function parseTotalPages(html) {
  const $ = cheerio.load(html);
  let max = 1;
  $('.paginate-pages a').each((_, a) => {
    const n = parseInt($(a).text().trim(), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max;
}

// ─── Core Scraping ────────────────────────────────────────────────────────────

async function scrapeAllFilms(username) {
  const firstUrl = `${LETTERBOXD_BASE}/${username}/films/`;
  console.log(`[Letterboxd] Fetching page 1: ${firstUrl}`);
  const firstHtml = await fetchHtml(firstUrl);

  const totalPages = parseTotalPages(firstHtml);
  console.log(`[Letterboxd] ${totalPages} page(s) found for @${username}`);
  scrapeStatus.pagesTotal = totalPages;
  scrapeStatus.pagesDone = 1;

  const allFilms = parseFilmsPage(firstHtml);

  for (let page = 2; page <= totalPages; page++) {
    await sleep(REQUEST_DELAY_MS);
    const url = `${LETTERBOXD_BASE}/${username}/films/page/${page}/`;
    console.log(`[Letterboxd] Fetching page ${page}/${totalPages}`);
    try {
      const html = await fetchHtml(url);
      allFilms.push(...parseFilmsPage(html));
    } catch (err) {
      console.warn(`[Letterboxd] Failed page ${page}: ${err.message}`);
    }
    scrapeStatus.pagesDone = page;
    scrapeStatus.filmsFound = allFilms.length;
  }

  return allFilms;
}

// ─── Database Storage ─────────────────────────────────────────────────────────

function storeFilms(username, films) {
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO letterboxd_influences (username, lb_slug, title, lb_rating, rating_10, scraped_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(username, lb_slug) DO UPDATE SET
      title      = excluded.title,
      lb_rating  = excluded.lb_rating,
      rating_10  = excluded.rating_10,
      scraped_at = excluded.scraped_at
  `);

  const storeAll = db.transaction(() => {
    for (const film of films) {
      const rating10 = film.lbRating != null ? Math.round(film.lbRating * 2) : null;
      upsert.run(username, film.slug, film.title, film.lbRating, rating10);
      scrapeStatus.filmStored++;
    }
  });

  storeAll();
}

/**
 * After scraping, try to match Letterboxd slugs/titles to entries in the
 * discovery_pool so the recommendation scorer can reference Sean's ratings.
 *
 * Matching strategy (in order):
 *   1. Exact title match (case-insensitive)
 *   2. Slug-derived title match (hyphens → spaces)
 *   3. Slug year-strip match (some slugs end with the year: "film-title-2019")
 */
function matchToDiscovery(db, username) {
  const unmatched = db.prepare(`
    SELECT id, lb_slug, title
    FROM letterboxd_influences
    WHERE username = ? AND tmdb_id IS NULL
  `).all(username);

  const setMatch = db.prepare(`
    UPDATE letterboxd_influences SET tmdb_id = ?, year = ? WHERE id = ?
  `);

  const lookupByTitle = db.prepare(`
    SELECT tmdb_id, year FROM discovery_pool
    WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1
  `);

  let matched = 0;

  for (const row of unmatched) {
    // Strategy 1 – exact title
    if (row.title) {
      const hit = lookupByTitle.get(row.title);
      if (hit) {
        setMatch.run(hit.tmdb_id, hit.year, row.id);
        matched++;
        continue;
      }
    }

    // Strategy 2 – slug as title
    const slugTitle = row.lb_slug.replace(/-/g, ' ');
    const hit2 = lookupByTitle.get(slugTitle);
    if (hit2) {
      setMatch.run(hit2.tmdb_id, hit2.year, row.id);
      matched++;
      continue;
    }

    // Strategy 3 – slug may end with a 4-digit year (e.g. "the-godfather-1972")
    const yearSuffix = row.lb_slug.match(/-(\d{4})$/);
    if (yearSuffix) {
      const slugNoYear = row.lb_slug.slice(0, -5).replace(/-/g, ' ');
      const hit3 = lookupByTitle.get(slugNoYear);
      if (hit3) {
        setMatch.run(hit3.tmdb_id, hit3.year, row.id);
        matched++;
      }
    }
  }

  console.log(`[Letterboxd] Matched ${matched}/${unmatched.length} films to discovery pool`);
  scrapeStatus.filmMatched = matched;
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function runScrape(username = NORTH_STAR_USERNAME) {
  if (scrapeStatus.running) {
    throw new Error('A scrape is already in progress.');
  }

  scrapeStatus = {
    running: true,
    phase: 'scraping',
    pagesTotal: 0,
    pagesDone: 0,
    filmsFound: 0,
    filmStored: 0,
    filmMatched: 0,
    lastRun: null,
    error: null,
  };

  // Run async, return immediately (Admin UI polls for status)
  (async () => {
    try {
      // Phase 1: scrape
      const films = await scrapeAllFilms(username);
      scrapeStatus.filmsFound = films.length;
      console.log(`[Letterboxd] Scraped ${films.length} films from @${username}`);

      // Phase 2: store
      scrapeStatus.phase = 'storing';
      storeFilms(username, films);
      console.log(`[Letterboxd] Stored ${scrapeStatus.filmStored} films`);

      // Phase 3: match to discovery pool
      scrapeStatus.phase = 'matching';
      matchToDiscovery(getDb(), username);

      scrapeStatus.running = false;
      scrapeStatus.phase = null;
      scrapeStatus.lastRun = new Date().toISOString();
      console.log(`[Letterboxd] Scrape complete for @${username}`);
    } catch (err) {
      console.error('[Letterboxd] Scrape error:', err);
      scrapeStatus.running = false;
      scrapeStatus.phase = null;
      scrapeStatus.error = err.message;
    }
  })();
}

function getScrapeStatus() {
  const db = getDb();
  let dbCounts = { total: 0, rated: 0, matched: 0 };
  try {
    dbCounts = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN lb_rating IS NOT NULL THEN 1 END) as rated,
        COUNT(CASE WHEN tmdb_id IS NOT NULL THEN 1 END) as matched
      FROM letterboxd_influences WHERE username = ?
    `).get(NORTH_STAR_USERNAME) || dbCounts;
  } catch (_) {}

  return { ...scrapeStatus, db: dbCounts };
}

/**
 * Return a map of tmdb_id → { lbRating, rating10 } for all films
 * Sean has rated that are matched to discovery pool.
 * Used by the recommendation scorer.
 */
function getInfluenceMap(username = NORTH_STAR_USERNAME) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT tmdb_id, lb_rating, rating_10
    FROM letterboxd_influences
    WHERE username = ? AND tmdb_id IS NOT NULL
  `).all(username);

  const map = {};
  for (const r of rows) {
    map[r.tmdb_id] = { lbRating: r.lb_rating, rating10: r.rating_10 };
  }
  return map;
}

module.exports = {
  runScrape,
  getScrapeStatus,
  getInfluenceMap,
  NORTH_STAR_USERNAME,
};
