const test = require('node:test');
const assert = require('node:assert/strict');
const SD = require('../studydata');
const IDS = ['heat-mass-transfer', 'koretsky-thermo'];
const T1 = 1761500000000, T2 = T1 + 60000;

function localSample() {
  return SD.fromStorage(JSON.stringify({
    books: { 'heat-mass-transfer': { chapter: 1, card: 4, done: { 1: true }, marks: { 'c1-2': { b: true, d: false } }, seen: { 1: 5 }, notes: { 'c1-2': { text: 'mine', at: T1 } }, review: { 'c1-2': { r: 'again', at: T1 } } } },
    last: 'heat-mass-transfer', recent: [{ book: 'heat-mass-transfer', chapter: 1, card: 4, at: T1 }],
  }), JSON.stringify({ _prefs: { style: 'math' }, 'heat-mass-transfer': { conversationId: 'cabc', messages: [{ role: 'user', content: 'q', at: T1 }], draft: '', scope: 'card' } }));
}
const file = (over = {}) => JSON.stringify({ app: 'learnscroll', version: 1, exportedAt: new Date(T2).toISOString(), study: { books: {}, last: null, recent: [] }, tutor: { prefs: {} }, ...over });

test('export round-trip: build -> parse gives the same data back', () => {
  const local = localSample();
  const out = SD.build(local, { conversations: true, now: new Date(T2) });
  assert.equal(out.app, 'learnscroll'); assert.equal(out.version, 3); assert.equal(out.exportedAt, new Date(T2).toISOString());
  const r = SD.parse(JSON.stringify(out), { bookIds: IDS });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.data.study.books['heat-mass-transfer'].notes, local.study.books['heat-mass-transfer'].notes);
  assert.equal(r.data.tutor.prefs.style, 'math');
  assert.equal(r.data.tutor.conversations['heat-mass-transfer'].messages.length, 1);
  assert.equal(SD.parse(JSON.stringify(SD.build(local)), { bookIds: IDS }).data.tutor.conversations, undefined, 'conversations optional');
  const c = SD.counts(r.data);
  assert.deepEqual([c.books, c.bookmarks, c.difficult, c.notes, c.reviews, c.chaptersDone, c.recent, c.conversations, c.style], [1, 1, 0, 1, 1, 1, 1, 1, 'math']);
});

test('parse rejects malformed files with a clear message', () => {
  const bad = [
    ['not json {', /not valid JSON/], ['[]', /not a LearnScroll export/], ['null', /not a LearnScroll export/],
    [JSON.stringify({ version: 1 }), /app id/], [file({ app: 'other' }), /app id/],
    [file({ version: 4 }), /newer version of LearnScroll/], [file({ version: '1' }), /Unsupported export version/],
    [file({ exportedAt: 'yesterday' }), /ISO date/], [file({ extra: 1 }), /Unexpected field "extra"/],
    [file({ study: [] }), /"study" must be an object/],
    [file({ study: { books: { 'nope-book': {} } } }), /Unknown book/],
    [file({ study: { books: { 'heat-mass-transfer': { marks: { 'x1': { b: true } } } } } }), /Invalid key "x1"/],
    [file({ study: { books: { 'heat-mass-transfer': { marks: { 'c1-2': { b: 'yes' } } } } } }), /true\/false/],
    [file({ study: { books: { 'heat-mass-transfer': { notes: { 'c1-2': { text: '', at: T1 } } } } } }), /non-empty text/],
    [file({ study: { books: { 'heat-mass-transfer': { notes: { 'c1-2': { text: 'x'.repeat(4001), at: T1 } } } } } }), /max 4000/],
    [file({ study: { books: { 'heat-mass-transfer': { review: { 'c1-2': { r: 'maybe', at: T1 } } } } } }), /"got" or "again"/],
    [file({ study: { books: { 'heat-mass-transfer': { card: -1 } } } }), /whole number/],
    [file({ study: { books: { 'heat-mass-transfer': { evil: 1 } } } }), /Unexpected field "evil"/],
    [file({ study: { books: {}, recent: [{ book: 'heat-mass-transfer', chapter: 1, card: 0 }] } }), /needs chapter, card and at/],
    [file({ tutor: { prefs: { style: 'eli5' } } }), /answer style/],
    [file({ tutor: { conversations: { 'heat-mass-transfer': { conversationId: 'a b', messages: [] } } } }), /conversationId/],
    [file({ tutor: { conversations: { 'heat-mass-transfer': { conversationId: 'ab', messages: [{ role: 'system', content: 'x' }] } } } }), /role user\|assistant/],
    [123, /could not be read as text/], ['x'.repeat(5 * 1024 * 1024 + 1), /too large/],
  ];
  for (const [txt, re] of bad) { const r = SD.parse(txt, { bookIds: IDS }); assert.equal(r.ok, false, String(txt).slice(0, 80)); assert.match(r.error, re); }
  assert.ok(SD.parse(file(), { bookIds: IDS }).ok);
});

test('merge: union of marks, newer note/review wins, progress takes max, recent combined', () => {
  const local = localSample();
  const inc = SD.parse(file({
    study: {
      books: {
        'heat-mass-transfer': { chapter: 2, card: 1, done: { 2: true }, marks: { 'c1-2': { b: false, d: true }, 'c1-3': { b: true } }, seen: { 1: 3, 2: 7 }, notes: { 'c1-2': { text: 'theirs', at: T2 }, 'c1-5': { text: 'new', at: T1 } }, review: { 'c1-2': { r: 'got', at: T1 - 5 } } },
        'koretsky-thermo': { chapter: 1, card: 0, notes: { 'c1-1': { text: 'k', at: T1 } } },
      },
      last: 'koretsky-thermo',
      recent: [{ book: 'heat-mass-transfer', chapter: 2, card: 1, at: T2 }, { book: 'koretsky-thermo', chapter: 1, card: 0, at: T1 - 10 }],
    },
    tutor: { prefs: { style: 'simple' }, conversations: { 'koretsky-thermo': { conversationId: 'k1', messages: [{ role: 'user', content: 'hi', at: T1 }] } } },
  }), { bookIds: IDS }).data;
  const m = SD.merge(local, inc), h = m.study.books['heat-mass-transfer'];
  assert.deepEqual(h.marks, { 'c1-2': { b: true, d: true }, 'c1-3': { b: true } });
  assert.equal(h.notes['c1-2'].text, 'theirs'); assert.equal(h.notes['c1-5'].text, 'new');
  assert.equal(h.review['c1-2'].r, 'again', 'older incoming review loses');
  assert.deepEqual(h.done, { 1: true, 2: true });
  assert.deepEqual(h.seen, { 1: 5, 2: 7 });
  assert.deepEqual([h.chapter, h.card], [2, 1], 'resume from the more recently studied side');
  assert.ok(m.study.books['koretsky-thermo'].notes['c1-1']);
  assert.equal(m.study.recent[0].chapter, 2); assert.equal(m.study.recent.length, 3); assert.equal(m.study.last, 'heat-mass-transfer');
  assert.equal(m.tutor.prefs.style, 'math', 'this browser keeps its style');
  assert.ok(m.tutor.conversations['heat-mass-transfer'] && m.tutor.conversations['koretsky-thermo']);
  // merge never loses local data
  const lc = SD.counts(local), mc = SD.counts(m);
  for (const k of ['bookmarks', 'notes', 'reviews', 'chaptersDone']) assert.ok(mc[k] >= lc[k], k);
  // merged result passes strict validation and round-trips through storage
  const st = SD.toStorage(m);
  assert.ok(SD.parse(JSON.stringify(SD.build(SD.fromStorage(st.study, st.tutor), { conversations: true })), { bookIds: IDS }).ok);
});

test('overwrite replaces study data; keeps local conversations unless the file has them', () => {
  const local = localSample();
  const inc = SD.parse(file({ study: { books: { 'koretsky-thermo': { chapter: 1, card: 2 } }, last: 'koretsky-thermo', recent: [] } }), { bookIds: IDS }).data;
  const o = SD.overwrite(local, inc);
  assert.deepEqual(Object.keys(o.study.books), ['koretsky-thermo']);
  assert.ok(o.tutor.conversations['heat-mass-transfer'], 'conversations kept when file has none');
  assert.deepEqual(o.tutor.prefs, {});
  const inc2 = SD.parse(file({ tutor: { prefs: {}, conversations: {} } }), { bookIds: IDS }).data;
  assert.deepEqual(SD.overwrite(local, inc2).tutor.conversations, {});
});

test('study sessions: validated, merged by start time, counted', () => {
  const sess = (start, seen) => ({ book: 'heat-mass-transfer', minutes: 20, start, end: start + 600000, seconds: 600, seen, marked: 1, queued: 30 });
  const ok = SD.parse(file({ study: { books: {}, recent: [], sessions: [sess(T1, 5)], sessionPrefs: { book: 'heat-mass-transfer', minutes: 20 } } }), { bookIds: IDS });
  assert.ok(ok.ok, ok.error);
  assert.equal(SD.counts(ok.data).sessions, 1);
  for (const bad of [{ ...sess(T1, 5), minutes: 15 }, { ...sess(T1, 5), seen: -1 }, { ...sess(T1, 5), streak: 3 }, { ...sess(T1, 5), book: 'x' }])
    assert.equal(SD.parse(file({ study: { books: {}, sessions: [bad] } }), { bookIds: IDS }).ok, false);
  assert.equal(SD.parse(file({ study: { books: {}, sessionPrefs: { book: 'heat-mass-transfer', minutes: 45 } } }), { bookIds: IDS }).ok, false);
  const local = SD.fromStorage(JSON.stringify({ books: {}, recent: [], sessions: [sess(T1, 5)] }), '{}');
  const m = SD.merge(local, SD.parse(file({ study: { books: {}, recent: [], sessions: [sess(T1, 5), sess(T2, 9)] } }), { bookIds: IDS }).data);
  assert.deepEqual(m.study.sessions.map(x => x.seen), [9, 5]);
});

test('sanitizeStudy: valid data untouched; malformed pieces dropped and flagged; never throws', () => {
  const good = JSON.parse(SD.fromStorage(JSON.stringify({ books: { 'heat-mass-transfer': { chapter: 1, card: 3, done: { 1: true }, marks: { 'c1-2': { b: true } }, seen: { 1: 4 }, notes: { 'c1-2': { text: 'n', at: T1 } }, review: {} } }, last: 'heat-mass-transfer', recent: [{ book: 'heat-mass-transfer', chapter: 1, card: 3, at: T1 }], sessions: [] }), '{}').study && JSON.stringify(localSample().study));
  const r = SD.sanitizeStudy(good);
  assert.equal(r.repaired, false);
  assert.deepEqual(r.study.books['heat-mass-transfer'].notes, good.books['heat-mass-transfer'].notes);
  assert.deepEqual(SD.sanitizeStudy({}), { study: { schema: 3, books: {}, last: null, recent: [], sessions: [], formulas: {} }, repaired: false });
  const bad = SD.sanitizeStudy({ books: { 'heat-mass-transfer': { chapter: 'x', card: -3, marks: 'oops', notes: { 'c1-2': { text: 5 }, 'c1-3': { text: 'ok', at: T1 } }, seen: { 1: 'far' } }, 'bad id!': {}, 'koretsky-thermo': 7 }, recent: 'nope', last: 42 });
  assert.equal(bad.repaired, true);
  const h = bad.study.books['heat-mass-transfer'];
  assert.deepEqual([h.chapter, h.card, h.marks, h.seen, Object.keys(h.notes)], [null, 0, {}, {}, ['c1-3']]);
  assert.deepEqual(Object.keys(bad.study.books), ['heat-mass-transfer']);
  assert.deepEqual([bad.study.recent, bad.study.last], [[], null]);
  for (const x of [null, 5, 'str', [], [1, 2]]) assert.doesNotThrow(() => SD.sanitizeStudy(x));
  assert.equal(SD.sanitizeStudy([1]).repaired, true);
});

test('quiz attempts: validated strictly, merged as a union by time, counted as attempts and mistakes', () => {
  const A = (k, ok, at) => ({ k, ok, at });
  const f = attempts => file({ study: { books: { 'heat-mass-transfer': { attempts } } } });
  const good = SD.parse(f({ 'c1-q1': [A(1, false, T1), A(2, true, T2)], 'c1-q2': [A(0, false, T1)] }), { bookIds: IDS });
  assert.ok(good.ok, good.error);
  const c = SD.counts(good.data); assert.equal(c.attempts, 3); assert.equal(c.mistakes, 1);
  for (const [bad, re] of [
    [{ 'c1-2': [A(0, true, T1)] }, /Invalid key "c1-2"/],            // not a quiz id
    [{ 'c1-q1': A(0, true, T1) }, /must be a list/],
    [{ 'c1-q1': [A(10, true, T1)] }, /option number/],
    [{ 'c1-q1': [A(0, 'yes', T1)] }, /true\/false/],
    [{ 'c1-q1': [A(0, true, 'now')] }, /timestamp/],
    [{ 'c1-q1': [{ ...A(0, true, T1), extra: 1 }] }, /Unexpected field "extra"/],
    [{ 'c1-q1': Array(51).fill(A(0, true, T1)) }, /max 50/],
  ]) { const r = SD.parse(f(bad), { bookIds: IDS }); assert.equal(r.ok, false); assert.match(r.error, re); }
  const local = SD.fromStorage(JSON.stringify({ books: { 'heat-mass-transfer': { attempts: { 'c1-q1': [A(1, false, T1)] } } } }), '{}');
  const m = SD.merge(local, good.data).study.books['heat-mass-transfer'].attempts;
  assert.deepEqual(m['c1-q1'], [A(1, false, T1), A(2, true, T2)], 'duplicates removed, sorted by time');
  assert.deepEqual(m['c1-q2'], [A(0, false, T1)]);
  const s = SD.sanitizeStudy({ books: { 'heat-mass-transfer': { attempts: { 'c1-q1': [A(1, false, T1)], 'c1-q2': 'bad' } } } });
  assert.equal(s.repaired, true); assert.deepEqual(Object.keys(s.study.books['heat-mass-transfer'].attempts), ['c1-q1']);
});

test('notes as Markdown: grouped by book > chapter > card heading, equation as $$latex$$, book order', () => {
  const books = [require('../data/heat-mass-transfer.json'), require('../data/koretsky-thermo.json')];
  const hm = books[0].chapters[0];
  const eqIdx = hm.cards.findIndex(c => c.eq), plainIdx = hm.cards.findIndex(c => !c.eq);
  const study = { books: {
    'heat-mass-transfer': { notes: { [`c1-${eqIdx + 1}`]: { text: 'eq note\nline 2', at: T1 }, [`c1-${plainIdx + 1}`]: { text: 'plain note', at: T1 }, 'c1-q1': { text: 'quiz note', at: T1 }, 'c99-1': { text: 'orphan', at: T1 } } },
    'koretsky-thermo': { notes: {} },
  } };
  const { markdown, count } = SD.notesMarkdown(study, books, { now: new Date(T1) });
  assert.equal(count, 4);
  assert.match(markdown, /^# LearnScroll notes\n/);
  assert.match(markdown, new RegExp(`## ${books[0].title.replace(/[()]/g, '.')}`));
  assert.ok(!markdown.includes(books[1].title), 'books without notes are skipped');
  assert.match(markdown, /### Chapter 1: Introduction and Basic Concepts/);
  const eqCard = hm.cards[eqIdx];
  const block = `#### ${eqCard.h}\n\n$$${eqCard.eq}$$\n\neq note\nline 2\n`;
  assert.ok(markdown.includes(block), 'heading, equation, note text in order');
  assert.ok(!markdown.includes(`#### ${hm.cards[plainIdx].h}\n\n$$`), 'no equation block for cards without eq');
  assert.match(markdown, /#### Practice question 1: .+\n\nquiz note/);
  assert.match(markdown, /### Other notes\n\n#### Card c99-1\n\norphan/);
  assert.ok(markdown.indexOf(`c1-${Math.min(eqIdx, plainIdx) + 1}`) === -1, 'card ids not used as headings for known cards');
  const pos = [hm.cards[Math.min(eqIdx, plainIdx)].h, hm.cards[Math.max(eqIdx, plainIdx)].h].map(h => markdown.indexOf(`#### ${h}`));
  assert.ok(pos[0] < pos[1], 'card order follows the book');
  assert.equal(SD.notesMarkdown({ books: {} }, books).count, 0);
});

test('needs attention: difficult > review again (incl. missed quiz) > unfinished, one entry per card, reasons, stable order', () => {
  const books = [require('../data/heat-mass-transfer.json')];
  const ch1 = books[0].chapters[0], nc = ch1.cards.length, nq = ch1.quiz.length;
  const study = { books: { 'heat-mass-transfer': {
    marks: { 'c1-3': { d: true }, 'c1-4': { b: true }, 'c2-2': { d: true }, 'c1-6': { d: true } },
    review: { 'c1-6': { r: 'again', at: T1 }, 'c1-7': { r: 'got', at: T1 }, 'c2-5': { r: 'again', at: T2 }, 'c1-q1': { r: 'again', at: T1 } },
    attempts: { 'c1-q1': [{ k: 0, ok: false, at: T1 }], 'c1-q2': [{ k: 0, ok: false, at: T1 }, { k: 1, ok: true, at: T2 }], 'c1-q3': [{ k: 0, ok: false, at: T1 + 5 }] },
    seen: { 1: 9, 2: 3 }, done: {},
  } }, recent: [] };
  const all = SD.needsAttention(study, books, { limit: 20 });
  assert.deepEqual(all.map(x => x.kind), ['difficult', 'difficult', 'difficult', 'again', 'again', 'again', 'unfinished', 'unfinished']);
  assert.deepEqual(all.slice(0, 3).map(x => x.href), ['#/read/heat-mass-transfer/1/3', '#/read/heat-mass-transfer/1/6', '#/read/heat-mass-transfer/2/2'], 'difficult in book order');
  assert.match(all[1].reason, /difficult · also review again/, 'a card both difficult and review-again appears once, with both reasons');
  assert.equal(new Set(all.filter(x => x.kind !== 'unfinished').map(x => x.id)).size, 6, 'no duplicate cards');
  assert.deepEqual(all.slice(3, 6).map(x => x.href), ['#/read/heat-mass-transfer/2/5', `#/read/heat-mass-transfer/1/${nc + 3}`, `#/read/heat-mass-transfer/1/${nc + 1}`], 'review-again tier newest first');
  assert.equal(all[5].reason, 'Missed in the quiz and marked review again');
  assert.equal(all[4].reason, 'You missed this quiz question'); assert.ok(!all.some(x => x.id === 'c1-q2'), 'a later right answer clears a mistake');
  assert.equal(all[6].href, '#/read/heat-mass-transfer/1/11', 'unfinished links to the next card'); assert.equal(all[6].reason, `Stopped after 10 of ${nc + nq} cards`);
  for (const x of all) { assert.ok(x.reason && x.reason.length <= 60, x.reason); assert.match(x.href, /^#\/read\/heat-mass-transfer\/\d+\/\d+$/); }
  assert.equal(SD.needsAttention(study, books).length, 5, 'default limit 5');
  assert.deepEqual(SD.needsAttention(study, books), SD.needsAttention(JSON.parse(JSON.stringify(study)), books), 'stable');
  const shown = [{ book: 'heat-mass-transfer', chapter: 1, card: 2 }, { book: 'heat-mass-transfer', chapter: 2, card: 3 }];
  const ex = SD.needsAttention(study, books, { shown, limit: 20 });
  assert.ok(!ex.some(x => x.kind === 'unfinished'), 'chapters in Recently studied are not repeated');
  assert.ok(!ex.some(x => x.href === '#/read/heat-mass-transfer/1/3'), 'the exact card shown in Recently studied is skipped');
  study.books['heat-mass-transfer'].done = { 1: true, 2: true };
  assert.ok(!SD.needsAttention(study, books, { limit: 20 }).some(x => x.kind === 'unfinished'), 'done chapters are not unfinished');
  assert.deepEqual(SD.needsAttention({ books: {} }, books), []);
});
