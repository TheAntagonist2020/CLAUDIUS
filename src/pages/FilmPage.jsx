import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w1280';

const RATING_COLORS = {
  imdb: '#f5c518',
  tomatoes: '#fa320a',
  tomatoesaudience: '#fa320a',
  metacritic: '#66cc33',
  metacriticuser: '#66cc33',
  trakt: '#ed1c24',
  tmdb: '#01d277',
  letterboxd: '#00e054',
  rogerebert: '#f5c518',
};

export default function FilmPage() {
  const { id } = useParams();
  const [film, setFilm] = useState(null);
  const [mdbData, setMdbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [sendingToStremio, setSendingToStremio] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getFilm(id).then(f => {
      setFilm(f);
      // Fetch MDBList data in parallel
      api.getMdblistMovie(f.id).then(setMdbData).catch(() => {});
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    await api.addNote({ film_id: film.id, content: noteText });
    setNoteText('');
    const updated = await api.getFilm(id);
    setFilm(updated);
  };

  if (loading) return <div className="p-8 animate-pulse"><div className="h-96 bg-zinc-800 rounded-lg" /></div>;
  if (!film) return <div className="p-8 text-zinc-500">Film not found.</div>;

  const directors = film.credits?.filter(c => c.role === 'director') || [];
  const cast = film.credits?.filter(c => c.role === 'actor')?.slice(0, 8) || [];
  const tmdbStreaming = film.streaming?.filter(s => s.type === 'flatrate') || [];
  const mdbStreams = mdbData?.streams || [];
  const mdbRatings = mdbData?.ratings?.filter(r => r.value != null) || [];

  return (
    <div className="min-h-screen">
      {/* Backdrop */}
      {film.backdrop_path && (
        <div className="relative h-72 overflow-hidden">
          <img src={`${TMDB_BACKDROP}${film.backdrop_path}`} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-film-black via-film-black/60 to-transparent" />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-20 sm:-mt-32 relative z-10">
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
          {/* Poster */}
          <div className="shrink-0 flex sm:block gap-4">
            <div className="w-28 sm:w-48 shrink-0">
              {film.poster_path ? (
                <img src={`${TMDB_IMG}${film.poster_path}`} alt={film.title} className="w-full rounded-lg shadow-2xl" />
              ) : (
                <div className="w-full aspect-[2/3] bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-4xl">F</div>
              )}
            </div>
            {/* Title inline with poster on mobile */}
            <div className="flex-1 sm:hidden pt-1">
              <h1 className="font-display text-2xl font-bold text-zinc-100 leading-tight">{film.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-zinc-400">
                <span>{film.year}</span>
                {film.runtime && <span>{film.runtime} min</span>}
              </div>
              {film.rating && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-2xl font-bold rating-${film.rating}`}>{film.rating}</span>
                  <span className="text-zinc-500 text-sm">/10</span>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 sm:pt-8">
            <h1 className="hidden sm:block font-display text-4xl font-bold text-zinc-100">{film.title}</h1>
            <div className="hidden sm:flex items-center gap-4 mt-3 text-sm text-zinc-400">
              <span>{film.year}</span>
              {film.runtime && <span>{film.runtime} min</span>}
              {film.original_language && <span className="uppercase">{film.original_language}</span>}
            </div>

            {/* Your Rating — desktop only (shown inline on mobile) */}
            {film.rating && (
              <div className="hidden sm:flex mt-4 items-center gap-3">
                <span className={`text-4xl font-bold rating-${film.rating}`}>{film.rating}</span>
                <span className="text-zinc-500">/10 your rating</span>
              </div>
            )}

            {/* Directors */}
            {directors.length > 0 && (
              <div className="mt-4">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">Directed by</span>
                <p className="text-zinc-200">{directors.map(d => d.name).join(', ')}</p>
              </div>
            )}

            {/* Genres */}
            {film.genres?.length > 0 && (
              <div className="flex gap-2 mt-4">
                {film.genres.map(g => (
                  <span key={g.id} className="text-xs px-3 py-1 bg-film-card border border-film-border rounded-full text-zinc-400">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {film.tagline && (
              <p className="text-zinc-500 italic mt-4">"{film.tagline}"</p>
            )}
          </div>
        </div>

        {/* Aggregated Ratings from MDBList */}
        {mdbRatings.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl text-zinc-200 mb-3">Ratings Across Platforms</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {mdbRatings.map((r, i) => (
                <div key={i} className="bg-film-card border border-film-border rounded-lg p-3 text-center">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{formatRatingSource(r.source)}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: RATING_COLORS[r.source] || '#e5ae34' }}>
                    {r.source === 'letterboxd' ? `${r.value}/5` : r.source === 'imdb' ? `${r.value}/10` : `${r.value}%`}
                  </p>
                  {r.votes > 0 && <p className="text-xs text-zinc-600 mt-1">{r.votes.toLocaleString()} votes</p>}
                </div>
              ))}
              {mdbData?.score && (
                <div className="bg-gold-400/10 border border-gold-400/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-gold-400 uppercase tracking-wider">MDBList Score</p>
                  <p className="text-2xl font-bold mt-1 text-gold-400">{mdbData.score}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Streaming - MDBList streams take priority */}
        {(mdbStreams.length > 0 || tmdbStreaming.length > 0) && (
          <div className="mt-8">
            <h2 className="font-display text-xl text-zinc-200 mb-3">Where to Watch</h2>
            <div className="flex flex-wrap gap-3">
              {mdbStreams.length > 0
                ? mdbStreams.map((s, i) => (
                    <span key={i} className="text-sm px-4 py-2 bg-film-card border border-gold-400/30 rounded-lg text-gold-400">
                      {s.name}
                    </span>
                  ))
                : tmdbStreaming.map((s, i) => (
                    <span key={i} className="text-sm px-4 py-2 bg-film-card border border-film-border rounded-lg text-zinc-300">
                      {s.provider_name}
                    </span>
                  ))
              }
            </div>
          </div>
        )}

        {/* Overview */}
        {(film.overview || mdbData?.description) && (
          <div className="mt-8">
            <h2 className="font-display text-xl text-zinc-200 mb-3">Overview</h2>
            <p className="text-zinc-400 leading-relaxed">{film.overview || mdbData?.description}</p>
          </div>
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl text-zinc-200 mb-3">Cast</h2>
            <div className="grid grid-cols-4 gap-3">
              {cast.map(a => (
                <div key={a.person_id} className="bg-film-card border border-film-border rounded-lg p-3">
                  <p className="text-sm text-zinc-200">{a.name}</p>
                  {a.character_name && <p className="text-xs text-zinc-500 mt-1">as {a.character_name}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Watch History */}
        {film.watches?.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl text-zinc-200 mb-3">
              Watch History ({film.watches.length} {film.watches.length === 1 ? 'time' : 'times'})
            </h2>
            <div className="space-y-2">
              {film.watches.map((w, i) => (
                <div key={i} className="text-sm text-zinc-400">
                  {new Date(w.watched_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mt-8 mb-12">
          <h2 className="font-display text-xl text-zinc-200 mb-3">Notes</h2>
          <div className="flex gap-3 mb-4">
            <input
              type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 bg-film-card border border-film-border rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-gold-400/50"
              onKeyDown={e => e.key === 'Enter' && addNote()}
            />
            <button onClick={addNote} className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-300">
              Add
            </button>
          </div>
          {film.notes?.map(note => (
            <div key={note.id} className="bg-film-card border border-film-border rounded-lg p-3 mb-2">
              <p className="text-sm text-zinc-300">{note.content}</p>
              <p className="text-xs text-zinc-600 mt-1">{new Date(note.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>

        <Link to="/library" className="text-sm text-gold-400 hover:text-gold-300 mb-12 inline-block">
          Back to Library
        </Link>
      </div>
    </div>
  );
}

function formatRatingSource(source) {
  const labels = {
    imdb: 'IMDb',
    metacritic: 'Metacritic',
    metacriticuser: 'MC Users',
    trakt: 'Trakt',
    tomatoes: 'RT Critics',
    tomatoesaudience: 'RT Audience',
    tmdb: 'TMDb',
    letterboxd: 'Letterboxd',
    rogerebert: 'Ebert',
  };
  return labels[source] || source;
}
