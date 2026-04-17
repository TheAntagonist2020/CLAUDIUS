import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import FilmLibrary from './pages/FilmLibrary';
import FilmPage from './pages/FilmPage';
import TasteProfile from './pages/TasteProfile';
import Discovery from './pages/Discovery';
import Tonight from './pages/Tonight';
import Queue from './pages/Queue';
import Rewatch from './pages/Rewatch';
import Watchlist from './pages/Watchlist';
import Admin from './pages/Admin';

const NAV_ITEMS = [
  { path: '/', label: 'Queue', icon: '▶' },
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/library', label: 'Library', icon: '🎬' },
  { path: '/taste', label: 'Taste', icon: '🧠' },
  { path: '/tonight', label: 'Tonight', icon: '🎭' },
  { path: '/discover', label: 'Explore', icon: '🔭' },
  { path: '/rewatch', label: 'Rewatch', icon: '🔄' },
  { path: '/watchlist', label: 'Watchlist', icon: '📋' },
  { path: '/admin', label: 'Admin', icon: '⚙️' },
];

export default function App() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — desktop only */}
      <nav className="hidden md:flex w-56 bg-film-dark border-r border-film-border flex-col shrink-0">
        <div className="p-5 border-b border-film-border">
          <h1 className="font-display text-2xl font-bold text-gold-400 tracking-wide">CLAUDIUS</h1>
          <p className="text-xs text-zinc-500 mt-1">Film Intelligence</p>
        </div>
        <div className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'text-gold-400 bg-gold-400/10 border-r-2 border-gold-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-film-black pb-16 md:pb-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center px-4 py-3 border-b border-film-border bg-film-dark sticky top-0 z-10">
          <h1 className="font-display text-xl font-bold text-gold-400 tracking-wide">CLAUDIUS</h1>
        </div>

        <Routes>
          <Route path="/" element={<Queue />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/library" element={<FilmLibrary />} />
          <Route path="/film/:id" element={<FilmPage />} />
          <Route path="/taste" element={<TasteProfile />} />
          <Route path="/tonight" element={<Tonight />} />
          <Route path="/discover" element={<Discovery />} />
          <Route path="/rewatch" element={<Rewatch />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="no-scrollbar md:hidden fixed bottom-0 left-0 right-0 bg-film-dark border-t border-film-border z-50 flex overflow-x-auto">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 min-w-[56px] flex-1 text-xs transition-colors ${
                isActive ? 'text-gold-400' : 'text-zinc-500'
              }`
            }
          >
            <span className="text-lg leading-none mb-0.5">{item.icon}</span>
            <span className="truncate text-[10px]">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
