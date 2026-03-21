import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const SLOT_LABELS = {
  morning: 'MORNING SESSION',
  afternoon: 'AFTERNOON SESSION',
  evening: 'EVENING SESSION',
  bonus: 'BONUS ROUND',
};

const STATUS_COLORS = {
  assigned: 'text-gold-400',
  watching: 'text-green-400',
  completed: 'text-green-500',
  skipped: 'text-zinc-500',
  deferred: 'text-yellow-500',
};

export default function MissionControl() {
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [showRating, setShowRating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, q, s] = await Promise.all([
        api.getQueueCurrent(),
        api.getQueueToday(),
        api.getQueueStats(),
      ]);
      setCurrent(c);
      setQueue(q);
      setStats(s);
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleBuild = async () => {
    setBuilding(true);
    try {
      await api.buildQueue({ force: true });
      await refresh();
    } catch (err) {
      console.error('Build failed:', err);
    } finally {
      setBuilding(false);
    }
  };

  const handleStart = async (id) => {
    await api.startQueue(id);
    await refresh();
  };

  const handleComplete = async (id) => {
    await api.completeQueue(id, { rating: rating || null });
    setRating(0);
    setShowRating(false);
    await refresh();
  };

  const handleSkip = async (id) => {
    await api.skipQueue(id);
    await refresh();
  };

  const handleDefer = async (id) => {
    await api.deferQueue(id);
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-lg">Loading mission...</p>
      </div>
    );
  }

  // No queue built yet
  if (!queue || queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <h1 className="font-display text-4xl text-gold-400">MISSION CONTROL</h1>
        <p className="text-zinc-400 text-lg">No films assigned for today.</p>
        <button
          onClick={handleBuild}
          disabled={building}
          className="px-8 py-4 bg-gold-400 text-film-black font-bold text-lg rounded-lg hover:bg-gold-300 transition-colors disabled:opacity-50"
        >
          {building ? 'Building Queue...' : 'BUILD TODAY\'S QUEUE'}
        </button>
      </div>
    );
  }

  const completedToday = queue.filter(q => q.status === 'completed').length;
  const totalToday = queue.length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl text-gold-400">MISSION CONTROL</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {stats && stats.current_streak > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-gold-400">{stats.current_streak}</p>
              <p className="text-xs text-zinc-500">DAY STREAK</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-2xl font-bold text-green-400">{completedToday}/{totalToday}</p>
            <p className="text-xs text-zinc-500">TODAY</p>
          </div>
        </div>
      </div>

      {/* Current Assignment — THE BIG ONE */}
      {current && current.state !== 'all_done' && (
        <div className="mb-8 bg-film-card border-2 border-gold-400/30 rounded-xl overflow-hidden">
          <div className="bg-gold-400/10 px-6 py-3 border-b border-gold-400/20">
            <p className="text-gold-400 font-bold text-sm tracking-widest">
              {current.state === 'in_progress' ? 'NOW WATCHING' : 'WATCH THIS NOW'}
            </p>
          </div>

          <div className="p-6">
            <div className="flex gap-6">
              {/* Poster */}
              {current.poster_path && (
                <div className="shrink-0">
                  <img
                    src={`https://image.tmdb.org/t/p/w300${current.poster_path}`}
                    alt={current.title}
                    className="w-40 rounded-lg shadow-lg"
                  />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-500 mb-1 tracking-wider">
                  {SLOT_LABELS[current.slot] || current.slot?.toUpperCase()}
                </p>
                <h2 className="font-display text-4xl text-white mb-2">{current.title}</h2>
                <p className="text-zinc-400 text-lg mb-3">{current.year}</p>

                {current.genres && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {current.genres.split(',').map(g => (
                      <span key={g} className="px-2 py-0.5 bg-film-border rounded text-xs text-zinc-400">
                        {g.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {current.runtime && (
                  <p className="text-zinc-500 text-sm mb-2">{current.runtime} min</p>
                )}

                {current.reason && (
                  <p className="text-zinc-500 text-sm italic mb-4">{current.reason}</p>
                )}

                {current.streaming_on && (
                  <p className="text-green-400 text-sm mb-4">
                    Streaming on: {current.streaming_on}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  {current.status === 'assigned' && (
                    <button
                      onClick={() => handleStart(current.id)}
                      className="px-6 py-3 bg-gold-400 text-film-black font-bold rounded-lg hover:bg-gold-300 transition-colors text-lg"
                    >
                      START WATCHING
                    </button>
                  )}

                  {current.status === 'watching' && !showRating && (
                    <button
                      onClick={() => setShowRating(true)}
                      className="px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-400 transition-colors text-lg"
                    >
                      FINISHED
                    </button>
                  )}

                  {showRating && (
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <button
                            key={n}
                            onClick={() => setRating(n)}
                            className={`w-8 h-8 rounded text-sm font-bold transition-colors ${
                              rating >= n ? 'bg-gold-400 text-film-black' : 'bg-film-border text-zinc-500 hover:bg-zinc-600'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleComplete(current.id)}
                        className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-400 transition-colors"
                      >
                        LOG IT
                      </button>
                    </div>
                  )}

                  {current.status === 'assigned' && (
                    <>
                      <button
                        onClick={() => handleSkip(current.id)}
                        className="px-4 py-3 bg-film-border text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => handleDefer(current.id)}
                        className="px-4 py-3 bg-film-border text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        Tomorrow
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Done State */}
      {current && current.state === 'all_done' && (
        <div className="mb-8 bg-film-card border-2 border-green-500/30 rounded-xl p-8 text-center">
          <h2 className="font-display text-3xl text-green-400 mb-2">ALL FILMS COMPLETED</h2>
          <p className="text-zinc-400 text-lg">
            {current.completed_count} {current.completed_count === 1 ? 'film' : 'films'} watched today.
          </p>
          {stats && stats.current_streak > 1 && (
            <p className="text-gold-400 mt-2">{stats.current_streak}-day streak. Keep it going.</p>
          )}
        </div>
      )}

      {/* Today's Full Queue */}
      <div className="mb-8">
        <h3 className="text-zinc-400 text-sm font-bold tracking-wider mb-4">TODAY'S LINEUP</h3>
        <div className="space-y-2">
          {queue.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-4 p-4 rounded-lg transition-colors ${
                item.status === 'watching' ? 'bg-gold-400/10 border border-gold-400/20' :
                item.status === 'completed' ? 'bg-green-500/5 border border-green-500/10' :
                'bg-film-card border border-film-border'
              }`}
            >
              <div className="shrink-0 w-16 text-center">
                <p className="text-xs text-zinc-500 tracking-wider">
                  {item.slot?.toUpperCase()}
                </p>
              </div>

              {item.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                  alt=""
                  className="w-10 h-14 rounded object-cover shrink-0"
                />
              )}

              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${
                  item.status === 'completed' ? 'text-zinc-500 line-through' : 'text-white'
                }`}>
                  {item.title} <span className="text-zinc-500">({item.year})</span>
                </p>
                {item.runtime && (
                  <p className="text-xs text-zinc-600">{item.runtime} min</p>
                )}
              </div>

              <div className="shrink-0">
                <span className={`text-xs font-bold tracking-wider ${STATUS_COLORS[item.status]}`}>
                  {item.status === 'watching' ? 'WATCHING' :
                   item.status === 'completed' ? `DONE${item.rating ? ` (${item.rating}/10)` : ''}` :
                   item.status === 'skipped' ? 'SKIPPED' :
                   item.status === 'deferred' ? 'DEFERRED' :
                   'QUEUED'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Letterboxd Export */}
      <div className="flex items-center gap-4 mb-8">
        <a
          href="/api/queue/letterboxd/diary"
          className="px-4 py-2 bg-film-card border border-film-border rounded-lg text-zinc-400 text-sm hover:text-white hover:border-zinc-500 transition-colors"
        >
          Export to Letterboxd (Diary CSV)
        </a>
        <button
          onClick={handleBuild}
          disabled={building}
          className="px-4 py-2 bg-film-card border border-film-border rounded-lg text-zinc-400 text-sm hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
        >
          {building ? 'Rebuilding...' : 'Rebuild Queue'}
        </button>
      </div>

      {/* Stats Strip */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="STREAK" value={`${stats.current_streak}d`} />
          <StatCard label="COMPLETION" value={`${stats.completion_rate}%`} />
          <StatCard label="TOTAL WATCHED" value={stats.total_completed} />
          <StatCard label="TOTAL ASSIGNED" value={stats.total_assigned} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-film-card border border-film-border rounded-lg p-4 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-500 tracking-wider mt-1">{label}</p>
    </div>
  );
}
