// POST /api/tutor — Vercel Node serverless function (no framework).
const { answer, status } = require('./_lib/tutor');
const { toResponse, E } = require('./_lib/errors');
const { validate } = require('./_lib/validate');
const { getProvider } = require('./_lib/providers');
const solver = require('./_lib/solver');
const { upstashStore } = require('./_lib/upstash');
// The problem solver is offered only when it is switched on AND its rate limiter is configured (fail closed).
const solverOn = (env = process.env) => solver.enabled(env) && !!upstashStore(env);

const MAX_BODY = 64 * 1024;

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const s = String(req.body);
    if (s.length > MAX_BODY) throw E.bad('Request is too large.');
    try { return JSON.parse(s); } catch (e) { throw E.bad('Request body must be valid JSON.'); }
  }
  let size = 0; const parts = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw E.bad('Request is too large.'); parts.push(c); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8') || 'null'); } catch (e) { throw E.bad('Request body must be valid JSON.'); }
}

function clientIp(req) { const h = req.headers || {}; return String(h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64); }

// Every tutor message (reader, quizzes, formulas, calculator, practice, progress, sheets, practice hints) goes through
// ONE limiter: the problem solver's Redis counters (2/min and 10/day per IP, 200/day overall). One message = one
// request. A message is counted after it passes validation and before the paid call; a model or network failure
// after that still counts (no free retries), and the server never retries. Fail closed without the limiter.
async function gate(req, deps) {
  const env = deps.env || process.env;
  const store = deps.store !== undefined ? deps.store : upstashStore(env);
  if (!store) throw Object.assign(new Error('The tutor is temporarily unavailable.'), { status: 503, code: 'limiter_unavailable' });
  const lim = await solver.limit(store, { ip: clientIp(req) });
  if (lim.ok) return;
  const msg = { minute: 'You’ve sent 2 questions this minute. Wait a minute and try again.', day: 'You’ve reached today’s 10-question limit for this device. It resets at midnight UTC.', global: 'The tutor has reached its daily limit for all users. Try again tomorrow (UTC).', limiter_unavailable: 'The tutor is temporarily unavailable.' }[lim.reason];
  throw Object.assign(new Error(msg), { status: lim.reason === 'limiter_unavailable' ? 503 : 429, code: lim.reason === 'limiter_unavailable' ? 'limiter_unavailable' : 'rate_limited', reason: lim.reason, retryAfter: lim.retryAfter });
}

module.exports = async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'GET') { res.statusCode = 200; return res.end(JSON.stringify({ ...status(), solver: solverOn() })); }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: { code: 'method_not_allowed', message: 'Use POST (or GET for status).' } }));
  }
  try {
    let body = await readBody(req);
    let hint = false;
    if (body && typeof body === 'object' && body.practiceHint === true) { const { practiceHint: _h, ...rest } = body; body = rest; hint = true; }
    try {
      if (hint && !solver.enabled(deps.env || process.env)) throw Object.assign(new Error('Tutor hints for practice aren’t available right now.'), { status: 404, code: 'not_available' });
      if (!deps.answer) { validate(body); getProvider(deps.env || process.env); } // bad or unconfigured: rejected before counting
      await gate(req, deps);
    } catch (g) {
      if (!g.status) throw g;
      if (g.retryAfter) res.setHeader('Retry-After', String(g.retryAfter));
      res.statusCode = g.status; return res.end(JSON.stringify({ error: { code: g.code, reason: g.reason || g.code, message: g.message } }));
    }
    const out = await (deps.answer || answer)(body);
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (err) {
    const { status, body } = toResponse(err);
    if (status >= 500) console.error('tutor error:', body.error.code); // codes only; never content or secrets
    res.statusCode = status;
    res.end(JSON.stringify(body));
  }
};
