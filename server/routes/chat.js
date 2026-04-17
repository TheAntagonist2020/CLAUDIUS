const { Router } = require('express');
const { getClaude, SYSTEM_PROMPT_PREFIX } = require('../ai/claudeClient');
const { TOOLS, runTool } = require('../ai/chatTools');
const { buildTasteContext } = require('../ai/contextBuilder');

const router = Router();

const MODEL = 'claude-opus-4-7';
const MAX_ITERATIONS = 6;
const MAX_TOKENS = 8000;

router.post('/', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const client = getClaude();

    // Frozen cached prefix — taste profile rarely changes between requests
    const system = [
      {
        type: 'text',
        text: SYSTEM_PROMPT_PREFIX + buildTasteContext(),
        cache_control: { type: 'ephemeral' },
      },
    ];

    // Normalize client-sent messages — accept simple {role, content:string}
    const convo = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : m.content,
    }));

    for (let iter = 0; iter < MAX_ITERATIONS && !closed; iter++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system,
        tools: TOOLS,
        messages: convo,
      });

      stream.on('text', (delta) => {
        if (!closed) send('text_delta', { delta });
      });

      // Surface tool-use events as they happen
      stream.on('streamEvent', (event) => {
        if (closed) return;
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          send('tool_use_start', { name: event.content_block.name });
        }
      });

      const finalMsg = await stream.finalMessage();

      if (closed) break;

      // Append assistant turn verbatim (preserves tool_use blocks)
      convo.push({ role: 'assistant', content: finalMsg.content });

      if (finalMsg.stop_reason === 'end_turn' || finalMsg.stop_reason === 'stop_sequence') {
        break;
      }

      if (finalMsg.stop_reason !== 'tool_use') {
        send('warning', { message: `Stopped: ${finalMsg.stop_reason}` });
        break;
      }

      // Execute tools, send results back as a single user turn
      const toolUses = finalMsg.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        send('tool_call', { name: tu.name, input: tu.input });
        const result = runTool(tu.name, tu.input);
        send('tool_result', { name: tu.name, summary: summarizeResult(result) });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      convo.push({ role: 'user', content: toolResults });
    }

    if (!closed) {
      send('done', {});
      res.end();
    }
  } catch (err) {
    console.error('[chat] error:', err);
    if (!closed) {
      send('error', { message: err.message });
      res.end();
    }
  }
});

function summarizeResult(result) {
  if (!result) return 'no result';
  if (result.error) return `error: ${result.error}`;
  if (Array.isArray(result)) return `${result.length} row(s)`;
  if (typeof result === 'object') {
    if (result.title) return `${result.title} (${result.year})`;
    return `${Object.keys(result).length} fields`;
  }
  return String(result).slice(0, 80);
}

module.exports = router;
