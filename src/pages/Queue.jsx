import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w1280';

const SLOT_LABELS = {
  morning: 'FILM ONE',
  afternoon: 'FILM TWO',
  evening: 'FILM THREE',
  bonus: 'BONUS',
};

const SLOT_TIMES = {
  morning: 'Morning Session',
  afternoon: 'Afternoon Session',
  evening: 'Evening Session',
  bonus: 'Bonus Round',
};

export default function Queue() {
  const [queue, setQueue] = useState(null);
  const [current, setCurrent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [allDone, setAllDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [stremioStatus, setStremioStatus] = useState(null);

  const loadQueue = useCallback(async () => {
    try {
      const data = await api.getQueueToday();
      setQueue(data.queue);
      setCurrent(data.current);
      setProgress(data.progress);
      setAllDone(!data.current && data.progress.completed > 0);
      setStremioStatus(null);
    } catch (err) {
      console.error('Queue load error:', err);
    }
    setLoading(false);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getQueueStats();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadQueue();
    loadStats();
  }, [loadQueue, loadStats]);

  const handleStart = async () => {
    if (!current) return;
    setActionLoading(true);
    try {
      await api.startQueueFilm(current.id);
      await loadQueue();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
  };

  const handleComplete = async () => {
    if (!current) return;
    setActionLoading(true);
    try {
      await api.completeQueueFilm(current.id);
      await loadQueue();
      await loadStats();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
  };

  const handleSkip = async () => {
    if (!current) return;
    setActionLoading(true);
    try {
      await api.skipQueueFilm(current.id);
      await loadQueue();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
  };

  const handleBonus = async () => {
    setActionLoading(true);
    try {
      await api.addBonusFilm();
      await loadQueue();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(false);
  };

  const handleSendToStremio = async () => {
    if (!current?.imdb_id) return;
    setStremioStatus('sending');
    try {
      await api.sendToStremio({ imdb_id: current.imdb_id });
      setStremioStatus('sent');
    } catch {
      setStremioStatus('failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
      </div>
    );
  }

  // ALL DONE state
  if (allDone || (!current && progress?.completed > 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <div className="text-6xl mb-6">
            {progress.completed >= 3 ? '🔥' : progress.completed >= 2 ? '💪' : '✓'}
          </div>
          <h1 className="font-display text-4xl font-bold text-gold-400 mb-3">Done.</h1>
          <p className="text-zinc-400 text-lg mb-2">
            {progress.completed} film{progress.completed > 1 ? 's' : ''} today.
          </p>
          {stats?.streak > 1 && (
            <p className="text-gold-400/70 text-sm mb-8">{stats.streak}-day streak</p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleBonus}
              disabled={actionLoading}
              className="px-6 py-3 bg-gold-400/10 border border-gold-400/30 rounded-xl text-gold-400 font-medium hover:bg-gold-400/20 transition-all"
            >
              One More
            </button>
          </div>

          {/* Today's completed films */}
          {queue && queue.filter(q => q.status === 'completed').length > 0 && (
            <div className="mt-12 w-full">
              <h3 className="text-xs text-zinc-600 uppercase tracking-widest mb-4">Today</h3>
              <div className="space-y-2">
                {queue.filter(q => q.status === 'completed').map(q => (
                  <div key={q.id} className="flex items-center gap-3 bg-film-card/50 rounded-lg px-4 py-3">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-zinc-300 text-sm">{q.title}</span>
                    <span className="text-zinc-600 text-xs">({q.year})</span>
                    {q.runtime && <span className="text-zinc-700 text-xs ml-auto">{q.runtime}m</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats bar */}
          {stats && (
            <div className="mt-8 flex justify-center gap-8 text-center">
              <div>
                <div className="text-2xl font-bold text-zinc-200">{stats.thisWeek}</div>
                <div className="text-xs text-zinc-600">This Week</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-zinc-200">{stats.totalCompleted}</div>
                <div className="text-xs text-zinc-600">All Time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gold-400">{stats.streak}</div>
                <div className="text-xs text-zinc-600">Streak</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // NO QUEUE state
  if (!current && (!progress || progress.total === 0)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center max-w-lg">
          <h1 className="font-display text-3xl font-bold text-zinc-300 mb-3">No Queue Yet</h1>
          <p className="text-zinc-500 mb-6">
            Run an import and enrich your discovery pool first, then come back here.
          </p>
        </div>
      </div>
    );
  }

  // CURRENT ASSIGNMENT — the main view
  const film = current;
  const isWatching = film.status === 'watching';
  const posterUrl = film.poster_path
    ? (film.poster_path.startsWith('/') ? `${TMDB_IMG}${film.poster_path}` : film.poster_path)
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar across top */}
      <div className="h-1 bg-film-dark">
        <div
          className="h-full bg-gold-400 transition-all duration-500"
          style={{ width: `${progress?.pct || 0}%` }}
        />
      </div>

      {/* Slot indicator + stats */}
      <div className="flex items-center justify-between px-4 sm:px-8 py-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold tracking-widest text-gold-400 uppercase">
            {SLOT_LABELS[film.slot] || film.slot}
          </span>
          <span className="text-xs text-zinc-600">{SLOT_TIMES[film.slot]}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-600">
          {progress && (
            <span>{progress.completed}/{progress.total} done</span>
          )}
          {stats?.streak > 0 && (
            <span className="text-gold-400/60">{stats.streak}d streak</span>
          )}
        </div>
      </div>

      {/* The Assignment */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 pb-8">
        <div className="w-full max-w-2xl">
          {/* Poster */}
          <div className="flex justify-center mb-8">
            {posterUrl ? (
              <img
                src={posterUrl}
                alt={film.title}
                className="w-48 sm:w-56 rounded-2xl shadow-2xl shadow-black/50"
              />
            ) : (
              <div className="w-48 sm:w-56 aspect-[2/3] bg-film-card rounded-2xl flex items-center justify-center text-zinc-700 text-5xl font-display">
                {film.title[0]}
              </div>
            )}
          </div>

          {/* Title block */}
          <div className="text-center mb-6">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-zinc-100 leading-tight mb-2">
              {film.title}
            </h1>
            <div className="flex items-center justify-center gap-3 text-sm text-zinc-500">
              <span>{film.year}</span>
              {film.runtime && <span>{film.runtime} min</span>}
              {film.directors && <span>{film.directors}</span>}
            </div>
          </div>

          {/* Genres */}
          {film.genres && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-6">
              {film.genres.split(',').map((g, i) => (
                <span key={i} className="text-xs px-2.5 py-1 bg-film-card rounded-full text-zinc-500 border border-film-border">
                  {g.trim()}
                </span>
              ))}
            </div>
          )}

          {/* Why this film */}
          {film.rationale && (
            <p className="text-center text-sm italic text-gold-400/70 mb-8">
              "{film.rationale}"
            </p>
          )}

          {/* Scores */}
          <div className="flex justify-center gap-6 mb-10 text-xs text-zinc-600">
            {film.taste_score && (
              <span>Taste: <span className="text-zinc-400">{Math.round(film.taste_score)}</span></span>
            )}
            {film.source && (
              <span className={`px-2 py-0.5 rounded-full ${
                film.source === 'rewatch'
                  ? 'bg-gold-400/10 text-gold-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {film.source === 'rewatch' ? 'Revisit' : 'New'}
              </span>
            )}
          </div>

          {/* ACTION BUTTONS — the whole point */}
          <div className="flex flex-col items-center gap-3">
            {!isWatching ? (
              /* Not started yet — big GO button */
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="w-full max-w-xs py-4 bg-gold-400 text-black font-bold text-lg rounded-2xl hover:bg-gold-300 transition-all active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? 'Loading...' : 'Watch This'}
              </button>
            ) : (
              /* Currently watching — Done button */
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="w-full max-w-xs py-4 bg-emerald-500 text-black font-bold text-lg rounded-2xl hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? 'Loading...' : 'Done — Next'}
              </button>
            )}

            {/* Stremio button */}
            {film.imdb_id && (
              <button
                onClick={handleSendToStremio}
                disabled={stremioStatus === 'sent'}
                className={`w-full max-w-xs py-3 rounded-xl text-sm font-medium transition-all ${
                  stremioStatus === 'sent'
                    ? 'bg-emerald-500/10 text-emerald-400/50'
                    : stremioStatus === 'sending'
                    ? 'bg-emerald-500/10 text-emerald-400/70'
                    : stremioStatus === 'failed'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-film-card border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {stremioStatus === 'sent' ? 'Sent to Stremio' :
                 stremioStatus === 'sending' ? 'Sending...' :
                 stremioStatus === 'failed' ? 'Failed — Retry' :
                 'Send to Stremio'}
              </button>
            )}

            {/* Skip */}
            <button
              onClick={handleSkip}
              disabled={actionLoading}
              className="mt-2 text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
            >
              Skip this one
            </button>
          </div>
        </div>
      </div>

      {/* Queue overview at bottom */}
      {queue && queue.length > 1 && (
        <div className="border-t border-film-border bg-film-dark/50 px-4 sm:px-8 py-4">
          <div className="flex items-center gap-4 overflow-x-auto max-w-2xl mx-auto">
            {queue.map((q, i) => {
              const isCurrent = current && q.id === current.id;
              return (
                <div
                  key={q.id}
                  className={`flex items-center gap-2 shrink-0 px-3 py-2 rounded-lg text-xs transition-all ${
                    q.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : q.status === 'skipped'
                      ? 'bg-zinc-800/50 text-zinc-700 line-through'
                      : isCurrent
                      ? 'bg-gold-400/10 text-gold-400 border border-gold-400/30'
                      : 'bg-film-card text-zinc-600'
                  }`}
                >
                  {q.status === 'completed' ? '✓' : q.status === 'skipped' ? '—' : (i + 1)}
                  <span className="truncate max-w-[120px]">{q.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
