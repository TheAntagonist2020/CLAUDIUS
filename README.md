# CLAUDIUS — Film Intelligence System

A personal movie recommendation app. Pulls your watched history from Trakt,
enriches it with TMDB metadata, builds a taste profile from your ratings, and
serves tailored discovery picks, rewatch suggestions, and a nightly curated
pairing. Runs as a local Node/Express server with a React (Vite + Tailwind)
frontend. Mobile and laptop friendly over your LAN.

## Quick start

```bash
git clone <this repo>
cd CLAUDIUS
npm install
cp .env.example .env         # fill in TMDB_API_KEY (and optionally MDBList)
npm run build                # builds the frontend into dist/
npm run seed                 # optional: load demo films so the UI has content
npm start                    # serves frontend + API on http://localhost:3001
```

Open `http://localhost:3001`. From another device on your LAN, use
`http://<your-lan-ip>:3001`.

### Dev mode (hot reload)

```bash
npm run server               # terminal 1 — API on :3001
npm run dev                  # terminal 2 — Vite on :5173 (proxies /api to :3001)
```

## Loading your data

### Option A — Trakt export (recommended)

1. Request an export at <https://trakt.tv/settings/data>, download the zip.
2. Drop the zip into `data/` (any filename matching `trakt*.zip` works), or
   unzip into `data/trakt/`.
3. Either run `npm run import:trakt` from the terminal, or open the Admin page
   in the UI and click **Import Trakt**.
4. Set `TMDB_API_KEY` in `.env`, then click **Start Enrichment** on Admin to
   fetch posters, genres, cast, and streaming providers.
5. Click **Rebuild & Score** to compute your taste profile and score the
   discovery pool.

### Option B — CSV pipeline (legacy)

Put these files in `data/` (filenames are the defaults — all overridable via
`.env`):

| File | Purpose |
|------|---------|
| `watched.csv` or `watched.xlsx` | Watched films with ratings |
| `super-list.csv` | Discovery pool candidates |
| `gap-list.csv` | High-priority watchlist items (optional) |
| `gap-master.csv` | Broader watchlist (optional) |

Then run `npm run import` or click **Run CSV Import** in Admin.

### Option C — Demo data

If you just want to see the app working:

```bash
npm run seed
```

Loads ~40 iconic films, 30 discovery candidates, and a watchlist. Safe to run
alongside your real data.

## Configuration

See `.env.example` for all options. The important ones:

- `TMDB_API_KEY` — required for enrichment. Free from
  <https://www.themoviedb.org/settings/api>.
- `MDBLIST_API_KEY` — optional. Enables streaming availability lookups and
  watchlist push from the film page.
- `DATA_DIR` — override where import files live. Defaults to `./data`.
- `PORT` / `HOST` — server binding. `HOST=0.0.0.0` (default) lets other devices
  on your LAN reach the server.

## Features

- **Dashboard** — watch count, average rating, hours watched, today's pick.
- **Library** — searchable/filterable list of your watched films.
- **Taste profile** — genre, director, and decade affinities computed from
  your ratings.
- **Discovery** — scores your candidate pool against your taste profile with
  rationale strings.
- **Tonight** — curator picks a pairing strategy (genre echo, contrast,
  director deep-dive, etc.) and suggests two films for the evening.
- **Rewatch** — surfaces 7+ rated films weighted by time since last watch and
  optional mood.
- **Watchlist** — organize what to watch next, priority/lane/notes.
- **Admin** — import, enrich, rebuild, and (on Windows) schedule a daily
  toast notification for your pick.

## Mobile access

The server binds to `0.0.0.0:3001` by default. From your phone on the same
network, open `http://<laptop-ip>:3001`. On Mac: `ipconfig getifaddr en0`. On
Windows: `ipconfig`. On Linux: `hostname -I`.

For access away from home, put it behind Tailscale or a reverse proxy — the
app has no auth, so do not expose it to the public internet as-is.

## Project layout

```
server/
  index.js            Express entrypoint, routes mounted here
  config.js           Env-driven configuration
  db.js               SQLite (better-sqlite3) connection
  routes/             Per-feature HTTP routes
  import/             CSV + Trakt + seed importers
  enrichment/         TMDB + MDBList clients
  taste/              Taste profile computation
  discovery/          Recommendation scoring + curator pairing
  rewatch/            Rewatch radar
  reminder.js         Daily pick + (Windows) toast scheduling

src/                  React frontend (Vite + Tailwind)
db/schema.sql         SQLite schema
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server on :5173 |
| `npm run server` | API only |
| `npm run build` | Build frontend to `dist/` |
| `npm start` | Run API + serve built frontend on :3001 |
| `npm run seed` | Load demo data |
| `npm run import` | Run CSV import pipeline |
| `npm run import:trakt [path]` | Import Trakt export zip or directory |
