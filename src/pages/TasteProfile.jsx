import React, { useState, useEffect } from 'react';
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { api } from '../lib/api';

export default function TasteProfile() {
  const [profile, setProfile] = useState(null);
  const [genres, setGenres] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [decades, setDecades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getTasteProfile(),
      api.getTasteGenres(),
      api.getTasteDirectors(),
      api.getTasteDecades(),
    ]).then(([p, g, d, dec]) => {
      setProfile(p);
      setGenres(g);
      setDirectors(d);
      setDecades(dec);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-zinc-800 rounded-lg" /></div>;

  const hasData = genres.length > 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-zinc-100">Taste Profile</h1>
          <p className="text-zinc-500 mt-1">Your cinematic DNA, decoded</p>
        </div>
        <button onClick={async () => {
          await api.rebuildTaste();
          window.location.reload();
        }} className="px-4 py-2 bg-film-card border border-film-border rounded-lg text-sm text-zinc-300 hover:border-gold-400/40">
          Rebuild Profile
        </button>
      </div>

      {!hasData ? (
        <div className="bg-film-card border border-film-border rounded-lg p-8 text-center">
          <p className="text-zinc-400">No taste data yet. Run enrichment first (Admin), then rebuild the profile.</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          {profile && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Films Watched" value={profile.total_watched} />
              <StatCard label="Films Rated" value={profile.total_rated} />
              <StatCard label="Avg Rating" value={profile.overall_avg_rating} accent />
              <StatCard label="Runtime (hrs)" value={profile.total_runtime_hours} />
            </div>
          )}

          {/* Genre Affinity */}
          <div className="bg-film-card border border-film-border rounded-lg p-5">
            <h2 className="font-display text-xl text-zinc-200 mb-4">Genre Affinity</h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={genres.slice(0, 15)} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" stroke="#52525b" fontSize={12} domain={[0, 100]} />
                <YAxis type="category" dataKey="genre_name" stroke="#52525b" fontSize={12} width={80} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                  formatter={(val, name) => [Math.round(val), 'Affinity']}
                  labelStyle={{ color: '#e5ae34' }}
                />
                <Bar dataKey="affinity_score" fill="#e5ae34" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Genre detail table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-film-border">
                    <th className="text-left py-2">Genre</th>
                    <th className="text-right py-2">Films</th>
                    <th className="text-right py-2">Avg Rating</th>
                    <th className="text-right py-2">8+ Rate</th>
                    <th className="text-right py-2">Affinity</th>
                  </tr>
                </thead>
                <tbody>
                  {genres.map(g => (
                    <tr key={g.genre_id} className="border-b border-film-border/50 hover:bg-white/5">
                      <td className="py-2 text-zinc-200">{g.genre_name}</td>
                      <td className="py-2 text-right text-zinc-400">{g.films_watched}</td>
                      <td className="py-2 text-right text-zinc-400">{g.avg_rating}</td>
                      <td className="py-2 text-right text-zinc-400">{g.high_rate_pct}%</td>
                      <td className="py-2 text-right font-medium text-gold-400">{g.affinity_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Decade Affinity */}
          <div className="bg-film-card border border-film-border rounded-lg p-5">
            <h2 className="font-display text-xl text-zinc-200 mb-4">Decade Affinity</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={decades}>
                <XAxis dataKey="decade" stroke="#52525b" fontSize={12} />
                <YAxis stroke="#52525b" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                  labelStyle={{ color: '#e5ae34' }}
                />
                <Area type="monotone" dataKey="affinity_score" stroke="#e5ae34" fill="#e5ae34" fillOpacity={0.2} name="Affinity" />
                <Area type="monotone" dataKey="avg_rating" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} name="Avg Rating" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Director Affinity */}
          <div className="bg-film-card border border-film-border rounded-lg p-5">
            <h2 className="font-display text-xl text-zinc-200 mb-4">Top Directors</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {directors.slice(0, 20).map((d, i) => (
                <div key={d.person_id} className="flex items-center justify-between bg-film-dark border border-film-border rounded-lg p-3">
                  <div>
                    <span className="text-zinc-500 text-xs mr-3">#{i + 1}</span>
                    <span className="text-zinc-200 text-sm">{d.director_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-zinc-500">{d.films_watched} films</span>
                    <span className="text-gold-400 font-medium">avg {d.avg_rating}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rating Distribution */}
          {profile?.rating_distribution && (
            <div className="bg-film-card border border-film-border rounded-lg p-5">
              <h2 className="font-display text-xl text-zinc-200 mb-4">Rating Distribution</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={profile.rating_distribution}>
                  <XAxis dataKey="rating" stroke="#52525b" fontSize={12} />
                  <YAxis stroke="#52525b" fontSize={12} />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }} />
                  <Bar dataKey="cnt" fill="#e5ae34" radius={[4, 4, 0, 0]} name="Films" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
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
