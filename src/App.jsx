import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import MissionControl from './pages/MissionControl';
import Dashboard from './pages/Dashboard';
import FilmLibrary from './pages/FilmLibrary';
import FilmPage from './pages/FilmPage';
import TasteProfile from './pages/TasteProfile';
import Discovery from './pages/Discovery';
import Tonight from './pages/Tonight';
import Rewatch from './pages/Rewatch';
import Watchlist from './pages/Watchlist';
import Admin from './pages/Admin';

const NAV_ITEMS = [
  { path: '/', label: 'Mission', icon: '\u{1F3AF}' },
  { path: '/dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
  { path: '/library', label: 'Library', icon: '\u{1F3AC}' },
  { path: '/taste', label: 'Taste', icon: '\u{1F9E0}' },
  { path: '/tonight', label: 'Tonight', icon: '\u{1F3AC}' },
  { path: '/discover', label: 'Explore', icon: '\u{1F52D}' },
  { path: '/rewatch', label: 'Rewatch', icon: '\u{1F504}' },
  { path: '/watchlist', label: 'Watchlist', icon: '\u{1F4CB}' },
  { path: '/admin', label: 'Admin', icon: '\u{2699}' },
];

export default function App() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <nav className="w-56 bg-film-dark border-r border-film-border flex flex-col shrink-0">
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
      <main className="flex-1 overflow-y-auto bg-film-black">
        <Routes>
          <Route path="/" element={<MissionControl />} />
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
    </div>
  );
}
