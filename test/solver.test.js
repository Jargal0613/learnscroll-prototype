// Problem solver design prototype: all mocked, no network, no paid calls.
const test = require('node:test'), assert = require('node:assert');
const S = require('../api/_lib/solver');
const book = { id: 'heat-mass-transfer', title: 'Heat and Mass Transfer', edition: '5th edition' };
const kb = { forBook: id => (id === 'heat-mass-transfer' ? { vectorStoreId: 'vs_test', fileId: 'f' } : null) };
const mapStore = () => { const m = new Map(); return { incr: async k => { m.set(k, (m.get(k) || 0) + 1); return m.get(k); } }; };
const good = JSON.stringify({ givens: [{ symbol: 'k', value: '0.8', unit: 'W/m·K' }], unknown: 'q', assumptions: ['steady'], equations: [{ tex: 'q=-k\\,dT/dx', source: 'Ch 1' }], steps: ['q = 0.8 × 50 = 40 W/m²'], result: { value: '40', unit: 'W/m²' }, unitCheck: 'W/m·K × K/m = W/m²', sanityCheck: 'Positive and modest for a thin wall.', fromTextbook: 'Fourier law for 1-D conduction.', additionalExplanation: '', sourceNote: 'Ch 1' });
test('disabled by default: no flag, no call', async () => {
  let called = false; const provider = { respond: async () => { called = true; } };
  assert.equal(S.enabled({}), false);
  await assert.rejects(S.solve({ problem: 'x'.repeat(30) }, { env: {}, provider, store: mapStore(), ip: '1', book, knowledge: kb }), e => e.status === 404);
  assert.equal(called, false);
});
test('validate: ids only, length limits', () => {
  assert.match(S.validate({ bookId: 'nope', problem: 'x'.repeat(30) }, { bookIds: ['heat-mass-transfer'] }), /Unknown book/);
  assert.match(S.validate({ bookId: 'heat-mass-transfer', problem: 'short' }, { bookIds: ['heat-mass-transfer'] }), /at least/);
  assert.match(S.validate({ bookId: 'heat-mass-transfer', problem: 'x'.repeat(3001) }, { bookIds: ['heat-mass-transfer'] }), /too long/);
  assert.equal(S.validate({ bookId: 'heat-mass-transfer', problem: 'A wall 0.2 m thick has k = 0.8 W/m·K…' }, { bookIds: ['heat-mass-transfer'] }), null);
});
test('mocked solve: this book’s store only, strict JSON schema, parsed result', async () => {
  let seen; const provider = { respond: async a => { seen = a; return { text: good, usage: { input_tokens: 8500, output_tokens: 2500 } }; } };
  const r = await S.solve({ problem: 'A plane wall 0.2 m thick, k = 0.8 W/m·K, ΔT = 10 K. Find q.' }, { env: { SOLVER_ENABLED: '1' }, provider, store: mapStore(), ip: '1', book, knowledge: kb });
  assert.equal(seen.vectorStoreId, 'vs_test'); assert.equal(seen.format.strict, true); assert.match(seen.instructions, /never invent property values/);
  assert.equal(r.solution.result.unit, 'W/m²');
  await assert.rejects(S.solve({ problem: 'x'.repeat(30) }, { env: { SOLVER_ENABLED: '1' }, provider, store: mapStore(), ip: '1', book: { ...book, id: 'koretsky-thermo' }, knowledge: kb }), e => e.code === 'book_not_available');
  assert.throws(() => S.parse('{"steps":[]}'), e => e.code === 'bad_output'); assert.throws(() => S.parse('nope'), e => e.code === 'bad_output');
});
test('limits: per minute, per day, global; fail closed when the store is down', async () => {
  const st = mapStore(), now = Date.UTC(2026, 9, 27, 10, 0, 5);
  for (let i = 0; i < 2; i++) assert.ok((await S.limit(st, { ip: 'a', now })).ok);
  const r = await S.limit(st, { ip: 'a', now }); assert.equal(r.ok, false); assert.equal(r.reason, 'minute'); assert.ok(r.retryAfter > 0 && r.retryAfter <= 60);
  assert.ok((await S.limit(st, { ip: 'b', now })).ok, 'other students unaffected');
  const st2 = mapStore(); let t = now; let res;
  for (let i = 0; i < 11; i++) { res = await S.limit(st2, { ip: 'c', now: t }); t += 61000; }
  assert.equal(res.ok, false); assert.equal(res.reason, 'day');
  const st3 = mapStore(); let g;
  for (let i = 0; i < 501; i++) g = await S.limit(st3, { ip: `ip${i}`, now });
  assert.equal(g.reason, 'global');
  assert.deepEqual(await S.limit({ incr: async () => { throw new Error('down'); } }, { ip: 'a', now }), { ok: false, reason: 'limiter_unavailable', retryAfter: 60 });
});

// Route: fail closed and rate limits (mocked store and provider; no network).
const handler = require('../api/solve');
function call(method, body, deps, ip = '9.9.9.9') {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ status: this.statusCode, headers: this.headers, body: JSON.parse(s) }); } };
    handler({ method, body, headers: { 'x-real-ip': ip } }, res, deps);
  });
}
const ON = { SOLVER_ENABLED: '1' };
const prov = () => ({ calls: 0, async respond() { this.calls++; return { text: good, usage: { input: 1, output: 1 } }; } });
const okBody = { bookId: 'heat-mass-transfer', problem: 'A wall 0.2 m thick with k = 0.8 W/m K has 50 K across it. Find q.' };
test('route: 404 when the flag is off', async () => { assert.equal((await call('POST', okBody, { env: {}, store: mapStore(), provider: prov(), knowledge: kb })).status, 404); });
test('route: fail closed without limiter config, and when the store throws', async () => {
  const p = prov();
  assert.equal((await call('POST', okBody, { env: ON, store: null, provider: p, knowledge: kb })).status, 503);
  const r = await call('POST', okBody, { env: ON, store: { incr: async () => { throw new Error('down'); } }, provider: p, knowledge: kb });
  assert.equal(r.status, 429); assert.equal(p.calls, 0);
});
test('route: 2/min per IP, then 429 with Retry-After', async () => {
  const st = mapStore(), p = prov(), d = { env: ON, store: st, provider: p, knowledge: kb };
  assert.equal((await call('POST', okBody, d)).status, 200);
  assert.equal((await call('POST', okBody, d)).status, 200);
  const r = await call('POST', okBody, d); assert.equal(r.status, 429); assert.ok(Number(r.headers['Retry-After']) > 0);
  assert.equal(p.calls, 2);
});
test('limits: 10/day per IP and 200/day global', async () => {
  assert.deepEqual(S.LIMITS, { perMinute: 2, perDay: 10, globalPerDay: 200 });
  const st = mapStore(); let t = Date.UTC(2026, 9, 27, 1), n = 0;
  for (let i = 0; i < 11; i++) { const r = await S.limit(st, { ip: 'a', now: t + i * 61000 }); if (r.ok) n++; else assert.equal(r.reason, 'day'); }
  assert.equal(n, 10);
  const g = mapStore(); let ok = 0;
  for (let i = 0; i < 201; i++) { const r = await S.limit(g, { ip: 'ip' + i, now: t }); if (r.ok) ok++; else assert.equal(r.reason, 'global'); }
  assert.equal(ok, 200);
});
test('upstash store: null when unconfigured; throws on HTTP error', async () => {
  const { upstashStore } = require('../api/_lib/upstash');
  assert.equal(upstashStore({}), null);
  const s = upstashStore({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }, async () => ({ ok: false, status: 500 }));
  await assert.rejects(s.incr('k', 60));
  const s2 = upstashStore({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }, async () => ({ ok: true, json: async () => [{ result: 3 }, { result: 1 }] }));
  assert.equal(await s2.incr('k', 60), 3);
});
test('route GET: status + own counters, read-only, works while disabled', async () => {
  const m = new Map(); const st = { incr: async k => { m.set(k, (m.get(k) || 0) + 1); return m.get(k); }, peek: async ks => ks.map(k => m.get(k) || 0) };
  await S.limit(st, { ip: '9.9.9.9' });
  const r = await call('GET', undefined, { env: {}, store: st, provider: prov(), knowledge: kb });
  assert.equal(r.status, 200); assert.equal(r.body.enabled, false); assert.deepEqual(r.body.usage, { ip: '9.9.9.9', minute: 1, day: 1, global: 1 });
  assert.equal(m.size, 3, 'GET does not increment');
});

// Retrieval states: decided from the File Search call, never from the model. Citations without passages are cleared.
const LONG = 'Fourier law states that the rate of heat conduction through a plane layer is proportional to the temperature difference across the layer and the heat transfer area.';
const kbF = { forBook: () => ({ vectorStoreId: 'vs_test', fileId: 'f-book' }) };
const out3 = {
  retrieved: { searched: true, results: 2, passages: [{ fileId: 'f-book', score: 0.9, text: LONG }, { fileId: 'other', score: 0.95, text: LONG + ' other' }] },
  none: { searched: true, results: 0, passages: [] },
  failed: { searched: true, searchFailed: true, results: 0, passages: [] },
  notRun: { searched: false, results: 0, passages: [] },
};
for (const [name, o] of Object.entries(out3)) {
  test(`retrieval state via route: ${name}`, async () => {
    const p = { async respond() { return { text: good, usage: { input: 1, output: 1 }, ...o }; } };
    const r = await call('POST', okBody, { env: ON, store: mapStore(), provider: p, knowledge: kbF }, 'ip-' + name);
    assert.equal(r.status, 200);
    const want = name === 'retrieved' ? 'retrieved' : name === 'none' ? 'none' : 'failed';
    assert.equal(r.body.retrieval.status, want);
    if (want === 'retrieved') {
      assert.equal(r.body.retrieval.passages.length, 1, 'only this book file'); assert.equal(r.body.solution.equations[0].source, 'Ch 1');
    } else {
      assert.deepEqual(r.body.retrieval.passages, []);
      assert.ok(r.body.solution.equations.every(e => e.source === ''), 'no equation citation without retrieval');
      assert.equal(r.body.solution.fromTextbook, ''); assert.equal(r.body.solution.sourceNote, '');
      assert.match(r.body.solution.additionalExplanation, /Fourier law for 1-D/, 'model text kept as additional explanation');
    }
  });
}
