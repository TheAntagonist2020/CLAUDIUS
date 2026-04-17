import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w300';

// "Just put something on" — one click, one pick, Stremio deep-link ready.
export default function PutItOn() {
  const [pick, setPick] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('auto');

  const fetchPick = async (m = mode) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/put-it-on?mode=${m}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPick(data);
    } catch (err) {
      setPick({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const reroll = () => fetchPick(mode);
  const swap = (next) => { setMode(next); fetchPick(next); };

  if (!pick && !loading) {
    return (
      <div className="bg-gradient-to-br from-gold-400/10 to-gold-600/5 border border-gold-400/30 rounded-xl p-6 sm:p-8 text-center">
        <p className="text-xs text-gold-400 uppercase tracking-widest font-medium mb-2">Right now</p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-zinc-100 mb-3">
          Put something on.
        </h2>
        <p className="text-sm text-zinc-400 mb-5 max-w-md mx-auto">
          One click. I'll pick based on the time of day — comfort rewatch if it's late, discovery if you're ready for it.
        </p>
        <button onClick={() => fetchPick('auto')}
          className="px-6 py-3 bg-gold-400 text-black font-semibold rounded-lg hover:bg-gold-300 transition-colors">
          Pick a film
        </button>
      </div>
    );
  }

  if (loading && !pick) {
    return (
      <div className="bg-film-card border border-film-border rounded-xl p-6 text-sm text-zinc-500">
        Thinking…
      </div>
    );
  }

  if (pick?.error) {
    return (
      <div className="bg-film-card border border-red-500/30 rounded-xl p-6">
        <p className="text-sm text-red-400">Couldn't get a pick: {pick.error}</p>
        <button onClick={reroll} className="mt-3 text-xs text-zinc-400 underline">Try again</button>
      </div>
    );
  }

  const f = pick.film;

  return (
    <div className="bg-gradient-to-br from-gold-400/10 to-film-card border border-gold-400/30 rounded-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
        <div className="shrink-0 w-full sm:w-32">
          {f.poster_path ? (
            <img src={f.poster_path.startsWith('/') ? `${TMDB_IMG}${f.poster_path}` : f.poster_path}
              alt={f.title} className="w-full rounded-lg shadow-lg" />
          ) : (
            <div className="w-full aspect-[2/3] bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-2xl">F</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] text-gold-400 uppercase tracking-widest font-medium">
              {pick.slot_label}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              pick.pick_type === 'comfort'
                ? 'bg-gold-400/10 text-gold-400'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {pick.pick_type === 'comfort' ? 'Comfort rewatch' : 'New to you'}
            </span>
          </div>

          <h3 className="font-display text-xl sm:text-2xl font-bold text-zinc-100 leading-tight">
            {f.id ? <Link to={`/film/${f.id}`} className="hover:text-gold-300">{f.title}</Link> : f.title}
            <span className="text-zinc-500 font-normal text-base ml-2">({f.year})</span>
          </h3>

          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
            {f.runtime && <span>{f.runtime} min</span>}
            {f.genres && <span className="truncate">{f.genres.split(',').slice(0, 2).join(' · ')}</span>}
            {f.rating != null && <span className="text-gold-400 font-medium">You: {f.rating}/10</span>}
            {f.taste_score != null && <span className="text-emerald-400 font-medium">Match: {Math.round(f.taste_score)}%</span>}
          </div>

          <p className="text-sm text-zinc-400 mt-3 italic">{pick.rationale}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {pick.stremio_url && (
              <a href={pick.stremio_url}
                className="px-4 py-2 bg-gold-400 text-black text-sm font-semibold rounded-lg hover:bg-gold-300 transition-colors">
                Play on Stremio →
              </a>
            )}
            <button onClick={reroll} disabled={loading}
              className="px-3 py-2 text-sm text-zinc-300 border border-film-border rounded-lg hover:border-zinc-500 disabled:opacity-50">
              {loading ? '...' : 'Another'}
            </button>
            <button onClick={() => swap(mode === 'discovery' ? 'comfort' : 'discovery')}
              className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">
              {mode === 'discovery' ? 'Give me a comfort rewatch' : 'Give me something new'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
