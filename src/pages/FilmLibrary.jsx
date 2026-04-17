import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import FilmCard from '../components/common/FilmCard';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently Watched' },
  { value: 'rating_desc', label: 'Highest Rated' },
  { value: 'rating_asc', label: 'Lowest Rated' },
  { value: 'year_desc', label: 'Newest First' },
  { value: 'year_asc', label: 'Oldest First' },
  { value: 'title', label: 'A-Z' },
];

const DECADES = ['2020', '2010', '2000', '1990', '1980', '1970', '1960', '1950', '1940', '1930', '1920'];

export default function FilmLibrary() {
  const [films, setFilms] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [decade, setDecade] = useState('');
  const [ratingMin, setRatingMin] = useState('');
  const [page, setPage] = useState(1);

  const fetchFilms = useCallback(async () => {
    setLoading(true);
    try {
      const params = { sort, page, limit: 48 };
      if (search) params.search = search;
      if (decade) params.decade = decade;
      if (ratingMin) params.rating_min = ratingMin;
      const data = await api.getFilms(params);
      setFilms(data.films);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [search, sort, decade, ratingMin, page]);

  useEffect(() => { fetchFilms(); }, [fetchFilms]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / 48);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-zinc-100">Library</h1>
          <p className="text-zinc-500 mt-1">{total.toLocaleString()} films</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search films..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="bg-film-card border border-film-border rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-gold-400/50 w-64"
        />
        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
          className="bg-film-card border border-film-border rounded-lg px-3 py-2 text-sm text-zinc-300">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={decade} onChange={e => { setDecade(e.target.value); setPage(1); }}
          className="bg-film-card border border-film-border rounded-lg px-3 py-2 text-sm text-zinc-300">
          <option value="">All Decades</option>
          {DECADES.map(d => <option key={d} value={d}>{d}s</option>)}
        </select>
        <select value={ratingMin} onChange={e => { setRatingMin(e.target.value); setPage(1); }}
          className="bg-film-card border border-film-border rounded-lg px-3 py-2 text-sm text-zinc-300">
          <option value="">All Ratings</option>
          {[10,9,8,7,6,5].map(r => <option key={r} value={r}>{r}+ stars</option>)}
        </select>
      </div>

      {/* Film Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[2/3] bg-zinc-800 rounded-lg" />
              <div className="h-4 bg-zinc-800 rounded mt-2 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {films.map(film => <FilmCard key={film.id} film={film} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 bg-film-card border border-film-border rounded-lg text-sm text-zinc-300 disabled:opacity-30 hover:border-gold-400/40">
            Previous
          </button>
          <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-4 py-2 bg-film-card border border-film-border rounded-lg text-sm text-zinc-300 disabled:opacity-30 hover:border-gold-400/40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
