import React, { useState } from 'react';
import { api } from '../lib/api';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const MOODS = [
  { key: 'adrenaline', label: 'Adrenaline', desc: 'Action, tension, edge of your seat' },
  { key: 'comfort', label: 'Comfort', desc: 'Light, warm, easy to sink into' },
  { key: 'cerebral', label: 'Cerebral', desc: 'Make me think' },
  { key: 'dark', label: 'Dark', desc: 'Horror, noir, the unsettling' },
  { key: 'epic', label: 'Epic', desc: 'War, history, grand scale' },
  { key: 'heartfelt', label: 'Heartfelt', desc: 'Emotion, romance, human connection' },
  { key: 'visual_feast', label: 'Visual Feast', desc: 'Sci-fi, fantasy, pure cinema' },
];

const TIME_OPTIONS = [
  { key: 'quick', label: 'Just One Film', desc: 'Under 2 hours', maxRuntime: 120, single: true },
  { key: 'standard', label: 'Double Feature', desc: '3-4 hours total', maxRuntime: null, single: false },
  { key: 'short_double', label: 'Short Double', desc: 'Two films, under 3 hours', maxRuntime: 180, single: false },
  { key: 'marathon', label: 'All Night', desc: 'No limits', maxRuntime: null, single: false },
];

const REWATCH_OPTIONS = [
  { key: 'no', label: 'All New', desc: 'Only films I haven\'t seen' },
  { key: 'either', label: 'Open to Either', desc: 'Mix of new discoveries and revisits' },
  { key: 'yes', label: 'Rewatch Night', desc: 'Only films I\'ve already seen and loved' },
];

const STEPS = ['Mood', 'Time', 'Rewatch', 'Films'];
const STEP_MOOD = 0;
const STEP_TIME = 1;
const STEP_REWATCH = 2;
const STEP_RESULT = 3;

export default function Tonight() {
  const [step, setStep] = useState(STEP_MOOD);
  const [mood, setMood] = useState(null);
  const [timeChoice, setTimeChoice] = useState(null);
  const [rewatchPref, setRewatchPref] = useState(null);
  const [pairing, setPairing] = useState(null);
  const [singlePick, setSinglePick] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stremioStatus, setStremioStatus] = useState({});

  const selectMood = (m) => {
    setMood(m);
    setStep(STEP_TIME);
  };

  const skipMood = () => {
    setMood(null);
    setStep(STEP_TIME);
  };

  const selectTime = (time) => {
    setTimeChoice(time);
    setStep(STEP_REWATCH);
  };

  const selectRewatch = async (pref) => {
    setRewatchPref(pref);
    setStep(STEP_RESULT);
    await fetchPicks(timeChoice, pref);
  };

  const fetchPicks = async (time, rewatch) => {
    setLoading(true);
    setStremioStatus({});
    try {
      if (time.single) {
        const params = {};
        if (mood) params.mood = mood;
        if (time.maxRuntime) params.maxRuntime = time.maxRuntime;
        params.rewatch = rewatch;
        const data = await api.getSinglePick(params);
        setSinglePick(data);
        setPairing(null);
      } else {
        const params = {};
        if (mood) params.mood = mood;
        if (time.maxRuntime) params.maxRuntime = time.maxRuntime;
        params.rewatch = rewatch;
        const data = await api.getCuratedPicks(params);
        setPairing(data);
        setSinglePick(null);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const refresh = async () => {
    if (!timeChoice || !rewatchPref) return;
    await fetchPicks(timeChoice, rewatchPref);
  };

  const startOver = () => {
    setStep(STEP_MOOD);
    setMood(null);
    setTimeChoice(null);
    setRewatchPref(null);
    setPairing(null);
    setSinglePick(null);
    setStremioStatus({});
  };

  const sendToStremio = async (film, index) => {
    const imdbId = film.imdb_id;
    if (!imdbId) return;
    setStremioStatus(prev => ({ ...prev, [index]: 'sending' }));
    try {
      await api.sendToStremio({ imdb_id: imdbId });
      setStremioStatus(prev => ({ ...prev, [index]: 'sent' }));
    } catch {
      setStremioStatus(prev => ({ ...prev, [index]: 'failed' }));
    }
  };

  const sendAllToStremio = async () => {
    const films = pairing?.films || (singlePick ? [singlePick] : []);
    for (let i = 0; i < films.length; i++) {
      if (films[i].imdb_id) await sendToStremio(films[i], i);
    }
  };

  // Summary of choices so far
  const choiceSummary = () => {
    const parts = [];
    if (mood) parts.push(MOODS.find(m => m.key === mood)?.label);
    else parts.push('Surprise');
    if (timeChoice) parts.push(timeChoice.label);
    if (rewatchPref) parts.push(REWATCH_OPTIONS.find(r => r.key === rewatchPref)?.label);
    return parts;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto min-h-screen flex flex-col">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              onClick={() => { if (i < step) setStep(i); }}
              className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                i < step ? 'bg-gold-400 text-black cursor-pointer' :
                i === step ? 'bg-gold-400/20 text-gold-400 border border-gold-400' :
                'bg-film-card text-zinc-600 border border-film-border'
              }`}
            >
              {i < step ? '\u2713' : i + 1}
            </button>
            <span className={`text-xs ${i <= step ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`w-8 h-px ${i < step ? 'bg-gold-400' : 'bg-film-border'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Mood */}
      {step === STEP_MOOD && (
        <div className="flex-1 flex flex-col items-center">
          <h1 className="font-display text-3xl font-bold text-zinc-100 mb-2">What are you in the mood for?</h1>
          <p className="text-zinc-500 mb-10">Pick a vibe, or let CLAUDIUS surprise you.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
            {MOODS.map(m => (
              <button
                key={m.key}
                onClick={() => selectMood(m.key)}
                className="text-left bg-film-card border border-film-border rounded-xl p-5 hover:border-gold-400/40 hover:bg-gold-400/5 transition-all group"
              >
                <span className="text-lg text-zinc-200 font-medium group-hover:text-gold-400 transition-colors">
                  {m.label}
                </span>
                <p className="text-sm text-zinc-500 mt-1">{m.desc}</p>
              </button>
            ))}
          </div>

          <button
            onClick={skipMood}
            className="mt-6 px-6 py-3 text-sm text-gold-400 hover:text-gold-300 transition-colors"
          >
            Surprise me — skip this
          </button>
        </div>
      )}

      {/* Step 2: Time */}
      {step === STEP_TIME && (
        <div className="flex-1 flex flex-col items-center">
          <h1 className="font-display text-3xl font-bold text-zinc-100 mb-2">How much time do you have?</h1>
          <p className="text-zinc-500 mb-10">
            {mood ? `${MOODS.find(m => m.key === mood)?.label} mood locked in.` : 'Surprise mode.'} Now, how long is your evening?
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
            {TIME_OPTIONS.map(t => (
              <button
                key={t.key}
                onClick={() => selectTime(t)}
                className="text-left bg-film-card border border-film-border rounded-xl p-5 hover:border-gold-400/40 hover:bg-gold-400/5 transition-all group"
              >
                <span className="text-lg text-zinc-200 font-medium group-hover:text-gold-400 transition-colors">
                  {t.label}
                </span>
                <p className="text-sm text-zinc-500 mt-1">{t.desc}</p>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep(STEP_MOOD)}
            className="mt-6 px-6 py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Step 3: Rewatch preference */}
      {step === STEP_REWATCH && (
        <div className="flex-1 flex flex-col items-center">
          <h1 className="font-display text-3xl font-bold text-zinc-100 mb-2">New or revisit?</h1>
          <p className="text-zinc-500 mb-10">
            {choiceSummary().slice(0, 2).join(' · ')} — do you want to see something new, revisit a favorite, or either?
          </p>

          <div className="grid grid-cols-1 gap-3 w-full max-w-md">
            {REWATCH_OPTIONS.map(r => (
              <button
                key={r.key}
                onClick={() => selectRewatch(r.key)}
                className="text-left bg-film-card border border-film-border rounded-xl p-5 hover:border-gold-400/40 hover:bg-gold-400/5 transition-all group"
              >
                <span className="text-lg text-zinc-200 font-medium group-hover:text-gold-400 transition-colors">
                  {r.label}
                </span>
                <p className="text-sm text-zinc-500 mt-1">{r.desc}</p>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep(STEP_TIME)}
            className="mt-6 px-6 py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Step 4: Results */}
      {step === STEP_RESULT && (
        <div className="flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin mb-4" />
              <p className="text-zinc-500 text-sm">Finding the perfect{timeChoice?.single ? ' pick' : ' pairing'}...</p>
            </div>
          ) : singlePick ? (
            <>
              <div className="text-center mb-8">
                <h1 className="font-display text-3xl font-bold text-zinc-100">Your Pick</h1>
                <div className="flex items-center justify-center gap-2 mt-3">
                  {choiceSummary().map((s, i) => (
                    <span key={i} className="text-xs px-3 py-1 bg-film-card border border-film-border rounded-full text-zinc-400">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <FilmCard
                film={singlePick}
                index={0}
                total={1}
                stremioStatus={stremioStatus[0]}
                onSendToStremio={() => sendToStremio(singlePick, 0)}
                large
              />

              <ActionBar
                onRefresh={refresh}
                onStartOver={startOver}
                hasStremio={!!singlePick.imdb_id}
                onSendAll={() => sendToStremio(singlePick, 0)}
                sendAllLabel="Send to Stremio"
              />
            </>
          ) : pairing && pairing.films?.length > 0 ? (
            <>
              <div className="text-center mb-8">
                <h1 className="font-display text-3xl font-bold text-zinc-100">Your Double Feature</h1>
                <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                  {choiceSummary().map((s, i) => (
                    <span key={i} className="text-xs px-3 py-1 bg-film-card border border-film-border rounded-full text-zinc-400">
                      {s}
                    </span>
                  ))}
                  <span className="inline-block px-3 py-1 bg-gold-400/10 border border-gold-400/30 rounded-full text-xs text-gold-400 font-medium">
                    {pairing.label}
                  </span>
                  {pairing.totalRuntime > 0 && (
                    <span className="text-xs text-zinc-500">
                      {Math.floor(pairing.totalRuntime / 60)}h {pairing.totalRuntime % 60}m total
                    </span>
                  )}
                </div>
                <p className="text-zinc-500 text-sm mt-2">{pairing.description}</p>
              </div>

              <div className="space-y-6">
                {pairing.films.map((film, i) => (
                  <FilmCard
                    key={film.id || i}
                    film={film}
                    index={i}
                    total={pairing.films.length}
                    stremioStatus={stremioStatus[i]}
                    onSendToStremio={() => sendToStremio(film, i)}
                  />
                ))}
              </div>

              <ActionBar
                onRefresh={refresh}
                onStartOver={startOver}
                hasStremio={pairing.films.some(f => f.imdb_id)}
                onSendAll={sendAllToStremio}
                sendAllLabel="Send Both to Stremio"
              />
            </>
          ) : (
            <div className="bg-film-card border border-film-border rounded-2xl p-12 text-center">
              <p className="text-zinc-400 text-lg">No picks found for this combination.</p>
              <p className="text-zinc-600 text-sm mt-2">Try a different mood, time, or rewatch preference.</p>
              <button onClick={startOver} className="mt-4 px-4 py-2 text-sm text-gold-400 hover:text-gold-300">
                Start Over
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBar({ onRefresh, onStartOver, hasStremio, onSendAll, sendAllLabel }) {
  return (
    <div className="flex justify-center gap-3 mt-10 mb-8">
      <button
        onClick={onStartOver}
        className="px-5 py-2.5 bg-film-card border border-film-border rounded-xl text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all text-sm"
      >
        Start Over
      </button>
      <button
        onClick={onRefresh}
        className="px-5 py-2.5 bg-film-card border border-gold-400/30 rounded-xl text-gold-400 hover:bg-gold-400/10 transition-all text-sm font-medium"
      >
        New Pick
      </button>
      {hasStremio && (
        <button
          onClick={onSendAll}
          className="px-5 py-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/25 transition-all text-sm font-medium"
        >
          {sendAllLabel}
        </button>
      )}
    </div>
  );
}

function FilmCard({ film, index, total, stremioStatus, onSendToStremio, large }) {
  const isRewatch = film.pick_type === 'rewatch';
  const label = isRewatch ? 'Revisit' : 'Discover';
  const number = total === 2 ? (index === 0 ? 'First' : 'Then') : '';

  return (
    <div className={`relative rounded-2xl overflow-hidden border transition-all ${
      isRewatch
        ? 'bg-film-card border-gold-400/20 hover:border-gold-400/40'
        : 'bg-film-card border-emerald-500/20 hover:border-emerald-500/40'
    }`}>
      <div className={`flex gap-6 ${large ? 'p-8' : 'p-6'}`}>
        {/* Poster */}
        <div className={`shrink-0 ${large ? 'w-44' : 'w-32'}`}>
          {film.poster_path ? (
            <img
              src={film.poster_path.startsWith('/') ? `${TMDB_IMG}${film.poster_path}` : film.poster_path}
              alt={film.title}
              className="w-full rounded-lg shadow-lg"
            />
          ) : (
            <div className="w-full aspect-[2/3] bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-3xl">
              F
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {number && <span className="text-xs text-zinc-600 uppercase tracking-widest">{number}</span>}
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              isRewatch
                ? 'bg-gold-400/10 text-gold-400'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {label}
            </span>
          </div>

          <h2 className={`font-display font-bold text-zinc-100 leading-tight ${large ? 'text-3xl' : 'text-2xl'}`}>
            {film.title}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
            <span>{film.year}</span>
            {film.runtime && <span>{film.runtime} min</span>}
            {film.directors && <span>{film.directors}</span>}
          </div>

          {film.genres && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {film.genres.split(',').map((g, j) => (
                <span key={j} className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-500">
                  {g.trim()}
                </span>
              ))}
            </div>
          )}

          {large && film.overview && (
            <p className="text-sm text-zinc-400 mt-3 leading-relaxed line-clamp-3">{film.overview}</p>
          )}

          <p className={`mt-4 text-sm italic ${isRewatch ? 'text-gold-400/80' : 'text-emerald-400/80'}`}>
            "{film.rationale}"
          </p>

          <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
            {film.rating && <span className="text-gold-400 font-bold">Your rating: {film.rating}/10</span>}
            {film.taste_score && <span>Taste match: {Math.round(film.taste_score)}</span>}
            {film.imdb_rating > 0 && <span>IMDb: {film.imdb_rating}</span>}
            {film.rt_tomatometer > 0 && <span>RT: {film.rt_tomatometer}%</span>}
          </div>

          {film.imdb_id && (
            <button
              onClick={onSendToStremio}
              disabled={stremioStatus === 'sent'}
              className={`mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                stremioStatus === 'sent'
                  ? 'bg-emerald-500/10 text-emerald-400/50 cursor-default'
                  : stremioStatus === 'sending'
                  ? 'bg-emerald-500/10 text-emerald-400/70 cursor-wait'
                  : stremioStatus === 'failed'
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
              }`}
            >
              {stremioStatus === 'sent' ? 'Sent to Stremio' :
               stremioStatus === 'sending' ? 'Sending...' :
               stremioStatus === 'failed' ? 'Failed \u2014 Retry' :
               'Send to Stremio'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
