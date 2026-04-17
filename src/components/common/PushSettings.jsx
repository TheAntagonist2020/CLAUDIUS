import React, { useEffect, useState } from 'react';

// Push-notification setup for the "Just put something on" reminders via ntfy.sh.
// Stateless from the UI's perspective — settings live on the server.
export default function PushSettings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/put-it-on/push/settings')
      .then(r => r.json()).then(setSettings).catch(() => {});
  }, []);

  const update = (patch) => setSettings(s => ({ ...s, ...patch }));

  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      const res = await fetch('/api/put-it-on/push/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: settings.enabled,
          ntfy_topic: settings.ntfy_topic,
          ntfy_server: settings.ntfy_server || '',
          times: settings.times,
          days: settings.days,
        }),
      });
      const saved = await res.json();
      setSettings(saved);
      setStatus({ kind: 'ok', msg: 'Saved.' });
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setStatus(null);
    try {
      const res = await fetch('/api/put-it-on/push/test', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus({ kind: 'ok', msg: 'Test sent. Check your phone.' });
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
    } finally { setTesting(false); }
  };

  const sendNow = async () => {
    setTesting(true); setStatus(null);
    try {
      const res = await fetch('/api/put-it-on/push/now', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus({ kind: 'ok', msg: `Pushed: ${body.pick?.film?.title}` });
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
    } finally { setTesting(false); }
  };

  if (!settings) return null;

  const toggleDay = (d) => {
    const days = settings.days.includes(d)
      ? settings.days.filter(x => x !== d)
      : [...settings.days, d].sort();
    update({ days });
  };

  const addTime = () => {
    const t = prompt('Time (24h, HH:MM):', '19:00');
    if (!t || !/^\d{2}:\d{2}$/.test(t)) return;
    if (settings.times.includes(t)) return;
    update({ times: [...settings.times, t].sort() });
  };

  const removeTime = (t) => update({ times: settings.times.filter(x => x !== t) });

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-film-card border border-film-border rounded-lg p-6">
      <h2 className="font-display text-xl text-zinc-200 mb-2">Push notifications</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Get a phone push at set times with a smart pick of what to watch. Free via{' '}
        <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="text-gold-400 underline underline-offset-2">
          ntfy.sh
        </a>: pick a hard-to-guess topic name, install the ntfy iOS/Android app, subscribe
        to that topic. Tap the notification to open the Stremio deep-link.
      </p>

      <div className="space-y-4">
        {/* Enabled */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={!!settings.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            className="w-4 h-4 accent-gold-400" />
          <span className="text-sm text-zinc-200">Enable scheduled pushes</span>
        </label>

        {/* Topic */}
        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wide">ntfy topic (keep this secret)</label>
          <input type="text" value={settings.ntfy_topic || ''}
            onChange={e => update({ ntfy_topic: e.target.value })}
            placeholder="e.g. claudius-dalton-7k9x"
            className="mt-1 w-full bg-film-dark border border-film-border rounded px-3 py-2 text-sm text-zinc-100" />
        </div>

        {/* Optional self-hosted */}
        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wide">ntfy server (optional, self-hosted)</label>
          <input type="text" value={settings.ntfy_server || ''}
            onChange={e => update({ ntfy_server: e.target.value })}
            placeholder="default: https://ntfy.sh"
            className="mt-1 w-full bg-film-dark border border-film-border rounded px-3 py-2 text-sm text-zinc-100" />
        </div>

        {/* Days */}
        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wide">Days</label>
          <div className="mt-2 flex gap-1 flex-wrap">
            {dayLabels.map((lbl, i) => (
              <button key={i} onClick={() => toggleDay(i)}
                className={`px-3 py-1.5 rounded text-xs font-medium ${
                  settings.days.includes(i)
                    ? 'bg-gold-400 text-black'
                    : 'bg-film-dark border border-film-border text-zinc-400 hover:text-zinc-200'
                }`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Times */}
        <div>
          <label className="text-xs text-zinc-400 uppercase tracking-wide">Times (local, 24h)</label>
          <div className="mt-2 flex gap-2 flex-wrap items-center">
            {settings.times.map(t => (
              <div key={t} className="flex items-center gap-1 bg-film-dark border border-film-border rounded px-2 py-1 text-sm">
                <span className="text-zinc-200">{t}</span>
                <button onClick={() => removeTime(t)}
                  className="text-zinc-500 hover:text-red-400 text-xs">×</button>
              </div>
            ))}
            <button onClick={addTime}
              className="px-2 py-1 border border-dashed border-zinc-600 rounded text-xs text-zinc-400 hover:text-zinc-200">
              + add
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-gold-400 text-black text-sm font-medium rounded hover:bg-gold-300 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={sendTest} disabled={testing || !settings.ntfy_topic}
            className="px-4 py-2 bg-film-dark border border-film-border text-zinc-300 text-sm rounded hover:border-zinc-500 disabled:opacity-50">
            {testing ? '...' : 'Send test'}
          </button>
          <button onClick={sendNow} disabled={testing || !settings.ntfy_topic}
            className="px-4 py-2 bg-film-dark border border-film-border text-zinc-300 text-sm rounded hover:border-zinc-500 disabled:opacity-50">
            Push a pick now
          </button>
        </div>

        {status && (
          <p className={`text-sm ${status.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}
