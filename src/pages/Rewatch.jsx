import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w200';

const MOOD_ICONS = {
  adrenaline: 'Adrenaline',
  comfort: 'Comfort',
  cerebral: 'Cerebral',
  dark: 'Dark',
  epic: 'Epic',
  heartfelt: 'Heartfelt',
  visual_feast: 'Visual Feast',
};

export default function Rewatch() {
  const [suggestions, setSuggestions] = useState([]);
  const [moods, setMoods] = useState([]);
  const [selectedMood, setSelectedMood] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getMoods().then(setMoods); }, []);

  useEffect(() => {
    setLoading(true);
    const params = { count: 24 };
    if (selectedMood) params.mood = selectedMood;
    api.getRewatchSuggestions(params).then(setSuggestions).catch(console.error).finally(() => setLoading(false));
  }, [selectedMood]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-zinc-100">Rewatch Radar</h1>
        <p className="text-zinc-500 mt-1">Films worth revisiting from your collection</p>
      </div>

      {/* Mood Selector */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setSelectedMood('')}
          className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
            !selectedMood
              ? 'bg-gold-400/15 border-gold-400/40 text-gold-400'
              : 'bg-film-card border-film-border text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All Moods
        </button>
        {moods.map(mood => (
          <button
            key={mood.id}
            onClick={() => setSelectedMood(mood.id)}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
              selectedMood === mood.id
                ? 'bg-gold-400/15 border-gold-400/40 text-gold-400'
                : 'bg-film-card border-film-border text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {MOOD_ICONS[mood.id] || mood.label}
          </button>
        ))}
      </div>

      {/* Suggestions */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-72 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="bg-film-card border border-film-border rounded-lg p-8 text-center">
          <p className="text-zinc-400">No rewatch suggestions yet. Enrich your films first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suggestions.map(film => (
            <Link key={film.id} to={`/film/${film.id}`}
              className="bg-film-card border border-film-border rounded-lg overflow-hidden hover:border-gold-400/30 transition-colors flex">
              <div className="w-24 shrink-0 bg-zinc-900">
                {film.poster_path ? (
                  <img src={`${TMDB_IMG}${film.poster_path}`} alt={film.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xl">F</div>
                )}
              </div>
              <div className="p-4 flex-1 min-w-0">
                <h3 className="text-sm font-medium text-zinc-100 truncate">{film.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500">{film.year}</span>
                  <span className={`text-xs font-bold rating-${film.rating}`}>{film.rating}/10</span>
                </div>
                {film.genres && (
                  <p className="text-xs text-zinc-600 mt-1 truncate">{film.genres}</p>
                )}
                {film.directors && (
                  <p className="text-xs text-zinc-500 mt-1 truncate">{film.directors}</p>
                )}
                {/* Rewatch reasons */}
                <div className="mt-2 space-y-0.5">
                  {film.rewatch_reasons?.map((reason, i) => (
                    <p key={i} className="text-xs text-gold-400/70">* {reason}</p>
                  ))}
                </div>
                <div className="mt-2">
                  <span className="text-xs bg-gold-400/10 text-gold-400 px-2 py-0.5 rounded">
                    {Math.round(film.rewatch_score)}% match
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
