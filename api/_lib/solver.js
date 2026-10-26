// Engineering Problem Solver (POST /api/solve). Off unless SOLVER_ENABLED=1; refuses every request when the
// Upstash rate-limit store is missing or failing (fail closed). See docs/problem-solver.md.
const MAX_PROBLEM = 3000;
const LIMITS = { perMinute: 2, perDay: 10, globalPerDay: 200 };
const enabled = (env = process.env) => env.SOLVER_ENABLED === '1';

// Request shape from the client: ids only + the problem text the student typed.
function validate(body, { bookIds }) {
  if (!body || typeof body !== 'object') return 'Send a JSON object.';
  if (!bookIds.includes(body.bookId)) return 'Unknown book.';
  if (typeof body.problem !== 'string' || body.problem.trim().length < 20) return 'Describe the problem (at least 20 characters).';
  if (body.problem.length > MAX_PROBLEM) return `Problem text is too long (max ${MAX_PROBLEM} characters).`;
  if (body.given !== undefined && !Array.isArray(body.given)) return 'given must be a list.';
  return null;
}

// One Responses call with File Search on this book's own vector store only (same as the tutor).
function buildPrompt({ book, problem }) {
  return {
    instructions: [
      `You help an engineering student solve a problem from ${book.title} (${book.edition}).`,
      'Use only the retrieved textbook passages for equations, property values and definitions. If a needed value is not in the passages, say so and ask the student for it; never invent property values.',
      'Answer as JSON matching the schema: givens (symbol, value, unit), unknown, assumptions, equations (TeX without $ delimiters; source = the textbook section only if a retrieved passage states it, else ""), steps (each with the substituted numbers and units; inline math in \\( \\)), result (value, unit), unitCheck (one sentence), sanityCheck (one sentence: is the magnitude and sign reasonable?), fromTextbook (what the retrieved passages support, paraphrased, no quotes; "" if nothing), additionalExplanation (general knowledge not from the passages; "" if none), sourceNote.',
      'Use SI units. Keep 3 significant figures unless the problem says otherwise.',
    ].join('\n'),
    input: [{ role: 'user', content: problem.slice(0, MAX_PROBLEM) }],
  };
}
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['givens', 'unknown', 'assumptions', 'equations', 'steps', 'result', 'unitCheck', 'sanityCheck', 'fromTextbook', 'additionalExplanation', 'sourceNote'],
  properties: {
    givens: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['symbol', 'value', 'unit'], properties: { symbol: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' } } } },
    unknown: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } },
    equations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['tex', 'source'], properties: { tex: { type: 'string' }, source: { type: 'string' } } } },
    steps: { type: 'array', items: { type: 'string' } },
    result: { type: 'object', additionalProperties: false, required: ['value', 'unit'], properties: { value: { type: 'string' }, unit: { type: 'string' } } },
    unitCheck: { type: 'string' }, sanityCheck: { type: 'string' }, fromTextbook: { type: 'string' }, additionalExplanation: { type: 'string' }, sourceNote: { type: 'string' },
  },
};
function parse(text) {
  let j; try { j = JSON.parse(text); } catch (e) { throw Object.assign(new Error('The solver returned something that is not JSON.'), { code: 'bad_output' }); }
  for (const k of SCHEMA.required) if (!(k in j)) throw Object.assign(new Error(`The solver answer is missing "${k}".`), { code: 'bad_output' });
  if (!j.steps.length || !j.result.unit) throw Object.assign(new Error('The solver answer has no steps or no unit.'), { code: 'bad_output' });
  return j;
}

// Fixed-window limiter over an injected store (Upstash/KV in production; Map in tests). Keys never contain the
// problem text. Returns { ok, retryAfter } and never throws for a store error: on store failure it refuses (fail closed).
async function limit(store, { ip, now = Date.now(), limits = LIMITS }) {
  const day = new Date(now).toISOString().slice(0, 10), min = Math.floor(now / 60000);
  const keys = [[`solve:ip:${ip}:m:${min}`, limits.perMinute, 60], [`solve:ip:${ip}:d:${day}`, limits.perDay, 86400], [`solve:all:d:${day}`, limits.globalPerDay, 86400]];
  try {
    for (const [k, max, ttl] of keys) { const n = await store.incr(k, ttl); if (n > max) return { ok: false, reason: k.includes(':m:') ? 'minute' : k.startsWith('solve:all') ? 'global' : 'day', retryAfter: k.includes(':m:') ? 60 - Math.floor((now / 1000) % 60) : 86400 - Math.floor((now / 1000) % 86400) }; }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'limiter_unavailable', retryAfter: 60 }; }
}

async function solve(req, { env = process.env, provider, store, ip, book, knowledge }) {
  if (!enabled(env)) throw Object.assign(new Error('Not available.'), { code: 'not_found', status: 404 });
  const kb = knowledge.forBook(book.id); if (!kb) throw Object.assign(new Error('This book is not connected.'), { code: 'book_not_available', status: 404 });
  const lim = await limit(store, { ip }); if (!lim.ok) throw Object.assign(new Error('Too many problems right now. Try again later.'), { code: 'rate_limited', status: 429, retryAfter: lim.retryAfter });
  const { instructions, input } = buildPrompt({ book, problem: req.problem });
  const out = await provider.respond({ instructions, input, vectorStoreId: kb.vectorStoreId, format: { type: 'json_schema', name: 'solution', strict: true, schema: SCHEMA } });
  return { solution: parse(out.text), usage: out.usage || null };
}
module.exports = { enabled, validate, buildPrompt, parse, limit, solve, LIMITS, SCHEMA };
