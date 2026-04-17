import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import PushSettings from '../components/common/PushSettings';

export default function Admin() {
  const [importResult, setImportResult] = useState(null);
  const [enrichStatus, setEnrichStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [batchSize, setBatchSize] = useState(200);
  const [reminderTime, setReminderTime] = useState('19:00');
  const [reminderStatus, setReminderStatus] = useState(null);
  const [reminderMsg, setReminderMsg] = useState(null);

  // Trakt state
  const [traktAuth, setTraktAuth] = useState(null);
  const [traktSyncStatus, setTraktSyncStatus] = useState(null);
  const [traktConnecting, setTraktConnecting] = useState(false);
  const [traktDeviceCode, setTraktDeviceCode] = useState(null);
  const [traktSyncing, setTraktSyncing] = useState(false);
  const pollRef = useRef(null);

  // Load reminder status + Trakt status
  useEffect(() => {
    api.getReminderStatus().then(s => {
      setReminderStatus(s);
      if (s.time) setReminderTime(s.time);
    }).catch(() => {});
    api.getTraktAuthStatus().then(setTraktAuth).catch(() => {});
    api.getTraktSyncStatus().then(setTraktSyncStatus).catch(() => {});
  }, []);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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

  const startTraktConnect = async () => {
    setTraktConnecting(true);
    try {
      const data = await api.startTraktAuth();
      setTraktDeviceCode(data);

      // Poll every `interval` seconds until approved or expired
      const interval = (data.interval || 5) * 1000;
      pollRef.current = setInterval(async () => {
        try {
          const result = await api.pollTraktAuth(data.device_code);
          if (result.success) {
            clearInterval(pollRef.current);
            setTraktDeviceCode(null);
            setTraktConnecting(false);
            const auth = await api.getTraktAuthStatus();
            setTraktAuth(auth);
          }
        } catch {
          clearInterval(pollRef.current);
          setTraktDeviceCode(null);
          setTraktConnecting(false);
        }
      }, interval);
    } catch (err) {
      setTraktConnecting(false);
    }
  };

  const runTraktSync = async () => {
    setTraktSyncing(true);
    try {
      await api.runTraktSync();
      // Poll sync status until done
      const check = setInterval(async () => {
        const s = await api.getTraktSyncStatus();
        setTraktSyncStatus(s);
        if (!s.running) {
          setTraktSyncing(false);
          clearInterval(check);
        }
      }, 2000);
    } catch {
      setTraktSyncing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
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

      {/* Trakt Sync */}
      <div className="bg-film-card border border-film-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-xl text-zinc-200">Trakt Sync</h2>
          {traktAuth?.authenticated && (
            <span className="text-xs px-2 py-1 bg-emerald-900/40 text-emerald-400 border border-emerald-800 rounded-full">
              Connected as {traktAuth.username}
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          Sync your watched history, ratings, and watchlist directly from Trakt. Runs automatically every 6 hours.
        </p>

        {!traktAuth?.authenticated ? (
          <div>
            {!traktDeviceCode ? (
              <button onClick={startTraktConnect} disabled={traktConnecting}
                className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
                {traktConnecting ? 'Starting...' : 'Connect Trakt Account'}
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-film-dark border border-gold-400/30 rounded-lg p-4">
                  <p className="text-sm text-zinc-400 mb-2">
                    Go to <span className="text-gold-400 font-mono">{traktDeviceCode.verification_url}</span> and enter this code:
                  </p>
                  <p className="text-3xl font-mono font-bold text-gold-400 tracking-widest">
                    {traktDeviceCode.user_code}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">Waiting for approval… this page will update automatically.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={runTraktSync} disabled={traktSyncing}
              className="px-6 py-2.5 bg-gold-400 text-black font-medium rounded-lg hover:bg-gold-300 disabled:opacity-50">
              {traktSyncing ? 'Syncing…' : 'Sync Now'}
            </button>

            {traktSyncStatus?.last_log && (
              <div className="bg-film-dark border border-film-border rounded-lg p-4 text-sm">
                {traktSyncStatus.last_log.status === 'error' ? (
                  <p className="text-red-400">Last sync failed: {traktSyncStatus.last_log.error_message}</p>
                ) : (
                  <div className="space-y-1 text-zinc-300">
                    <p className="text-zinc-500 text-xs mb-2">Last synced: {new Date(traktSyncStatus.last_log.synced_at).toLocaleString()}</p>
                    <p>Watched: <span className="text-gold-400 font-medium">{traktSyncStatus.last_log.watched_count}</span></p>
                    <p>Ratings: <span className="text-gold-400 font-medium">{traktSyncStatus.last_log.ratings_count}</span></p>
                    <p>Watchlist: <span className="text-gold-400 font-medium">{traktSyncStatus.last_log.watchlist_count}</span></p>
                  </div>
                )}
              </div>
            )}

            {traktSyncStatus?.error && (
              <p className="text-sm text-red-400">{traktSyncStatus.error}</p>
            )}
          </div>
        )}
      </div>

      <PushSettings />

      {/* Info */}
      <div className="bg-film-dark border border-film-border rounded-lg p-5 text-sm text-zinc-500">
        <p>Recommended workflow: Import &rarr; Enrich (run multiple batches until all films are done) &rarr; Build Profile</p>
        <p className="mt-2">Enrichment runs at ~40 films per 10 seconds due to TMDb rate limits. For 4,500 films, expect ~20 minutes total.</p>
      </div>
    </div>
  );
}
