import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

// Parse [film:123] markers into clickable links
function renderContent(text) {
  if (!text) return null;
  const parts = text.split(/(\[film:\d+\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[film:(\d+)\]$/);
    if (m) {
      return (
        <Link
          key={i}
          to={`/film/${m[1]}`}
          className="text-gold-400 hover:text-gold-300 underline underline-offset-2 decoration-gold-400/40"
        >
          film #{m[1]}
        </Link>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

const SAMPLE_PROMPTS = [
  'Something under 100 min, cerebral, nothing bleak.',
  'Three films I\'d probably love that I haven\'t seen yet.',
  'What\'s a film I rated highly but probably overrated?',
  'I want to watch something like Sicario.',
  'Pick tonight\'s film for me — I\'ve had a long day.',
];

export default function Chat() {
  const [messages, setMessages] = useState([]); // {role, content, streaming?, toolEvents?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || busy) return;
    setInput('');
    setBusy(true);

    const next = [
      ...messages,
      { role: 'user', content: userText },
      { role: 'assistant', content: '', streaming: true, toolEvents: [] },
    ];
    setMessages(next);

    const payload = next.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const ev of events) {
          const line = ev.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (!last || last.role !== 'assistant') return prev;

            if (data.type === 'text_delta') {
              copy[copy.length - 1] = { ...last, content: last.content + data.delta };
            } else if (data.type === 'tool_call') {
              copy[copy.length - 1] = {
                ...last,
                toolEvents: [...(last.toolEvents || []), { name: data.name, input: data.input }],
              };
            } else if (data.type === 'tool_result') {
              const events = [...(last.toolEvents || [])];
              const lastEv = events[events.length - 1];
              if (lastEv && lastEv.name === data.name && !lastEv.summary) {
                events[events.length - 1] = { ...lastEv, summary: data.summary };
              }
              copy[copy.length - 1] = { ...last, toolEvents: events };
            } else if (data.type === 'done') {
              copy[copy.length - 1] = { ...last, streaming: false };
            } else if (data.type === 'error') {
              copy[copy.length - 1] = { ...last, content: last.content + `\n\n[Error: ${data.message}]`, streaming: false };
            }
            return copy;
          });
        }
      }
    } catch (err) {
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = { ...last, content: last.content + `\n\n[Connection lost: ${err.message}]`, streaming: false };
        }
        return copy;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, messages]);

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full max-h-screen">
      <div className="px-4 sm:px-6 py-4 border-b border-film-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-100">Chat</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Ask your library anything</p>
        </div>
        {messages.length > 0 && (
          <button onClick={reset}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 border border-film-border rounded hover:border-zinc-600">
            New chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <p className="text-zinc-400 mb-6">
              I know your library — 4,500+ watched films, your ratings, your genre and director affinities.
              Ask me what to watch tonight, what you're missing, or why you rated something the way you did.
            </p>
            <div className="space-y-2">
              {SAMPLE_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => send(p)}
                  className="block w-full text-left px-4 py-3 bg-film-card border border-film-border rounded-lg text-sm text-zinc-300 hover:border-gold-400/40 hover:text-zinc-100 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((m, i) => (
              <Bubble key={i} msg={m} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 py-4 border-t border-film-border shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="max-w-2xl mx-auto flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask about your library…"
            disabled={busy}
            rows={1}
            className="flex-1 resize-none bg-film-card border border-film-border rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-gold-400/40 disabled:opacity-50"
          />
          <button type="submit" disabled={busy || !input.trim()}
            className="px-4 py-2.5 bg-gold-400 text-black text-sm font-medium rounded-lg hover:bg-gold-300 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-gold-400/10 border border-gold-400/20 text-zinc-100 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start">
      {msg.toolEvents && msg.toolEvents.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {msg.toolEvents.map((t, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 bg-film-card border border-film-border rounded text-zinc-500">
              <span className="text-zinc-400">🔍 {t.name}</span>
              {t.summary && <span className="text-zinc-600"> → {t.summary}</span>}
            </span>
          ))}
        </div>
      )}
      <div className="max-w-full text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
        {renderContent(msg.content)}
        {msg.streaming && <span className="inline-block w-1.5 h-4 bg-gold-400/60 ml-0.5 animate-pulse" />}
      </div>
    </div>
  );
}
