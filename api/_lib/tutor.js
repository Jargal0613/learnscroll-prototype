// Pipeline: validate -> retrieve -> prompt -> provider -> verified citations.
const { validate } = require('./validate');
const { retrieve } = require('./retrieve');
const { buildPrompt } = require('./prompt');
const { getProvider } = require('./providers');

const MAX_ANSWER = 8000;

async function answer(body, { provider, env = process.env } = {}) {
  const req = validate(body);
  const p = provider || getProvider(env); // throws not_configured when no credentials
  const { sources, bookIndexAvailable } = retrieve(req);
  const messages = buildPrompt(req, sources, { bookIndexAvailable });
  let text = String(await p.complete(messages) || '').slice(0, MAX_ANSWER);
  // Citations: only refs that match a source we retrieved; anything else is stripped.
  const byRef = new Map(sources.map(s => [s.ref, s]));
  const used = new Set();
  text = text.replace(/\[(S\d{1,2})\]/g, (m, r) => (byRef.has(r) ? (used.add(r), m) : ''));
  const cited = sources.filter(s => used.has(s.ref)).map(({ text: _t, ...meta }) => meta);
  return { answer: text.trim(), sources: cited, retrieval: { bookIndexAvailable, consulted: sources.length }, conversationId: req.conversationId };
}
module.exports = { answer };
