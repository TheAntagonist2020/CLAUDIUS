import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Admin() {
  const [importResult, setImportResult] = useState(null);
  const [enrichStatus, setEnrichStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [batchSize, setBatchSize] = useState(200);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [reminderStatus, setReminderStatus] = useState(null);
  const [reminderMsg, setReminderMsg] = useState(null);

  // Letterboxd scraper state
  const [lbStatus, setLbStatus] = useState(null);
  const [lbScraping, setLbScraping] = useState(false);

  // Load reminder status
  useEffect(() => {
    api.getReminderStatus().then(s => {
      setReminderStatus(s);
      if (s.time) setReminderTime(s.time);
    }).catch(() => {});

    // Load initial Letterboxd status
    api.getLetterboxdStatus().then(setLbStatus).catch(() => {});
  }, []);

  // Poll enrichment status while running
  useEffect(() => {
    if (!enriching) return;
    const interval = setInterval(async () => {
      const status = await api.getEnrichStatus();
      setEnrichStatus(status);
      if (!status.running) {
        setEnriching(false);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [enriching]);

  // Poll Letterboxd scrape status while running
  useEffect(() => {
    if (!lbScraping) return;
    const interval = setInterval(async () => {
      const status = await api.getLetterboxdStatus();
      setLbStatus(status);
      if (!status.running) {
        setLbScraping(false);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [lbScraping]);

  const runImport = async () => {
    setImporting(true);
    try {
      const result = await api.runImport();
      setImportResult(result);
    } catch (err) {
      setImportResult({ error: err.message });
    }
    setImporting(false);
  };

  const runEnrich = async () => {
    setEnriching(true);
    try {
      await api.runEnrich(batchSize);
    } catch (err) {
      setEnriching(false);
    }
  };

  const runLbScrape = async () => {
    setLbScraping(true);
    try {
      await api.scrapeLetterboxd();
    } catch (err) {
      setLbScraping(false);
    }
  };

  const rebuildAll = async () => {
    await api.rebuildTaste();
    await api.scoreDiscovery();
    alert('Taste profile rebuilt and discovery pool re-scored.');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-zinc-100">Admin</h1>
        <p className="text-zinc-500 mt-1">Import, enrich, and maintain your data</p>
      </div>

      {/* Step 1: Import */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Step 1: Import Data</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Import your watched films (CSV), discovery pool (SUPER-LIST), and gap lists into the database.
        </p>
        <button onClick={runImport} disabled={importing}
          className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
          {importing ? 'Importing...' : 'Run Full Import'}
        </button>
        {importResult && (
          <div className="mt-4 bg-film-dark border border-film-border rounded-lg p-4 text-sm">
            {importResult.error ? (
              <p className="text-red-400">{importResult.error}</p>
            ) : (
              <div className="space-y-1 text-zinc-300">
                <p>Films imported: <span className="text-gold-400 font-medium">{importResult.watchedCount}</span></p>
                <p>Discovery pool: <span className="text-gold-400 font-medium">{importResult.discoveryCount}</span></p>
                <p>Watchlist items: <span className="text-gold-400 font-medium">{importResult.gapCount}</span></p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 1b: Letterboxd North-Star Scrape */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-1">Step 1b: Sync Sean Fennessey's Letterboxd</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Scrapes <span className="text-zinc-300 font-medium">@seanfennessey</span>'s public Letterboxd profile
          (The Ringer) and uses his ratings as a north-star signal when scoring your discovery pool.
          Films he rates 4★+ get a significant boost; unrated watched films get a small bump.
        </p>
        <button onClick={runLbScrape} disabled={lbScraping}
          className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
          {lbScraping ? 'Scraping Letterboxd…' : 'Scrape Letterboxd'}
        </button>

        {lbStatus && (
          <div className="mt-4 bg-film-dark border border-film-border rounded-lg p-4 text-sm space-y-2">
            {lbStatus.running && (
              <div className="flex items-center gap-3 text-zinc-300">
                <div className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
                <span className="capitalize">{lbStatus.phase || 'working'}…</span>
                {lbStatus.pagesTotal > 0 && (
                  <span className="text-zinc-500">
                    page {lbStatus.pagesDone}/{lbStatus.pagesTotal} · {lbStatus.filmsFound} films found
                  </span>
                )}
              </div>
            )}
            {lbStatus.error && (
              <p className="text-red-400">{lbStatus.error}</p>
            )}
            {lbStatus.db && lbStatus.db.total > 0 && (
              <div className="flex gap-6 text-zinc-300">
                <p>Films scraped: <span className="text-gold-400 font-medium">{lbStatus.db.total}</span></p>
                <p>Rated: <span className="text-gold-400 font-medium">{lbStatus.db.rated}</span></p>
                <p>Matched to pool: <span className="text-gold-400 font-medium">{lbStatus.db.matched}</span></p>
              </div>
            )}
            {lbStatus.lastRun && !lbStatus.running && (
              <p className="text-zinc-600 text-xs">
                Last synced: {new Date(lbStatus.lastRun).toLocaleString()}
                {' · '}After scraping, run <span className="text-zinc-400">Rebuild & Score</span> to apply the new signals.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Enrich */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Step 2: Enrich with TMDb</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Fetch posters, genres, directors, cast, streaming info from TMDb. Runs in batches.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Batch size:</label>
            <input type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)}
              className="w-24 bg-film-dark border border-film-border rounded px-3 py-1.5 text-sm text-zinc-200" />
          </div>
          <button onClick={runEnrich} disabled={enriching}
            className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
            {enriching ? 'Enriching...' : 'Start Enrichment'}
          </button>
        </div>
        {enrichStatus && (
          <div className="mt-4 bg-film-dark border border-film-border rounded-lg p-4 text-sm">
            <div className="flex items-center gap-4 text-zinc-300">
              <p>Progress: <span className="text-gold-400">{enrichStatus.completed}/{enrichStatus.total}</span></p>
              {enrichStatus.errors > 0 && <p className="text-red-400">Errors: {enrichStatus.errors}</p>}
              {enrichStatus.running && (
                <div className="flex-1">
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-400 rounded-full transition-all"
                      style={{ width: `${(enrichStatus.completed / enrichStatus.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Build Profile */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Step 3: Build Taste Profile & Score Discovery</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Compute genre, director, and decade affinities from your ratings, then score the discovery pool.
        </p>
        <button onClick={rebuildAll}
          className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300">
          Rebuild & Score
        </button>
      </div>

      {/* Step 4: Daily Reminder */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Daily Movie Reminder</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Get a Windows notification at a time you choose reminding you to watch a film.
          CLAUDIUS will include today's suggestion in the notification.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Remind me at:</label>
            <input
              type="time"
              value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
              className="bg-film-dark border border-film-border rounded px-3 py-1.5 text-sm text-zinc-200"
            />
          </div>
          <button
            onClick={async () => {
              setReminderMsg(null);
              const result = await api.setupReminder(reminderTime);
              setReminderMsg(result);
              api.getReminderStatus().then(setReminderStatus);
            }}
            className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300"
          >
            {reminderStatus?.enabled ? 'Update Reminder' : 'Set Reminder'}
          </button>
          {reminderStatus?.enabled && (
            <button
              onClick={async () => {
                setReminderMsg(null);
                const result = await api.removeReminder();
                setReminderMsg(result);
                api.getReminderStatus().then(setReminderStatus);
              }}
              className="px-4 py-2.5 bg-film-dark border border-film-border rounded-lg text-sm text-zinc-400 hover:text-zinc-200"
            >
              Remove
            </button>
          )}
        </div>

        {reminderStatus?.enabled && (
          <div className="bg-film-dark border border-gold-400/20 rounded-lg p-3 text-sm text-zinc-300">
            Reminder active — notification at <span className="text-gold-400 font-medium">{reminderStatus.time}</span> daily
          </div>
        )}

        {reminderMsg && (
          <div className={`mt-3 text-sm ${reminderMsg.success ? 'text-emerald-400' : 'text-red-400'}`}>
            {reminderMsg.message || reminderMsg.error}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-film-dark border border-film-border rounded-lg p-5 text-sm text-zinc-500">
        <p>Recommended workflow: Import &rarr; Enrich (run multiple batches until all films are done) &rarr; Build Profile</p>
        <p className="mt-2">Enrichment runs at ~40 films per 10 seconds due to TMDb rate limits. For 4,500 films, expect ~20 minutes total.</p>
      </div>
    </div>
  );
}
