-- CLAUDIUS Database Schema

CREATE TABLE IF NOT EXISTS films (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    year            INTEGER,
    tmdb_id         INTEGER UNIQUE,
    imdb_id         TEXT,
    trakt_id        INTEGER,
    slug            TEXT,
    overview        TEXT,
    tagline         TEXT,
    poster_path     TEXT,
    backdrop_path   TEXT,
    runtime         INTEGER,
    release_date    TEXT,
    original_language TEXT,
    tmdb_rating     REAL,
    tmdb_vote_count INTEGER,
    imdb_rating     REAL,
    enriched        INTEGER DEFAULT 0,
    enriched_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_films_tmdb ON films(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_films_imdb ON films(imdb_id);
CREATE INDEX IF NOT EXISTS idx_films_year ON films(year);
CREATE INDEX IF NOT EXISTS idx_films_title ON films(title);

CREATE TABLE IF NOT EXISTS genres (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS film_genres (
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    genre_id    INTEGER REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (film_id, genre_id)
);

CREATE TABLE IF NOT EXISTS people (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    profile_path    TEXT,
    known_for_department TEXT
);

CREATE TABLE IF NOT EXISTS film_credits (
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    person_id   INTEGER REFERENCES people(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    character_name TEXT,
    credit_order INTEGER,
    PRIMARY KEY (film_id, person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_credits_person ON film_credits(person_id);
CREATE INDEX IF NOT EXISTS idx_credits_role ON film_credits(role);

CREATE TABLE IF NOT EXISTS watches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    watched_at  TEXT NOT NULL,
    source      TEXT DEFAULT 'trakt',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_watches_film ON watches(film_id);
CREATE INDEX IF NOT EXISTS idx_watches_date ON watches(watched_at);

CREATE TABLE IF NOT EXISTS ratings (
    film_id     INTEGER PRIMARY KEY REFERENCES films(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10),
    rated_at    TEXT,
    source      TEXT DEFAULT 'trakt'
);

CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating);

CREATE TABLE IF NOT EXISTS discovery_pool (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    year            INTEGER,
    tmdb_id         INTEGER,
    imdb_id         TEXT,
    trakt_id        INTEGER,
    runtime         INTEGER,
    genres          TEXT,
    country         TEXT,
    language        TEXT,
    trakt_rating    REAL,
    imdb_rating     REAL,
    tmdb_rating     REAL,
    rt_tomatometer  INTEGER,
    rt_audience     INTEGER,
    metascore       INTEGER,
    source_lists    TEXT,
    taste_score     REAL,
    taste_rationale TEXT,
    poster_path     TEXT,
    excluded        INTEGER DEFAULT 0,
    enriched        INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_discovery_tmdb ON discovery_pool(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_discovery_taste ON discovery_pool(taste_score DESC);

CREATE TABLE IF NOT EXISTS taste_genre_affinity (
    genre_id        INTEGER PRIMARY KEY,
    genre_name      TEXT NOT NULL,
    films_watched   INTEGER,
    films_rated     INTEGER,
    avg_rating      REAL,
    high_rate_pct   REAL,
    affinity_score  REAL,
    computed_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS taste_director_affinity (
    person_id       INTEGER PRIMARY KEY,
    director_name   TEXT NOT NULL,
    films_watched   INTEGER,
    films_rated     INTEGER,
    avg_rating      REAL,
    affinity_score  REAL,
    computed_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS taste_decade_affinity (
    decade          INTEGER PRIMARY KEY,
    films_watched   INTEGER,
    films_rated     INTEGER,
    avg_rating      REAL,
    volume_score    REAL,
    quality_score   REAL,
    affinity_score  REAL,
    computed_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS taste_profile_meta (
    key             TEXT PRIMARY KEY,
    value           TEXT,
    computed_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    film_id     INTEGER REFERENCES films(id),
    tmdb_id     INTEGER,
    title       TEXT NOT NULL,
    year        INTEGER,
    category    TEXT NOT NULL DEFAULT 'to_watch',
    priority    INTEGER DEFAULT 0,
    lane        TEXT,
    source      TEXT,
    notes       TEXT,
    added_at    TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_watchlist_category ON watchlist(category);

CREATE TABLE IF NOT EXISTS review_pipeline (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    film_id         INTEGER REFERENCES films(id) ON DELETE CASCADE,
    imdb_id         TEXT,
    source_file     TEXT,
    rewrite_status  TEXT DEFAULT 'not_started',
    in_master_doc   INTEGER DEFAULT 0,
    has_debrief     INTEGER DEFAULT 0,
    wordpress_ready INTEGER DEFAULT 0,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS film_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    note_type   TEXT DEFAULT 'general',
    content     TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streaming_availability (
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    provider_logo TEXT,
    type        TEXT NOT NULL,
    region      TEXT DEFAULT 'US',
    fetched_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (film_id, provider_name, type, region)
);
