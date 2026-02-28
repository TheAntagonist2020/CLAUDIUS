import React from 'react';
import { Link } from 'react-router-dom';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w300';

export default function FilmCard({ film, showRating = true, showScore = false, children }) {
  const poster = film.poster_path ? `${TMDB_IMG}${film.poster_path}` : null;

  return (
    <div className="group relative bg-film-card border border-film-border rounded-lg overflow-hidden hover:border-gold-400/40 transition-all hover:shadow-lg hover:shadow-gold-400/5">
      <Link to={`/film/${film.id || film.film_id}`} className="block">
        <div className="aspect-[2/3] bg-zinc-900 relative overflow-hidden">
          {poster ? (
            <img src={poster} alt={film.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-700">
              <span className="text-4xl">F</span>
            </div>
          )}
          {showRating && film.rating && (
            <div className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold rating-${film.rating}`}
              style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
              {film.rating}
            </div>
          )}
          {showScore && film.taste_score && (
            <div className="absolute top-2 right-2 bg-gold-400/90 text-black text-xs font-bold px-2 py-1 rounded">
              {Math.round(film.taste_score)}%
            </div>
          )}
        </div>
      </Link>
      <div className="p-3">
        <h3 className="text-sm font-medium text-zinc-100 truncate">{film.title}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-zinc-500">{film.year}</span>
          {film.genres && (
            <span className="text-xs text-zinc-600 truncate">{typeof film.genres === 'string' ? film.genres.split(',')[0] : ''}</span>
          )}
        </div>
        {film.directors && (
          <p className="text-xs text-zinc-500 mt-1 truncate">{film.directors}</p>
        )}
        {children}
      </div>
    </div>
  );
}
