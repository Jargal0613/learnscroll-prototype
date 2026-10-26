// Problem solver design prototype: all mocked, no network, no paid calls.
const test = require('node:test'), assert = require('node:assert');
const S = require('../api/_lib/solver');
const book = { id: 'heat-mass-transfer', title: 'Heat and Mass Transfer', edition: '5th edition' };
const kb = { forBook: id => (id === 'heat-mass-transfer' ? { vectorStoreId: 'vs_test', fileId: 'f' } : null) };
const mapStore = () => { const m = new Map(); return { incr: async k => { m.set(k, (m.get(k) || 0) + 1); return m.get(k); } }; };
const good = JSON.stringify({ givens: [{ symbol: 'k', value: '0.8', unit: 'W/m·K' }], unknown: 'q', assumptions: ['steady'], equations: [{ tex: 'q=-k\\,dT/dx', source: 'Ch 1' }], steps: ['q = 0.8 × 50 = 40 W/m²'], result: { value: '40', unit: 'W/m²' }, unitCheck: 'W/m·K × K/m = W/m²', sourceNote: 'Ch 1' });
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
  for (let i = 0; i < 3; i++) assert.ok((await S.limit(st, { ip: 'a', now })).ok);
  const r = await S.limit(st, { ip: 'a', now }); assert.equal(r.ok, false); assert.equal(r.reason, 'minute'); assert.ok(r.retryAfter > 0 && r.retryAfter <= 60);
  assert.ok((await S.limit(st, { ip: 'b', now })).ok, 'other students unaffected');
  const st2 = mapStore(); let t = now; let res;
  for (let i = 0; i < 21; i++) { res = await S.limit(st2, { ip: 'c', now: t }); t += 61000; }
  assert.equal(res.ok, false); assert.equal(res.reason, 'day');
  const st3 = mapStore(); let g;
  for (let i = 0; i < 501; i++) g = await S.limit(st3, { ip: `ip${i}`, now });
  assert.equal(g.reason, 'global');
  assert.deepEqual(await S.limit({ incr: async () => { throw new Error('down'); } }, { ip: 'a', now }), { ok: false, reason: 'limiter_unavailable', retryAfter: 60 });
});
