import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Admin() {
  const [importResult, setImportResult] = useState(null);
  const [traktResult, setTraktResult] = useState(null);
  const [seedResult, setSeedResult] = useState(null);
  const [enrichStatus, setEnrichStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importingTrakt, setImportingTrakt] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [traktPath, setTraktPath] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [batchSize, setBatchSize] = useState(200);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [reminderStatus, setReminderStatus] = useState(null);
  const [reminderMsg, setReminderMsg] = useState(null);

  // Load reminder status
  useEffect(() => {
    api.getReminderStatus().then(s => {
      setReminderStatus(s);
      if (s.time) setReminderTime(s.time);
    }).catch(() => {});
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

  const runTraktImport = async () => {
    setImportingTrakt(true);
    setTraktResult(null);
    try {
      const result = await api.runImportTrakt(traktPath || null);
      setTraktResult(result);
    } catch (err) {
      setTraktResult({ error: err.message });
    }
    setImportingTrakt(false);
  };

  const runSeedDemo = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await api.runSeed();
      setSeedResult(result);
    } catch (err) {
      setSeedResult({ error: err.message });
    }
    setSeeding(false);
  };

  const runEnrich = async () => {
    setEnriching(true);
    try {
      await api.runEnrich(batchSize);
    } catch (err) {
      setEnriching(false);
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

      {/* Step 1a: Trakt export */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Step 1: Import from Trakt export</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Drop your <code className="text-gold-400">trakt-export-*.zip</code> into the <code className="text-gold-400">data/</code>{' '}
          folder (or unzip into <code className="text-gold-400">data/trakt/</code>) and click Import.
          Optionally specify an absolute path below.
        </p>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            placeholder="(optional) absolute path to zip or folder"
            value={traktPath}
            onChange={e => setTraktPath(e.target.value)}
            className="flex-1 bg-film-dark border border-film-border rounded px-3 py-1.5 text-sm text-zinc-200"
          />
          <button onClick={runTraktImport} disabled={importingTrakt}
            className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
            {importingTrakt ? 'Importing...' : 'Import Trakt'}
          </button>
        </div>
        {traktResult && (
          <div className="mt-2 bg-film-dark border border-film-border rounded-lg p-4 text-sm">
            {traktResult.error ? (
              <p className="text-red-400">{traktResult.error}</p>
            ) : (
              <div className="space-y-1 text-zinc-300">
                <p>Watches: <span className="text-gold-400 font-medium">{traktResult.watched}</span></p>
                <p>Ratings: <span className="text-gold-400 font-medium">{traktResult.ratings}</span></p>
                <p>Watchlist: <span className="text-gold-400 font-medium">{traktResult.watchlist}</span></p>
                {traktResult.unmatched > 0 && <p className="text-zinc-500">Unmatched entries skipped: {traktResult.unmatched}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seed demo data */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Or: load demo data</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Populates ~40 iconic watched films, 30 discovery candidates, and a watchlist so you can
          explore CLAUDIUS immediately. Safe to run alongside your own data — duplicates are ignored.
        </p>
        <button onClick={runSeedDemo} disabled={seeding}
          className="px-6 py-2.5 bg-film-dark border border-gold-400/40 text-gold-400 font-medium rounded-lg hover:bg-gold-400/10 disabled:opacity-50">
          {seeding ? 'Seeding...' : 'Load Demo Data'}
        </button>
        {seedResult && (
          <div className="mt-4 text-sm text-zinc-400">
            {seedResult.error ? (
              <span className="text-red-400">{seedResult.error}</span>
            ) : (
              `Seeded ${seedResult.watched} watched, ${seedResult.discovery} discovery, ${seedResult.watchlist} watchlist.`
            )}
          </div>
        )}
      </div>

      {/* Step 1b: Legacy CSV import */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Advanced: Import from CSVs</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Legacy pipeline. Expects <code className="text-gold-400">watched.csv</code>,{' '}
          <code className="text-gold-400">super-list.csv</code>, and optional gap lists in the{' '}
          <code className="text-gold-400">data/</code> directory.
        </p>
        <button onClick={runImport} disabled={importing}
          className="px-6 py-2.5 bg-film-dark border border-film-border text-zinc-300 font-medium rounded-lg hover:border-zinc-500 disabled:opacity-50">
          {importing ? 'Importing...' : 'Run CSV Import'}
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
          Save a preferred time for your daily pick. On Windows, a scheduled toast notification will
          fire automatically. On Mac/Linux, the time is stored and you can hit{' '}
          <code className="text-gold-400">/api/reminder/daily</code> from cron/launchd.
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
