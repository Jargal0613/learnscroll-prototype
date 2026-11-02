// Round 14 "My textbook": page map (numbers only, consistent with the cards), reading storage for Heat & Mass section
// keys, the viewer never sends the PDF anywhere, and the leak guard (no textbook files or text in the repo).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const P = require('../hmtpages.js');
const SD = require('../studydata.js');
const guard = require('../scripts/check-no-textbook.js');
const R = path.join(__dirname, '..');
const cards = ['heat-mass-transfer', 'heat-mass-transfer-ext'].flatMap(f => JSON.parse(fs.readFileSync(path.join(R, 'data', f + '.json'), 'utf8')).chapters.filter(c => c.n <= 5 && c.cards && c.cards.length).flatMap(c => c.cards.map(k => ({ ch: c.n, s: k.s }))));
const keyOf = (s, ch) => (s === 'Topic' ? `${ch}-topic` : s.replace('\u2013', '-'));

test('page map: numbers only, five chapters, every section inside its chapter, in order', () => {
  assert.equal(guard.pagesOnly(fs.readFileSync(path.join(R, 'hmtpages.js'), 'utf8')), true);
  assert.deepEqual(Object.keys(P.chapters), ['1', '2', '3', '4', '5']);
  assert.match(P.verifiedFile.sha256, /^[0-9a-f]{64}$/); assert.equal(P.verifiedFile.pdfOffset, 23);
  const keys = Object.keys(P.sections); assert.equal(keys.length, 45);
  for (const n of [1, 2, 3, 4, 5]) {
    const [a, b] = P.chapters[n], ks = keys.filter(k => k.startsWith(n + '-'));
    assert.ok(ks.includes(`${n}-topic`) && ks.includes(`${n}-summary`), `chapter ${n} has topic + summary`);
    const pages = ks.map(k => P.sections[k]);
    for (const p of pages) assert.ok(Number.isInteger(p) && p > a && p <= b, `${n}: page ${p} in ${a}–${b}`);
    assert.deepEqual(pages, [...pages].sort((x, y) => x - y), `chapter ${n} sections in page order`);
    if (n < 5) assert.equal(P.chapters[n + 1][0], b + 1);
  }
  // spot values checked by hand against the PDF (TOC and body headings)
  assert.deepEqual([P.sections['1-1'], P.sections['1-6'], P.sections['3-1'], P.sections['4-2'], P.sections['5-5']], [2, 17, 143, 244, 334]);
});

test('every existing Heat & Mass card in chapters 1–5 links to a mapped page (cards themselves untouched)', () => {
  assert.equal(cards.length, 85);
  for (const c of cards) assert.ok(P.sections[keyOf(c.s, c.ch)], `card section ${c.ch}:${c.s} mapped`);
  const h = f => require('crypto').createHash('sha256').update(fs.readFileSync(path.join(R, 'data', f))).digest('hex');
  assert.equal(h('heat-mass-transfer.json'), 'faa250245bfa8e4114d77aa86c640c18d1844fdfc23a6d52c3dd0a4b924797f1', 'card data unchanged');
  assert.equal(h('heat-mass-transfer-ext.json'), 'c04d958ba5c3a2182313080a2ce0ee6cb2aaa200f9eb3dc06b7f08f78eb896c0', 'chapter 3–5 card data unchanged');
});

test('study.reading accepts Heat & Mass section keys: sanitized, exported, merged, kept on overwrite; card progress separate', () => {
  const rd = { 'heat-mass-transfer': { section: '1-6', at: 9, done: { '1-1': 2, '1-topic': 3 }, marks: [{ section: '3-summary', note: 'resistances', at: 4 }] } };
  const base = { books: { 'heat-mass-transfer': { chapter: 2, card: 3, marks: {}, attempts: {}, review: {} } }, last: 'heat-mass-transfer', recent: [], sessions: [] };
  const s = SD.sanitizeStudy({ schema: SD.SCHEMA, ...base, reading: rd });
  assert.deepEqual(s.study.reading, rd); assert.equal(s.repaired, false); assert.equal(s.study.books['heat-mass-transfer'].card, 3);
  for (const bad of ['1-x', '1-', 'topic', '1_6', '1-6-1']) assert.equal(SD.sanitizeStudy({ schema: SD.SCHEMA, ...base, reading: { 'heat-mass-transfer': { section: bad, at: 1 } } }).study.reading['heat-mass-transfer'], undefined, bad);
  const exp = JSON.stringify({ app: 'learnscroll', version: 3, exportedAt: new Date(1e12).toISOString(), study: { ...base, reading: rd } });
  const r = SD.parse(exp, { bookIds: ['heat-mass-transfer'] });
  if (r.ok) assert.deepEqual(r.data.study.reading, rd); else assert.doesNotMatch(r.error, /reading/, r.error);
  const file = { study: { ...base, reading: { 'heat-mass-transfer': { section: '2-1', at: 20, done: { '2-1': 19 } } } }, tutor: { prefs: {}, conversations: {} }, session: null };
  const m = SD.merge({ study: { ...base, reading: rd }, tutor: { prefs: {}, conversations: {} }, session: null }, file).study.reading['heat-mass-transfer'];
  assert.equal(m.section, '2-1'); assert.deepEqual(Object.keys(m.done).sort(), ['1-1', '1-topic', '2-1']); assert.equal(m.marks.length, 1);
  assert.deepEqual(SD.overwrite({ study: { ...base, reading: rd }, tutor: { prefs: {}, conversations: {} }, session: null }, { study: base, tutor: { prefs: {} }, session: null }).study.reading, rd);
});

test('viewer keeps the PDF in the browser: no network calls, no tutor, no upload code', () => {
  const src = fs.readFileSync(path.join(R, 'textbook.js'), 'utf8').replace(/^\s*\/\/.*$/mg, '');
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /FormData/, /\/api\//, /Tutor\./]) assert.doesNotMatch(src, bad);
  assert.match(src, /indexedDB\.open/); assert.match(src, /URL\.createObjectURL/);
  const sdSrc = fs.readFileSync(path.join(R, 'studydata.js'), 'utf8'); assert.doesNotMatch(sdSrc, /learnscroll-textbook/, 'the PDF is never part of exported study data');
});

test('leak guard: no textbook PDF, scans, images or text in the repository tree', () => {
  const r = guard.run();
  assert.deepEqual(r.problems, []);
  assert.ok(guard.BAD_EXT.test('x/fig1-3.png') && guard.BAD_EXT.test('book.pdf') && guard.BAD_EXT.test('scan.JPG'));
  // the guard itself catches a planted file
  const p = path.join(R, 'data', '__planted.json');
  try { fs.writeFileSync(p, '%PDF-1.5 fake'); execGitAdd(p); assert.ok(guard.run().problems.some(x => x.includes('__planted'))); } finally { execGitRm(p); fs.rmSync(p, { force: true }); }
  if (!r.textChecked) console.log('# textbook text comparison skipped (no local PDF)');
});
const { execFileSync } = require('child_process');
function execGitAdd(p) { execFileSync('git', ['add', '-N', p], { cwd: R }); }
function execGitRm(p) { try { execFileSync('git', ['rm', '-q', '--cached', '-f', p], { cwd: R, stdio: 'ignore' }); } catch (e) {} }
