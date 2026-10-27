// Concept connections: every id is a real card, kinds are known, no duplicates or self-links, and no cycles.
const test = require('node:test'), assert = require('node:assert');
global.document = { addEventListener() {} };
const CONN = require('../connections.js'), book = require('../data/heat-mass-transfer.json');
const card = id => { const m = /^c(\d+)-(\d+)$/.exec(id); const ch = m && book.chapters.find(c => c.n === Number(m[1])); return ch && Array.isArray(ch.cards) && ch.cards[Number(m[2]) - 1]; };
test('20–30 curated links between real cards', () => {
  assert.equal(CONN.book, 'heat-mass-transfer');
  assert.ok(CONN.links.length >= 20 && CONN.links.length <= 30, `${CONN.links.length}`);
  const seen = new Set();
  for (const l of CONN.links) {
    assert.ok(card(l.from), `from ${l.from}`); assert.ok(card(l.to), `to ${l.to}`);
    assert.ok(['prereq', 'equation', 'application'].includes(l.kind)); assert.notEqual(l.from, l.to);
    const k = [l.from, l.to].sort().join('|'); assert.ok(!seen.has(k), `duplicate ${k}`); seen.add(k);
  }
});
test('no cycles', () => {
  const out = {}; for (const l of CONN.links) (out[l.from] = out[l.from] || []).push(l.to);
  const st = {}; const dfs = n => { if (st[n] === 1) assert.fail(`cycle through ${n}`); if (st[n] === 2) return; st[n] = 1; (out[n] || []).forEach(dfs); st[n] = 2; };
  Object.keys(out).forEach(dfs);
});
test('related-equation links join cards that both have an equation', () => {
  for (const l of CONN.links.filter(x => x.kind === 'equation')) assert.ok(card(l.from).eq && card(l.to).eq, `${l.from}->${l.to}`);
});
