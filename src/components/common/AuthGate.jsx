import React, { useState, useEffect } from 'react';

const TOKEN_KEY = 'claudius_token';

async function verifyToken(token) {
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.valid;
  } catch {
    return false;
  }
}

async function login(password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Wrong password');
  const data = await res.json();
  return data.token;
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | login | authed
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return setStatus('login');
    verifyToken(stored).then(valid => {
      setStatus(valid ? 'authed' : 'login');
    });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await login(password);
      localStorage.setItem(TOKEN_KEY, token);
      setStatus('authed');
    } catch {
      setError('Incorrect password');
    }
    setLoading(false);
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-film-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="min-h-screen bg-film-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl font-bold text-gold-400 tracking-wide">CLAUDIUS</h1>
            <p className="text-zinc-500 mt-2 text-sm">Film Intelligence System</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full bg-film-card border border-film-border rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-gold-400/60 text-center text-lg tracking-widest"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-gold-400 text-black font-semibold rounded-xl hover:bg-gold-300 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return children;
}
