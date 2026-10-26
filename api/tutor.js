// POST /api/tutor — Vercel Node serverless function (no framework).
const { answer, status } = require('./_lib/tutor');
const { toResponse, E } = require('./_lib/errors');
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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'GET') { res.statusCode = 200; return res.end(JSON.stringify({ ...status(), solver: solverOn() })); }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: { code: 'method_not_allowed', message: 'Use POST (or GET for status).' } }));
  }
  try {
    const out = await answer(await readBody(req));
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (err) {
    const { status, body } = toResponse(err);
    if (status >= 500) console.error('tutor error:', body.error.code); // codes only; never content or secrets
    res.statusCode = status;
    res.end(JSON.stringify(body));
  }
};
