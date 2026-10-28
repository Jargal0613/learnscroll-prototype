// Heat & Mass Transfer Chapters 3-5: added from data/heat-mass-transfer-ext.json without touching Chapters 1-2.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const SD = require('../studydata.js');
const base = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../data/heat-mass-transfer.json'), 'utf8'));
const ext = require('../data/heat-mass-transfer-ext.json');
const TITLES = { 3: 'Steady Heat Conduction', 4: 'Transient Heat Conduction', 5: 'Numerical Methods in Heat Conduction' }; // checked against the textbook contents
test('merge adds Chapters 3-5 and leaves Chapters 1-2 and later chapters exactly as they were', () => {
  const b = base(), m = SD.mergeBookExt(base(), ext);
  for (const n of [1, 2]) assert.deepEqual(m.chapters.find(c => c.n === n), b.chapters.find(c => c.n === n));
  for (const n of [6, 7, 14]) assert.deepEqual(m.chapters.find(c => c.n === n), b.chapters.find(c => c.n === n));
  for (const n of [3, 4, 5]) { const c = m.chapters.find(x => x.n === n); assert.equal(c.title, TITLES[n]); assert.ok(c.cards.length >= 10 && c.quiz.length >= 5 && c.desc); }
});
test('merge never overwrites existing cards and rejects a chapter whose title disagrees', () => {
  const b = base(); const ch1 = JSON.stringify(b.chapters[0]);
  SD.mergeBookExt(b, { extends: b.id, chapters: [{ n: 1, title: b.chapters[0].title, cards: [{ s: 'x', h: 'x', t: 'x' }] }, { n: 6, title: 'Wrong title', cards: [{ s: 'x', h: 'x', t: 'x' }] }] });
  assert.equal(JSON.stringify(b.chapters[0]), ch1); assert.ok(!b.chapters.find(c => c.n === 6).cards);
  assert.equal(SD.mergeBookExt(b, { extends: 'other', chapters: [] }), b); assert.equal(SD.mergeBookExt(b, null), b);
});
test('every card and question carries a section/equation reference from its own chapter', () => {
  for (const ch of ext.chapters) {
    for (const c of ch.cards) {
      assert.ok(c.h && c.t && c.t.length < 600, `${ch.n}: ${c.h}`);
      assert.ok(c.s === 'Topic' || new RegExp(`^${ch.n}–\\d+$`).test(c.s), `${c.h}: section ${c.s}`);
      if (c.ref) { assert.match(c.ref, /^(Eqs?|Sec)\. /, `${c.h}: ${c.ref}`); for (const n of c.ref.match(/\d+–\d+/g)) assert.equal(n.split('–')[0], String(ch.n), `${c.h}: ${c.ref}`); }
      if (c.eq) assert.ok(c.ref, `${c.h}: an equation needs its textbook number`);
    }
    for (const q of ch.quiz) {
      assert.ok(q.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4 && q.why, q.q);
      assert.match(q.ref, new RegExp(`^Sec\\. ${ch.n}–\\d+$`)); assert.equal(new Set(q.options).size, 4);
    }
  }
});
test('stable ids: server lookup finds c3-1 … c5-11 and quiz ids; Chapter 1 ids unchanged', () => {
  const B = require('../api/_lib/books'), b = B.getBook('heat-mass-transfer');
  assert.equal(B.findCard(b, 3, 'c3-1').h, 'Steady conduction in a plane wall');
  assert.equal(B.findCard(b, 5, 'c5-11').h, 'Controlling numerical error');
  assert.equal(B.findCard(b, 4, 'c4-q5').kind, 'quiz');
  assert.equal(B.findCard(b, 1, 'c1-13').h, 'Conduction: Fourier’s law');
});
// No book text: if the private source text is on this machine, no 10-word run of any card appears in it verbatim.
const SRC = '/workspace/books/text/heat-mass-transfer.txt';
test('cards are paraphrased (no 10-word run copied from the textbook)', { skip: !fs.existsSync(SRC) && 'textbook text not available here' }, () => {
  const norm = t => t.toLowerCase().replace(/\\\(|\\\)|\\[a-z]+|[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const src = norm(fs.readFileSync(SRC, 'utf8'));
  for (const ch of ext.chapters) for (const c of [...ch.cards.map(x => x.t), ...ch.quiz.map(x => x.why)]) {
    const w = norm(c).split(' ');
    for (let i = 0; i + 10 <= w.length; i++) assert.ok(!src.includes(w.slice(i, i + 10).join(' ')), `copied: “${w.slice(i, i + 10).join(' ')}”`);
  }
});
