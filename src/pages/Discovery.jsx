import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const GENRES = ['action', 'comedy', 'crime', 'drama', 'horror', 'mystery', 'romance', 'science fiction', 'thriller', 'war', 'animation', 'documentary', 'fantasy', 'western'];
const DECADES = ['2020', '2010', '2000', '1990', '1980', '1970', '1960', '1950'];

export default function Discovery() {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState('');
  const [decade, setDecade] = useState('');
  const [stats, setStats] = useState(null);

  const fetchRecs = async () => {
    setLoading(true);
    try {
      const params = { count: 30 };
      if (genre) params.genre = genre;
      if (decade) params.decade = decade;
      const data = await api.getRecommendations(params);
      setRecs(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchRecs(); }, [genre, decade]);
  useEffect(() => { api.getDiscoveryStats().then(setStats); }, []);

  const dismiss = async (id) => {
    await api.dismissRecommendation(id);
    setRecs(recs.filter(r => r.id !== id));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-zinc-100">Discovery</h1>
          <p className="text-zinc-500 mt-1">
            {stats ? `${stats.total.toLocaleString()} films in your discovery pool` : 'Loading...'}
          </p>
        </div>
        <button onClick={async () => {
          await api.scoreDiscovery();
          fetchRecs();
        }} className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-300">
          Re-Score Pool
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={genre} onChange={e => setGenre(e.target.value)}
          className="bg-film-card border border-film-border rounded-lg px-3 py-2 text-sm text-zinc-300">
          <option value="">All Genres</option>
          {GENRES.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
        </select>
        <select value={decade} onChange={e => setDecade(e.target.value)}
          className="bg-film-card border border-film-border rounded-lg px-3 py-2 text-sm text-zinc-300">
          <option value="">All Decades</option>
          {DECADES.map(d => <option key={d} value={d}>{d}s</option>)}
        </select>
      </div>

      {/* Recommendations */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : recs.length === 0 ? (
        <div className="bg-film-card border border-film-border rounded-lg p-8 text-center">
          <p className="text-zinc-400">No recommendations yet. Score the discovery pool first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((rec, i) => (
            <div key={rec.id} className="bg-film-card border border-film-border rounded-lg p-5 hover:border-gold-400/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-10 h-10 bg-gold-400/10 border border-gold-400/30 rounded-full flex items-center justify-center">
                    <span className="text-gold-400 text-sm font-bold">{Math.round(rec.taste_score)}</span>
                  </div>
                  <div>
                    <h3 className="text-lg text-zinc-100 font-medium">
                      {rec.title} <span className="text-zinc-500 text-sm">({rec.year})</span>
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      {rec.genres && <span>{rec.genres}</span>}
                      {rec.runtime && <span>{rec.runtime} min</span>}
                      {rec.language && <span className="uppercase">{rec.language}</span>}
                    </div>
                    {/* Rationale */}
                    {rec.taste_rationale?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {rec.taste_rationale.map((reason, j) => (
                          <li key={j} className="text-sm text-gold-400/80 flex items-center gap-2">
                            <span className="text-gold-400">*</span> {reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Ratings */}
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      {rec.imdb_rating > 0 && <span className="text-zinc-400">IMDb: {rec.imdb_rating}</span>}
                      {rec.rt_tomatometer > 0 && <span className="text-zinc-400">RT: {rec.rt_tomatometer}%</span>}
                      {rec.metascore > 0 && <span className="text-zinc-400">Meta: {rec.metascore}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => dismiss(rec.id)}
                    className="px-3 py-1.5 bg-film-dark border border-film-border rounded text-xs text-zinc-500 hover:text-zinc-300">
                    Dismiss
                  </button>
                  <button onClick={async () => {
                    await api.addToWatchlist({ title: rec.title, year: rec.year, tmdb_id: rec.tmdb_id, category: 'to_watch' });
                  }} className="px-3 py-1.5 bg-gold-400/10 border border-gold-400/30 rounded text-xs text-gold-400 hover:bg-gold-400/20">
                    + Watchlist
                  </button>
                  {rec.imdb_id && (
                    <button onClick={async (e) => {
                      const btn = e.currentTarget;
                      btn.textContent = 'Sending...';
                      try {
                        await api.sendToStremio({ imdb_id: rec.imdb_id });
                        btn.textContent = 'Sent!';
                        btn.classList.add('opacity-50');
                      } catch { btn.textContent = 'Failed'; }
                    }} className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded text-xs text-emerald-400 hover:bg-emerald-500/25">
                      Stremio
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
