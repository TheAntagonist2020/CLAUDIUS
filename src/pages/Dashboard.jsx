import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { api } from '../lib/api';
import PutItOn from '../components/common/PutItOn';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w200';
const TMDB_IMG_LG = 'https://image.tmdb.org/t/p/w500';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [dailyPick, setDailyPick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stremioStatus, setStremioStatus] = useState(null);

  useEffect(() => {
    api.getOverview().then(setData).catch(console.error).finally(() => setLoading(false));
    api.getDailyPick().then(setDailyPick).catch(() => {});
  }, []);

  const sendToStremio = async () => {
    if (!dailyPick?.imdb_id) return;
    setStremioStatus('sending');
    try {
      await api.sendToStremio({ imdb_id: dailyPick.imdb_id });
      setStremioStatus('sent');
    } catch {
      setStremioStatus('failed');
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (!data) return <div className="p-8 text-zinc-500">No data yet. Go to Admin to import your films.</div>;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-zinc-100">Welcome back</h1>
        <p className="text-zinc-500 mt-1">Your film intelligence at a glance</p>
      </div>

      <PutItOn />

      {/* Daily Pick */}
      {dailyPick && (
        <div className="bg-film-card border border-gold-400/20 rounded-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
            {/* Poster */}
            <div className="shrink-0 w-full sm:w-28 flex sm:block gap-4">
              <div className="w-24 sm:w-full shrink-0">
                {dailyPick.poster_path ? (
                  <img
                    src={dailyPick.poster_path.startsWith('/') ? `${TMDB_IMG_LG}${dailyPick.poster_path}` : dailyPick.poster_path}
                    alt={dailyPick.title}
                    className="w-full rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-2xl">F</div>
                )}
              </div>
              {/* Title visible next to poster on smallest screens */}
              <div className="flex-1 sm:hidden pt-1">
                <span className="text-xs text-gold-400 uppercase tracking-widest font-medium">Today's Suggestion</span>
                <h2 className="font-display text-xl font-bold text-zinc-100 mt-1 leading-tight">
                  {dailyPick.title} <span className="text-zinc-500 text-base font-normal">({dailyPick.year})</span>
                </h2>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="hidden sm:inline text-xs text-gold-400 uppercase tracking-widest font-medium">Today's Suggestion</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  dailyPick.pick_type === 'rewatch'
                    ? 'bg-gold-400/10 text-gold-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {dailyPick.pick_type === 'rewatch' ? 'Revisit' : 'Discover'}
                </span>
              </div>

              <h2 className="hidden sm:block font-display text-2xl font-bold text-zinc-100">
                {dailyPick.title} <span className="text-zinc-500 text-lg font-normal">({dailyPick.year})</span>
              </h2>

              <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
                {dailyPick.runtime && <span>{dailyPick.runtime} min</span>}
                {dailyPick.genres && <span>{typeof dailyPick.genres === 'string' ? dailyPick.genres : ''}</span>}
                {dailyPick.directors && <span>{dailyPick.directors}</span>}
              </div>

              <p className="mt-3 text-sm italic text-gold-400/80">"{dailyPick.rationale}"</p>

              <div className="flex items-center gap-3 mt-3 text-xs text-zinc-500">
                {dailyPick.rating && <span className="text-gold-400 font-bold">Your rating: {dailyPick.rating}/10</span>}
                {dailyPick.taste_score && <span>Taste match: {Math.round(dailyPick.taste_score)}</span>}
                {dailyPick.imdb_rating > 0 && <span>IMDb: {dailyPick.imdb_rating}</span>}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Link
                  to="/tonight"
                  className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-300 transition-colors"
                >
                  Plan Tonight
                </Link>
                {dailyPick.imdb_id && (
                  <button
                    onClick={sendToStremio}
                    disabled={stremioStatus === 'sent'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      stremioStatus === 'sent'
                        ? 'bg-emerald-500/10 text-emerald-400/50'
                        : stremioStatus === 'sending'
                        ? 'bg-emerald-500/10 text-emerald-400/70'
                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                    }`}
                  >
                    {stremioStatus === 'sent' ? 'Sent to Stremio' :
                     stremioStatus === 'sending' ? 'Sending...' :
                     'Send to Stremio'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Films Watched" value={data.totalWatched.toLocaleString()} />
        <StatCard label="Films Rated" value={data.totalRated.toLocaleString()} />
        <StatCard label="Average Rating" value={data.avgRating?.toFixed(1)} accent />
        <StatCard label="Hours Watched" value={Math.round(data.totalHours).toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rating Distribution */}
        <div className="bg-film-card border border-film-border rounded-lg p-5">
          <h2 className="font-display text-lg text-zinc-200 mb-4">Rating Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.ratingDist}>
              <XAxis dataKey="rating" stroke="#52525b" fontSize={12} />
              <YAxis stroke="#52525b" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                labelStyle={{ color: '#e5ae34' }}
                itemStyle={{ color: '#d4d4d8' }}
              />
              <Bar dataKey="count" fill="#e5ae34" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Films by Decade */}
        <div className="bg-film-card border border-film-border rounded-lg p-5">
          <h2 className="font-display text-lg text-zinc-200 mb-4">Films by Decade</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.byDecade}>
              <XAxis dataKey="decade" stroke="#52525b" fontSize={12} />
              <YAxis stroke="#52525b" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                labelStyle={{ color: '#e5ae34' }}
                itemStyle={{ color: '#d4d4d8' }}
              />
              <Area type="monotone" dataKey="count" stroke="#e5ae34" fill="#e5ae34" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Watches */}
      <div className="bg-film-card border border-film-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-zinc-200">Recent Watches</h2>
          <Link to="/library" className="text-sm text-gold-400 hover:text-gold-300">View all</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {data.recentWatches?.map((film, i) => (
            <div key={i} className="shrink-0 w-32">
              <div className="aspect-[2/3] bg-zinc-900 rounded-lg overflow-hidden mb-2">
                {film.poster_path ? (
                  <img src={`${TMDB_IMG}${film.poster_path}`} alt={film.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700 text-2xl">F</div>
                )}
              </div>
              <p className="text-xs text-zinc-300 truncate">{film.title}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{film.year}</span>
                {film.rating && <span className={`text-xs font-bold rating-${film.rating}`}>{film.rating}/10</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Genres */}
      <div className="bg-film-card border border-film-border rounded-lg p-5">
        <h2 className="font-display text-lg text-zinc-200 mb-4">Top Genres</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {data.topGenres?.map((genre, i) => (
            <div key={i} className="bg-film-dark border border-film-border rounded-lg p-3 text-center">
              <p className="text-sm font-medium text-zinc-200">{genre.name}</p>
              <p className="text-2xl font-bold text-gold-400 mt-1">{genre.count}</p>
              <p className="text-xs text-zinc-500">avg {genre.avg_rating?.toFixed(1)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink to="/tonight" title="Tonight" desc="Get a curated double feature" />
        <QuickLink to="/discover" title="Explore" desc={`${data.discoveryPool.toLocaleString()} films in your discovery pool`} />
        <QuickLink to="/watchlist" title="Watchlist" desc={`${data.watchlistCount} films queued up`} />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-film-card border border-film-border rounded-lg p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ? 'text-gold-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  );
}

function QuickLink({ to, title, desc }) {
  return (
    <Link to={to} className="bg-film-card border border-film-border rounded-lg p-5 hover:border-gold-400/40 transition-colors group">
      <h3 className="text-lg font-display text-zinc-200 group-hover:text-gold-400 transition-colors">{title}</h3>
      <p className="text-sm text-zinc-500 mt-1">{desc}</p>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-pulse space-y-6">
      <div className="h-8 w-48 bg-zinc-800 rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-20 bg-zinc-800 rounded-lg" />)}
      </div>
      <div className="h-64 bg-zinc-800 rounded-lg" />
    </div>
  );
}
