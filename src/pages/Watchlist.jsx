import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'to_watch', label: 'To Watch' },
  { value: 'gap_fill', label: 'Gap Fill' },
  { value: 'for_review', label: 'For Review' },
  { value: 'rewatch', label: 'Rewatch' },
];

export default function Watchlist() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = async () => {
    setLoading(true);
    const params = {};
    if (category) params.category = category;
    try {
      const data = await api.getWatchlist(params);
      setItems(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchWatchlist(); }, [category]);

  const remove = async (id) => {
    await api.deleteFromWatchlist(id);
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-zinc-100">Watchlist</h1>
        <p className="text-zinc-500 mt-1">{items.length} films queued</p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2">
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
              category === c.value
                ? 'bg-gold-400/15 border-gold-400/40 text-gold-400'
                : 'bg-film-card border-film-border text-zinc-400 hover:text-zinc-200'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-film-card border border-film-border rounded-lg p-8 text-center">
          <p className="text-zinc-400">No items in this category.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-film-card border border-film-border rounded-lg p-4 flex items-center justify-between hover:border-gold-400/20 transition-colors">
              <div>
                <h3 className="text-sm font-medium text-zinc-200">{item.title} <span className="text-zinc-500">({item.year})</span></h3>
                <div className="flex items-center gap-3 mt-1">
                  {item.lane && <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">{item.lane}</span>}
                  <span className="text-xs text-zinc-600">{item.category.replace('_', ' ')}</span>
                  {item.priority > 0 && <span className="text-xs text-zinc-600">Priority: {item.priority}</span>}
                </div>
                {item.notes && <p className="text-xs text-zinc-500 mt-1 truncate max-w-lg">{item.notes}</p>}
              </div>
              <button onClick={() => remove(item.id)} className="text-xs text-zinc-600 hover:text-red-400 px-3 py-1">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
