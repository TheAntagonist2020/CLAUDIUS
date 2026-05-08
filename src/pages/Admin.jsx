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
  const [streamingStatus, setStreamingStatus] = useState(null);
  const [streamingRefreshing, setStreamingRefreshing] = useState(false);
  const [streamingBatch, setStreamingBatch] = useState(200);
  const [streamingDays, setStreamingDays] = useState(30);

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

  // Poll streaming refresh status while running
  useEffect(() => {
    if (!streamingRefreshing) return;
    const interval = setInterval(async () => {
      const status = await api.getStreamingStatus();
      setStreamingStatus(status);
      if (!status.running) {
        setStreamingRefreshing(false);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [streamingRefreshing]);

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

  const runStreamingRefresh = async () => {
    setStreamingRefreshing(true);
    try {
      await api.refreshStreaming(streamingBatch, streamingDays);
    } catch (err) {
      setStreamingRefreshing(false);
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

      {/* Step 2b: Refresh Streaming */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <h2 className="font-display text-xl text-zinc-200 mb-2">Step 2b: Refresh Streaming Availability</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Re-fetch up-to-date streaming providers from TMDb for films whose availability data
          is older than the specified number of days. Run this periodically to keep
          "Where to Watch" information current.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Batch:</label>
            <input type="number" value={streamingBatch} onChange={e => setStreamingBatch(Number(e.target.value))}
              className="w-24 bg-film-dark border border-film-border rounded px-3 py-1.5 text-sm text-zinc-200" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Stale after:</label>
            <input type="number" value={streamingDays} onChange={e => setStreamingDays(Number(e.target.value))}
              className="w-20 bg-film-dark border border-film-border rounded px-3 py-1.5 text-sm text-zinc-200" />
            <span className="text-sm text-zinc-500">days</span>
          </div>
          <button onClick={runStreamingRefresh} disabled={streamingRefreshing}
            className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
            {streamingRefreshing ? 'Refreshing...' : 'Refresh Streaming'}
          </button>
        </div>
        {streamingStatus && (
          <div className="mt-4 bg-film-dark border border-film-border rounded-lg p-4 text-sm">
            <div className="flex items-center gap-4 text-zinc-300">
              <p>Progress: <span className="text-gold-400">{streamingStatus.completed}/{streamingStatus.total}</span></p>
              {streamingStatus.errors > 0 && <p className="text-red-400">Errors: {streamingStatus.errors}</p>}
              {!streamingStatus.running && streamingStatus.total > 0 && (
                <p className="text-emerald-400">Refresh complete.</p>
              )}
              {streamingStatus.running && (
                <div className="flex-1">
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gold-400 rounded-full transition-all"
                      style={{ width: `${(streamingStatus.completed / streamingStatus.total) * 100}%` }} />
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
        <p className="mt-2">Run <strong className="text-zinc-400">Refresh Streaming</strong> periodically (e.g. weekly) to keep "Where to Watch" data current. Streaming catalogs change frequently.</p>
      </div>
    </div>
  );
}
