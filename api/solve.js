// POST /api/solve: Engineering Problem Solver. Off unless SOLVER_ENABLED=1; fail closed without the rate limiter.
const S = require('./_lib/solver');
const { upstashStore } = require('./_lib/upstash');
const { getProvider } = require('./_lib/providers');
const knowledge = require('./_lib/knowledge');
const { BOOK_IDS, getBook } = require('./_lib/books');
const { toResponse } = require('./_lib/errors');

const send = (res, code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let s = req.body != null ? String(req.body) : '';
  if (!s) { const parts = []; let n = 0; for await (const c of req) { n += c.length; if (n > 16384) return null; parts.push(c); } s = Buffer.concat(parts).toString('utf8'); }
  if (s.length > 16384) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
function clientIp(req) { return String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64); }

module.exports = async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const env = deps.env || process.env;
  const store = deps.store !== undefined ? deps.store : upstashStore(env);
  if (req.method === 'GET') { // read-only status + the caller's own counters (no problem text, no OpenAI call)
    const out = { enabled: S.enabled(env), limiter: !!store, limits: S.LIMITS };
    if (store && store.peek) {
      const ip = clientIp(req), k = S.limitKeys(ip);
      try { const [minute, day, global] = await store.peek([k.minute, k.day, k.global]); out.usage = { ip, minute, day, global }; } catch (e) { out.usage = null; out.limiterError = true; }
    }
    return send(res, 200, out);
  }
  if (!S.enabled(env)) return send(res, 404, { error: { code: 'not_found', message: 'Not available.' } });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: { code: 'method_not_allowed', message: 'Use POST.' } }); }
  if (!store) return send(res, 503, { error: { code: 'limiter_unavailable', message: 'The problem solver is temporarily unavailable.' } });
  const body = await readBody(req);
  const bad = body === null ? 'Send a JSON object.' : S.validate(body, { bookIds: BOOK_IDS });
  if (bad) return send(res, 400, { error: { code: 'bad_request', message: bad } });
  try {
    const book = getBook(body.bookId);
    const provider = deps.provider || getProvider(env);
    const out = await S.solve(body, { env, provider, store, ip: clientIp(req), book, knowledge: deps.knowledge || knowledge });
    send(res, 200, out);
  } catch (err) {
    if (err && err.code === 'rate_limited') { res.setHeader('Retry-After', String(err.retryAfter || 60)); return send(res, 429, { error: { code: 'rate_limited', message: err.message } }); }
    if (err && err.status && err.code) return send(res, err.status, { error: { code: err.code, message: err.message } });
    if (err && err.code === 'bad_output') return send(res, 502, { error: { code: 'bad_output', message: err.message } });
    const { status, body: b } = toResponse(err);
    if (status >= 500) console.error('solve error:', b.error.code); // codes only; never content or secrets
    send(res, status, b);
  }
};
