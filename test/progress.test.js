// My progress: descriptive, deterministic, "not enough data" instead of zeros, no score.
const test = require('node:test'), assert = require('node:assert');
const Progress = require('../progress.js'), book = require('../data/heat-mass-transfer.json');
const NOW = new Date(2026, 9, 20, 12).getTime(), D = 86400000;
test('empty data: nothing to report, no zero percentages', () => {
  const m = Progress.compute({ books: {} }, book, NOW);
  assert.equal(m.cards.opened, 0); assert.equal(m.quiz, null); assert.equal(m.needs.length, 0); assert.equal(m.recentTotal, 0); assert.equal(m.practice.tried, 0);
  assert.ok(!('score' in m) && !('mastery' in m) && !('streak' in m));
});
test('counts opened cards, quiz accuracy from 5 answers, needs review, last 7 days; deterministic', () => {
  const s = { books: { 'heat-mass-transfer': { seen: { 1: 9 }, done: { 2: true }, attempts: { 'c1-q1': [{ k: 0, ok: false, at: NOW - D }, { k: 1, ok: true, at: NOW - D }], 'c1-q2': [{ k: 0, ok: false, at: NOW - 3 * D }], 'c2-q1': [{ k: 2, ok: true, at: NOW - 10 * D }, { k: 2, ok: true, at: NOW }] }, review: { 'c1-4': { r: 'got', at: NOW - D } }, marks: { 'c1-5': { d: true } } } },
    practice: { 'ex1-2': { attempts: [{ step: 'calculation', ok: true, at: NOW }], hints: {}, revealed: [], struggled: ['units'], solved: true, updated: NOW } } };
  const a = Progress.compute(s, book, NOW), b = Progress.compute(s, book, NOW);
  assert.deepEqual(a, b);
  const ch2 = book.chapters.find(c => c.n === 2).cards.length;
  assert.equal(a.cards.opened, 10 + ch2); assert.equal(a.cards.reviewedGot, 1);
  assert.deepEqual(a.quiz, { questions: 3, latestOk: 2, tries: 5, triesOk: 3, pct: 60 });
  assert.deepEqual(a.needs.map(x => x.id).sort(), ['c1-5', 'c1-q2'].sort());
  assert.equal(a.recent.length, 7); assert.equal(a.recent[6].count, 2); assert.equal(a.recent[5].count, 3); assert.equal(a.recentTotal, 6);
  assert.equal(a.practice.solved, 1); assert.equal(a.practice.struggled[0].id, 'ex1-2');
});
test('fewer than 5 quiz answers is not enough data', () => {
  const s = { books: { 'heat-mass-transfer': { attempts: { 'c1-q1': [{ k: 0, ok: true, at: NOW }] } } } };
  assert.equal(Progress.compute(s, book, NOW).quiz, null); assert.equal(Progress.compute(s, book, NOW).quizTries, 1);
});
