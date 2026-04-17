-- CLAUDIUS Database Schema (Postgres / Neon)

CREATE TABLE IF NOT EXISTS films (
    id              SERIAL PRIMARY KEY,
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
    enriched_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
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
    id          SERIAL PRIMARY KEY,
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    watched_at  TEXT NOT NULL,
    source      TEXT DEFAULT 'trakt',
    created_at  TIMESTAMPTZ DEFAULT NOW()
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
    id              SERIAL PRIMARY KEY,
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
    created_at      TIMESTAMPTZ DEFAULT NOW()
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
    computed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taste_director_affinity (
    person_id       INTEGER PRIMARY KEY,
    director_name   TEXT NOT NULL,
    films_watched   INTEGER,
    films_rated     INTEGER,
    avg_rating      REAL,
    affinity_score  REAL,
    computed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taste_decade_affinity (
    decade          INTEGER PRIMARY KEY,
    films_watched   INTEGER,
    films_rated     INTEGER,
    avg_rating      REAL,
    volume_score    REAL,
    quality_score   REAL,
    affinity_score  REAL,
    computed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taste_profile_meta (
    key             TEXT PRIMARY KEY,
    value           TEXT,
    computed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
    id          SERIAL PRIMARY KEY,
    film_id     INTEGER REFERENCES films(id),
    tmdb_id     INTEGER,
    title       TEXT NOT NULL,
    year        INTEGER,
    category    TEXT NOT NULL DEFAULT 'to_watch',
    priority    INTEGER DEFAULT 0,
    lane        TEXT,
    source      TEXT,
    notes       TEXT,
    added_at    TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_watchlist_category ON watchlist(category);

CREATE TABLE IF NOT EXISTS review_pipeline (
    id              SERIAL PRIMARY KEY,
    film_id         INTEGER REFERENCES films(id) ON DELETE CASCADE,
    imdb_id         TEXT,
    source_file     TEXT,
    rewrite_status  TEXT DEFAULT 'not_started',
    in_master_doc   INTEGER DEFAULT 0,
    has_debrief     INTEGER DEFAULT 0,
    wordpress_ready INTEGER DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS film_notes (
    id          SERIAL PRIMARY KEY,
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    note_type   TEXT DEFAULT 'general',
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS streaming_availability (
    film_id     INTEGER REFERENCES films(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    provider_logo TEXT,
    type        TEXT NOT NULL,
    region      TEXT DEFAULT 'US',
    fetched_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (film_id, provider_name, type, region)
);

CREATE TABLE IF NOT EXISTS trakt_sync_log (
    id              SERIAL PRIMARY KEY,
    synced_at       TEXT NOT NULL,
    watched_count   INTEGER DEFAULT 0,
    ratings_count   INTEGER DEFAULT 0,
    watchlist_count INTEGER DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'success',
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue (
    id              SERIAL PRIMARY KEY,
    queue_date      TEXT NOT NULL,
    slot            TEXT NOT NULL CHECK(slot IN ('morning', 'afternoon', 'evening', 'bonus')),
    title           TEXT NOT NULL,
    year            INTEGER,
    runtime         INTEGER,
    genres          TEXT,
    directors       TEXT,
    poster_path     TEXT,
    imdb_id         TEXT,
    tmdb_id         INTEGER,
    film_id         INTEGER,
    source          TEXT DEFAULT 'discovery',
    source_detail   TEXT,
    taste_score     REAL,
    rationale       TEXT,
    streaming_info  TEXT,
    status          TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned', 'watching', 'completed', 'skipped')),
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    UNIQUE(queue_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_queue_date ON queue(queue_date);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);

CREATE TABLE IF NOT EXISTS queue_settings (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

CREATE TABLE IF NOT EXISTS queue_history (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    year            INTEGER,
    imdb_id         TEXT,
    completed_at    TEXT NOT NULL,
    slot            TEXT,
    queue_date      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- App settings (replaces filesystem JSON storage for tokens, preferences, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
    key     TEXT PRIMARY KEY,
    value   JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
