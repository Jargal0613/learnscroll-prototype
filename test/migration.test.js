// Saved-data schema migrations, full export/import round trips, malformed backups, quota and interrupted writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const SD = require('../studydata');
const IDS = ['heat-mass-transfer', 'koretsky-thermo', 'electric-circuits', 'university-physics', 'chemistry-silberberg'];
const T1 = 1761500000000, T2 = T1 + 60000;
const clone = o => JSON.parse(JSON.stringify(o));

// Every data type the app stores, in the legacy (pre-schema) layout.
const LEGACY = {
  books: {
    'heat-mass-transfer': { chapter: 2, card: 5, done: { 1: true }, seen: { 1: 29, 2: 5 },
      marks: { 'c1-2': { b: true, d: false }, 'c1-3': { b: false, d: false }, 'c2-q1': { d: true } },
      notes: { 'c1-2': { text: 'Fourier: q = -k dT/dx', at: T1 }, 'c2-4': { text: 'ünïcödé ✓ $$x^2$$', at: T2 } },
      review: { 'c1-2': { r: 'again', at: T1 }, 'c1-q2': { r: 'got', at: T2 } },
      attempts: { 'c1-q1': [{ k: 0, ok: false, at: T1 }, { k: 1, ok: true, at: T2 }] } },
    'koretsky-thermo': { chapter: 1, card: 0, done: {}, seen: {}, marks: {}, notes: {}, review: {} },
  },
  last: 'heat-mass-transfer',
  recent: [{ book: 'heat-mass-transfer', chapter: 2, card: 5, at: T2 }, { book: 'koretsky-thermo', chapter: 1, card: 0, at: T1 }],
  sessions: [{ book: 'heat-mass-transfer', minutes: 20, start: T1, end: T2, seconds: 600, seen: 12, marked: 2, queued: 30 }],
  sessionPrefs: { book: 'koretsky-thermo', minutes: 30 },
};
const TUTOR = { _prefs: { style: 'simple' }, 'heat-mass-transfer': { conversationId: 'conv_1', draft: 'half typed', scope: 'chapter',
  messages: [{ role: 'user', content: 'Why minus?', where: 'Ch 1 · card 2', at: T1 },
    { role: 'assistant', content: 'Heat flows **down** the gradient \\(q=-k\\,dT/dx\\).', at: T2, sources: [{ kind: 'book', label: 'Ch 1' }], passages: [], retrieval: null,
      check: { question: 'Doubling L?', hint: 'Where is L?', answer: 'Halves.' } }] } };

test('migration 1 -> 2: legacy data upgraded without losing any user value', () => {
  const m = SD.migrateStudy(clone(LEGACY));
  assert.equal(m.migrated, true); assert.equal(m.from, 1); assert.equal(m.data.schema, SD.SCHEMA);
  const h = m.data.books['heat-mass-transfer'];
  assert.deepEqual(h.marks, { 'c1-2': { b: true }, 'c2-q1': { d: true } }, 'false flags dropped, empty mark removed');
  for (const k of ['notes', 'review', 'attempts', 'done', 'seen']) assert.deepEqual(h[k], LEGACY.books['heat-mass-transfer'][k], k);
  for (const k of ['last', 'recent', 'sessions', 'sessionPrefs']) assert.deepEqual(m.data[k], LEGACY[k], k);
  const s = SD.sanitizeStudy(m.data); assert.equal(s.repaired, false, 'migrated data is clean'); assert.equal(s.study.schema, SD.SCHEMA);
  assert.deepEqual(s.study.books['heat-mass-transfer'].notes, LEGACY.books['heat-mass-transfer'].notes);
});
test('migration is idempotent, never mutates input; current, future and invalid schemas', () => {
  const input = clone(LEGACY); const m1 = SD.migrateStudy(input);
  assert.deepEqual(input, LEGACY, 'input untouched');
  const m2 = SD.migrateStudy(clone(m1.data)); assert.equal(m2.migrated, false); assert.deepEqual(m2.data, m1.data);
  const fut = { ...clone(LEGACY), schema: 99, newThing: { x: 1 } }; const f = SD.migrateStudy(fut);
  assert.equal(f.future, true); assert.equal(f.migrated, false); assert.equal(f.data, fut, 'future data returned unchanged');
  for (const bad of [0, -1, 1.5, '2', null]) assert.equal(SD.migrateStudy({ schema: bad, books: {} }).invalid, true, String(bad));
  for (const x of [null, 5, 'str', []]) assert.doesNotThrow(() => SD.migrateStudy(x));
  assert.equal(SD.MIGRATIONS.length, SD.SCHEMA - 1, 'one migration per schema step');
});
test('round trip of every data type: storage -> export -> import (overwrite) -> storage -> export is identical', () => {
  const study = SD.sanitizeStudy(SD.migrateStudy(clone(LEGACY)).data).study;
  const local = SD.fromStorage(JSON.stringify(study), JSON.stringify(TUTOR));
  const file1 = JSON.stringify(SD.build(local, { conversations: true, now: new Date(T2) }));
  const p = SD.parse(file1, { bookIds: IDS }); assert.ok(p.ok, p.error);
  const stored = SD.toStorage(SD.overwrite(SD.fromStorage(null, null), p.data));
  assert.equal(JSON.parse(stored.study).schema, SD.SCHEMA, 'imported data saved at current schema');
  const again = SD.fromStorage(stored.study, stored.tutor);
  const file2 = JSON.stringify(SD.build(again, { conversations: true, now: new Date(T2) }));
  assert.deepEqual(JSON.parse(file2), JSON.parse(file1));
  const h = JSON.parse(file2).study.books['heat-mass-transfer'];
  assert.equal(h.notes['c2-4'].text, 'ünïcödé ✓ $$x^2$$'); assert.equal(h.attempts['c1-q1'].length, 2);
  assert.equal(JSON.parse(file2).tutor.conversations['heat-mass-transfer'].messages[1].check.answer, 'Halves.');
  assert.equal(JSON.parse(file2).tutor.prefs.style, 'simple');
  // merge with itself changes nothing
  const merged = SD.merge(again, SD.parse(file2, { bookIds: IDS }).data);
  assert.deepEqual(JSON.parse(JSON.stringify(SD.build(merged, { conversations: true, now: new Date(T2) }))), JSON.parse(file1));
  // a legacy export (made before schemas, contains false flags) still imports
  const legacyFile = JSON.stringify({ app: 'learnscroll', version: 1, exportedAt: new Date(T1).toISOString(), study: clone(LEGACY), tutor: { prefs: {} } });
  const lp = SD.parse(legacyFile, { bookIds: IDS }); assert.ok(lp.ok, lp.error);
  assert.deepEqual(lp.data.study.books['heat-mass-transfer'].marks['c1-2'], { b: true });
});
test('malformed backups are rejected with a message and never throw', () => {
  const good = JSON.stringify(SD.build(SD.fromStorage(JSON.stringify(LEGACY), JSON.stringify(TUTOR)), { conversations: true, now: new Date(T2) }));
  const g = () => JSON.parse(good);
  const cases = {
    truncated: good.slice(0, good.length / 2), empty: '', bom_garbage: '\uFEFF{not json', array: '[]', number: '42',
    wrongApp: JSON.stringify({ ...g(), app: 'other' }), futureVersion: JSON.stringify({ ...g(), version: 99 }),
    extraKey: JSON.stringify({ ...g(), evil: 1 }), badDate: JSON.stringify({ ...g(), exportedAt: 'yesterday' }),
    noteNotText: (() => { const o = g(); o.study.books['heat-mass-transfer'].notes['c1-2'].text = 5; return JSON.stringify(o); })(),
    attemptBad: (() => { const o = g(); o.study.books['heat-mass-transfer'].attempts['c1-q1'] = [{ k: 'a' }]; return JSON.stringify(o); })(),
    unknownBook: (() => { const o = g(); o.study.books['not-a-book'] = {}; return JSON.stringify(o); })(),
    protoPollution: '{"app":"learnscroll","version":1,"exportedAt":"2026-01-01T00:00:00Z","study":{"books":{"__proto__":{"x":1}}},"tutor":{"prefs":{}}}',
    tooBig: ' '.repeat(5 * 1024 * 1024 + 10),
    checkBad: (() => { const o = g(); o.tutor.conversations['heat-mass-transfer'].messages[1].check = { question: 1 }; return JSON.stringify(o); })(),
  };
  for (const [name, text] of Object.entries(cases)) {
    let r; assert.doesNotThrow(() => { r = SD.parse(text, { bookIds: IDS }); }, name);
    assert.equal(r.ok, false, name); assert.equal(typeof r.error, 'string', name); assert.ok(r.error.length > 5, name);
  }
  assert.equal(({}).x, undefined, 'no prototype pollution');
  assert.ok(SD.parse(good, { bookIds: IDS }).ok);
});

function fakeStorage({ quotaAfter = Infinity } = {}) {
  const m = new Map(); let writes = 0;
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), removeItem: k => m.delete(k),
    setItem(k, v) { if (++writes > quotaAfter) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); } };
}
test('interrupted write: journal restores the previous consistent data on next start', () => {
  const st = fakeStorage(); st.setItem(SD.STUDY_KEY, 'OLD-S'); st.setItem(SD.TUTOR_KEY, 'OLD-T');
  assert.equal(SD.journalStart(st), true);
  st.setItem(SD.STUDY_KEY, 'NEW-S'); // ...tab closed before the tutor write and journalEnd
  assert.equal(SD.journalRecover(st), true);
  assert.deepEqual([st.getItem(SD.STUDY_KEY), st.getItem(SD.TUTOR_KEY), st.getItem(SD.JOURNAL_KEY)], ['OLD-S', 'OLD-T', null]);
  assert.equal(SD.journalRecover(st), false, 'nothing to recover after a clean finish');
  const fresh = fakeStorage(); SD.journalStart(fresh); fresh.setItem(SD.STUDY_KEY, 'NEW'); SD.journalRecover(fresh);
  assert.equal(fresh.getItem(SD.STUDY_KEY), null, 'keys that did not exist before are removed again');
  const done = fakeStorage(); done.setItem(SD.STUDY_KEY, 'A'); SD.journalStart(done); done.setItem(SD.STUDY_KEY, 'B'); SD.journalEnd(done);
  assert.equal(SD.journalRecover(done), false); assert.equal(done.getItem(SD.STUDY_KEY), 'B', 'completed writes are kept');
  const junk = fakeStorage(); junk.setItem(SD.JOURNAL_KEY, '{oops'); assert.equal(SD.journalRecover(junk), false); assert.equal(junk.getItem(SD.JOURNAL_KEY), null);
});
test('quota: journal start reports failure instead of throwing; recovery that hits quota keeps the journal', () => {
  const full = fakeStorage({ quotaAfter: 0 }); assert.equal(SD.journalStart(full), false);
  const st = fakeStorage({ quotaAfter: 3 }); st.setItem(SD.STUDY_KEY, 'OLD'); assert.equal(SD.journalStart(st), true); st.setItem(SD.STUDY_KEY, 'NEW');
  assert.equal(SD.journalRecover(st), false, 'restore failed (quota)'); assert.notEqual(st.getItem(SD.JOURNAL_KEY), null, 'journal kept for the next start');
});

test('tutor + session stores share the schema: legacy upgraded, future/invalid flagged, data untouched', () => {
  const t = SD.migrateTutor(clone(TUTOR)); assert.equal(t.migrated, true); assert.equal(t.data._schema, SD.SCHEMA);
  const { _schema, ...rest } = t.data; assert.deepEqual(rest, TUTOR);
  assert.equal(SD.migrateTutor({ ...TUTOR, _schema: 9 }).future, true);
  const sess = { book: 'heat-mass-transfer', minutes: 20, start: T1, ids: ['c1-1', 'c1-q1'], pos: 1, viewed: { 'c1-1': true }, marked: {}, active: 30, visibleSince: null, lastSeen: T2 };
  const s = SD.migrateSession(clone(sess)); assert.equal(s.migrated, true); assert.equal(s.data.schema, SD.SCHEMA); assert.equal(s.data.active, 30);
  assert.equal(SD.migrateSession({ ...sess, schema: 5 }).future, true);
  assert.equal(SD.migrateSession('x').invalid, true);
});
test('export v2 carries the session in progress; round trip, merge and replace semantics; v1 files still import', () => {
  const sess = { schema: SD.SCHEMA, book: 'heat-mass-transfer', minutes: 20, start: T1, ids: ['c1-1', 'c1-q1'], pos: 1, viewed: { 'c1-1': true }, marked: { 'c1-1': { b: true } }, active: 30, visibleSince: null, lastSeen: T2 };
  const study = SD.sanitizeStudy(SD.migrateStudy(clone(LEGACY)).data).study;
  const local = SD.fromStorage(JSON.stringify(study), JSON.stringify(TUTOR), JSON.stringify(sess));
  const f = SD.build(local, { conversations: true, now: new Date(T2) }); assert.equal(f.version, SD.VERSION); assert.deepEqual(f.session, sess);
  assert.deepEqual(Object.keys(f).sort(), ['app', 'exportedAt', 'session', 'study', 'tutor', 'version']);
  assert.equal(SD.build(SD.fromStorage(null, null, null), { now: new Date(T2) }).session, null, 'v2 always states the session (null = none)');
  assert.doesNotMatch(JSON.stringify(f), /sk-[A-Za-z0-9]|OPENAI|api[_-]?key|vs_[A-Za-z0-9]|vector_store/i, 'no secrets/server data');
  const p = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(p.ok, p.error); assert.deepEqual(p.data.session, sess);
  const st = SD.toStorage(SD.overwrite(SD.fromStorage(null, null, null), p.data)); assert.deepEqual(JSON.parse(st.session), sess);
  assert.equal(JSON.parse(st.tutor)._schema, SD.SCHEMA);
  const other = { ...sess, start: T2, book: 'koretsky-thermo' };
  assert.equal(SD.merge(SD.fromStorage(null, null, JSON.stringify(other)), p.data).session.book, 'koretsky-thermo', 'merge keeps the session in progress here');
  assert.equal(SD.merge(SD.fromStorage(null, null, null), p.data).session.book, 'heat-mass-transfer', 'merge takes the file session when none here');
  assert.equal(SD.overwrite(SD.fromStorage(null, null, JSON.stringify(other)), { ...p.data, session: null }).session, null, 'replace with a file whose session is empty ends it');
  assert.equal(SD.overwrite(SD.fromStorage(null, null, JSON.stringify(other)), { ...p.data, session: undefined }).session.book, 'koretsky-thermo', 'a file without session data (v1) keeps it');
  for (const bad of [{ ...sess, ids: ['nope'] }, { ...sess, minutes: 15 }, { ...sess, book: 'x' }, { ...sess, extra: 1 }, { ...sess, viewed: { 'c1-1': 'yes' } }]) {
    const r = SD.parse(JSON.stringify({ ...f, session: bad }), { bookIds: IDS }); assert.equal(r.ok, false, JSON.stringify(bad)); assert.match(r.error, /session/);
  }
  assert.equal(SD.parse(JSON.stringify({ ...f, version: 1 }), { bookIds: IDS }).ok, false, 'v1 files cannot carry a session');
  const { session, ...v1 } = f; assert.ok(SD.parse(JSON.stringify({ ...v1, version: 1 }), { bookIds: IDS }).ok, 'v1 file imports');
  assert.match(SD.parse(JSON.stringify({ ...f, version: 99 }), { bookIds: IDS }).error, /newer version/);
});

test('tutor continuity data: origin + saved conversations validate, export and merge without loss', () => {
  const origin = { chapter: 1, chapterTitle: 'Intro', index: 2, cardId: 'c1-3', label: 'Card 3: X', scope: 'card', at: T1 };
  const conv = (id, q, at) => ({ conversationId: id, scope: 'card', origin, messages: [{ role: 'user', content: q, at }, { role: 'assistant', content: 'a', at: at + 1 }] });
  const tut = { _schema: 2, 'heat-mass-transfer': { ...conv('cA', 'qA', T1), draft: '', saved: [conv('cOld', 'qOld', T1 - 1000)] } };
  const local = SD.fromStorage(null, JSON.stringify(tut), null);
  const f = SD.build(local, { conversations: true, now: new Date(T2) });
  const p = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(p.ok, p.error);
  const c = p.data.tutor.conversations['heat-mass-transfer'];
  assert.deepEqual(c.origin, origin); assert.equal(c.saved[0].conversationId, 'cOld');
  for (const bad of [{ ...origin, scope: 'x' }, { ...origin, chapter: 0 }, { ...origin, cardId: 'zz' }, { ...origin, extra: 1 }]) {
    const o = JSON.parse(JSON.stringify(f)); o.tutor.conversations['heat-mass-transfer'].origin = bad; assert.equal(SD.parse(JSON.stringify(o), { bookIds: IDS }).ok, false);
  }
  const o = JSON.parse(JSON.stringify(f)); o.tutor.conversations['heat-mass-transfer'].saved = Array(11).fill(conv('cX', 'q', T1)); assert.equal(SD.parse(JSON.stringify(o), { bookIds: IDS }).ok, false);
  // merge: the other device's active conversation is newer -> it becomes active; nothing is lost
  const other = SD.fromStorage(null, JSON.stringify({ 'heat-mass-transfer': { ...conv('cB', 'qB', T2), draft: '' } }), null);
  const m = SD.merge(other, p.data).tutor.conversations['heat-mass-transfer'];
  assert.equal(m.conversationId, 'cB'); assert.deepEqual(m.saved.map(x => x.conversationId).sort(), ['cA', 'cOld']);
});

test('reading text size preference: exported, validated, sanitized, merged (this browser wins)', () => {
  const st = { ...SD.sanitizeStudy({}).study, readPrefs: { textSize: 'large' } };
  const f = SD.build(SD.fromStorage(JSON.stringify(st), null, null), { now: new Date(T2) });
  const p = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(p.ok, p.error); assert.deepEqual(p.data.study.readPrefs, { textSize: 'large' });
  for (const bad of [{ textSize: 'huge' }, 'large', { textSize: 'large', x: 1 }]) { const o = JSON.parse(JSON.stringify(f)); o.study.readPrefs = bad; assert.equal(SD.parse(JSON.stringify(o), { bookIds: IDS }).ok, false); }
  const r = SD.sanitizeStudy({ readPrefs: { textSize: 'huge' } }); assert.equal(r.repaired, true); assert.equal(r.study.readPrefs, undefined);
  const local = SD.fromStorage(JSON.stringify({ ...st, readPrefs: { textSize: 'small' } }), null, null);
  assert.equal(SD.merge(local, p.data).study.readPrefs.textSize, 'small');
  assert.equal(SD.merge(SD.fromStorage(null, null, null), p.data).study.readPrefs.textSize, 'large');
});

test('schema 3: formula notebook migrates, validates, exports, merges and replaces predictably', () => {
  const v2 = { schema: 2, books: { 'heat-mass-transfer': { chapter: 1, card: 2, done: {}, marks: {}, seen: {}, notes: {}, review: {}, attempts: {} } }, last: null, recent: [], sessions: [] };
  const m = SD.migrateStudy(clone(v2)); assert.equal(m.migrated, true); assert.equal(m.from, 2); assert.deepEqual(m.data.formulas, {}); assert.equal(m.data.schema, SD.SCHEMA);
  assert.deepEqual(m.data.books, v2.books, 'nothing else changes');
  const F = { 'f-heat-mass-transfer-c1-13': { kind: 'card', title: 'Conduction', tex: '\\dot Q = -kA\\,dT/dx', book: 'heat-mass-transfer', chapter: 1, card: 'c1-13', heading: 'Conduction', at: T1, updated: T1 },
    'fc-abc123': { kind: 'custom', title: 'Mine', tex: 'a^2+b^2', notes: 'n', at: T1, updated: T1 } };
  const study = { ...SD.sanitizeStudy(m.data).study, formulas: F };
  assert.deepEqual(SD.sanitizeStudy(study).study.formulas, F); assert.equal(SD.sanitizeStudy(study).repaired, false);
  const local = SD.fromStorage(JSON.stringify(study), '{}', null);
  const f = SD.build(local, { now: new Date(T2) }); const p = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(p.ok, p.error); assert.deepEqual(p.data.study.formulas, F);
  for (const bad of [{ 'f-heat-mass-transfer-c1-13': { ...F['f-heat-mass-transfer-c1-13'], card: 'c1-14' } }, { 'fc-abc123': { ...F['fc-abc123'], tex: '' } }, { 'x': F['fc-abc123'] }, { 'fc-abc123': { ...F['fc-abc123'], kind: 'web' } }]) {
    const r = SD.parse(JSON.stringify({ ...f, study: { ...f.study, formulas: bad } }), { bookIds: IDS }); assert.equal(r.ok, false); assert.match(r.error, /formulas/);
  }
  // merge: union; same id -> most recently edited wins
  const edited = { ...F['fc-abc123'], notes: 'newer', updated: T2 };
  const mg = SD.merge(local, { ...p.data, study: { ...p.data.study, formulas: { 'fc-abc123': edited, 'fc-zzz999': { ...F['fc-abc123'], title: 'Other' } } } });
  assert.equal(Object.keys(mg.study.formulas).length, 3); assert.equal(mg.study.formulas['fc-abc123'].notes, 'newer');
  // replace: an older file (no formulas) keeps them; a v3 file with none removes them
  const { formulas: _f, ...oldStudy } = p.data.study;
  assert.deepEqual(SD.overwrite(local, { ...p.data, study: oldStudy }).study.formulas, F);
  assert.deepEqual(SD.overwrite(local, { ...p.data, study: { ...p.data.study, formulas: {} } }).study.formulas, {});
  const plan = SD.importPlan(local, { ...p.data, study: oldStudy }).find(r => r.key === 'formulas'); assert.match(plan.replace, /Kept/);
  // v2 files still import
  const { formulas: _g, ...s2 } = f.study; assert.ok(SD.parse(JSON.stringify({ ...f, version: 2, study: s2 }), { bookIds: IDS }).ok);
});

test('study sheets: validate, export, merge (newest edit wins), replace; older files keep local sheets', () => {
  const S = { 's-abcd1': { title: 'Exam 1', items: [{ t: 'formula', ref: 'f-heat-mass-transfer-c1-13' }, { t: 'note', book: 'heat-mass-transfer', card: 'c1-2' }, { t: 'difficult', book: 'heat-mass-transfer', card: 'c1-q1' }], at: T1, updated: T1 } };
  const study = { ...SD.sanitizeStudy({ schema: 3, books: {}, recent: [], sessions: [] }).study, sheets: S };
  assert.deepEqual(SD.sanitizeStudy(study).study.sheets, S);
  const local = SD.fromStorage(JSON.stringify(study), '{}', null), f = SD.build(local, { now: new Date(T2) });
  const p = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(p.ok, p.error); assert.deepEqual(p.data.study.sheets, S);
  for (const items of [[{ t: 'pdf', ref: 'x' }], [{ t: 'note', book: 'nope', card: 'c1-1' }], [S['s-abcd1'].items[1], S['s-abcd1'].items[1]]]) {
    const r = SD.parse(JSON.stringify({ ...f, study: { ...f.study, sheets: { 's-abcd1': { ...S['s-abcd1'], items } } } }), { bookIds: IDS }); assert.equal(r.ok, false); assert.match(r.error, /sheets/);
  }
  const newer = { ...S['s-abcd1'], title: 'Exam 1 (edited)', updated: T2 };
  assert.equal(SD.merge(local, { ...p.data, study: { ...p.data.study, sheets: { 's-abcd1': newer } } }).study.sheets['s-abcd1'].title, 'Exam 1 (edited)');
  const { sheets: _s, ...old } = p.data.study; assert.deepEqual(SD.overwrite(local, { ...p.data, study: old }).study.sheets, S);
  assert.deepEqual(SD.overwrite(local, { ...p.data, study: { ...p.data.study, sheets: {} } }).study.sheets, {});
});

test('revision plan: deterministic ranking, reasons, target, Postpone/Understood, no unavailable or duplicate cards', () => {
  const book = { id: 'heat-mass-transfer', chapters: [{ n: 1, cards: [{ h: 'a' }, { h: 'b' }, { h: 'c' }, { h: 'd' }], quiz: [{ q: 'q1' }, { q: 'q2' }] }, { n: 2, cards: [], quiz: [] }] };
  const NOW = Date.UTC(2026, 9, 27, 12), D = 864e5;
  const bs = { marks: { 'c1-2': { d: true }, 'c1-3': { b: true } }, review: { 'c1-1': { r: 'again', at: NOW - 2 * D }, 'c1-4': { r: 'got', at: NOW - 20 * D } },
    attempts: { 'c1-q1': [{ k: 0, ok: false, at: NOW - 3 * D }, { k: 2, ok: false, at: NOW - D }], 'c1-q2': [{ k: 0, ok: false, at: NOW - D }, { k: 1, ok: true, at: NOW - 1000 }] }, notes: {}, done: {}, seen: {} };
  const study = { books: { 'heat-mass-transfer': bs } };
  const p = SD.revisionPlan(study, book, { now: NOW });
  assert.deepEqual(p.today.map(x => x.id), ['c1-q1', 'c1-1', 'c1-2', 'c1-4'], 'missed twice first; answered-right-since question excluded; bookmark alone excluded');
  assert.equal(p.today[0].reason, 'Missed twice'); assert.equal(p.today[1].reason, 'Marked review again'); assert.equal(p.today[3].reason, 'Not reviewed recently (20 days)');
  assert.deepEqual(SD.revisionPlan(study, book, { now: NOW }), p, 'stable');
  assert.equal(new Set(p.today.map(x => x.id)).size, p.today.length);
  const t5 = SD.revisionPlan(study, book, { now: NOW, target: 5 }); assert.equal(t5.target, 5);
  const small = SD.revisionPlan({ ...study, revision: { target: 5, log: {} } }, book, { now: NOW, target: 2 }); assert.equal(small.target, 5, 'only 5/10/15');
  // understood hides until a newer negative signal; postpone hides for the day only
  const withLog = { ...study, revision: { target: 10, log: { 'heat-mass-transfer/c1-q1': [{ a: 'understood', at: NOW - 1000 }], 'heat-mass-transfer/c1-2': [{ a: 'postpone', at: NOW - 1000 }] } } };
  const q = SD.revisionPlan(withLog, book, { now: NOW });
  assert.ok(!q.today.some(x => x.id === 'c1-q1') && !q.today.some(x => x.id === 'c1-2') && q.postponed.map(x => x.id).includes('c1-2'));
  assert.ok(SD.revisionPlan(withLog, book, { now: NOW + D }).today.some(x => x.id === 'c1-2'), 'postponed card back the next day');
  const missedAgain = JSON.parse(JSON.stringify(withLog)); missedAgain.books['heat-mass-transfer'].attempts['c1-q1'].push({ k: 3, ok: false, at: NOW });
  const r = SD.revisionPlan(missedAgain, book, { now: NOW + 1 }); assert.equal(r.today[0].id, 'c1-q1'); assert.equal(r.today[0].reason, 'Missed 3 times');
  // export/import
  const st = { ...SD.sanitizeStudy({ schema: 3, books: { 'heat-mass-transfer': bs } }).study, revision: withLog.revision };
  const f = SD.build(SD.fromStorage(JSON.stringify(st), '{}', null), { now: new Date(NOW) });
  const pp = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(pp.ok, pp.error); assert.deepEqual(pp.data.study.revision, withLog.revision);
  assert.equal(SD.parse(JSON.stringify({ ...f, study: { ...f.study, revision: { target: 7 } } }), { bookIds: IDS }).ok, false);
  const m = SD.merge(SD.fromStorage(JSON.stringify({ ...st, revision: { target: 15, log: { 'heat-mass-transfer/c1-1': [{ a: 'postpone', at: NOW }] } } }), '{}', null), pp.data);
  assert.equal(m.study.revision.target, 15); assert.equal(Object.keys(m.study.revision.log).length, 3);
});

// Schema 4: study sheets can hold calculation results. Added BEFORE the calculator stores anything.
test('schema 3 -> 4 keeps everything; calc sheet items round-trip through export/import', () => {
  const v3 = { schema: 3, books: {}, recent: [], sessions: [], formulas: {}, sheets: { 's-abcd': { title: 'Old', items: [{ t: 'bookmark', book: 'heat-mass-transfer', card: 'c1-2' }], at: T1 } } };
  const m = SD.migrateStudy(clone(v3)); assert.equal(m.migrated, true); assert.equal(m.from, 3); assert.equal(m.data.schema, 4);
  assert.deepEqual(m.data.sheets, v3.sheets, 'v3 sheets untouched');
  const calc = { t: 'calc', calc: 'convection', solve: 'h', inputs: { Q: [1200, 'W'], A: [2, 'm²'], Ts: [80, '°C'], Tinf: [20, '°C'] }, result: [10, 'W/m²·K'], at: T2 };
  const sheets = { 's-calc1': { title: 'Calcs', items: [calc], at: T2, updated: T2 } };
  const study = { ...SD.sanitizeStudy({ schema: 4, books: {}, recent: [], sessions: [] }).study, sheets };
  const f = SD.build(SD.fromStorage(JSON.stringify(study), '{}', null), { conversations: true, now: new Date(T2) });
  assert.equal(f.version, 4);
  const back = SD.parse(JSON.stringify(f), { bookIds: IDS }); assert.ok(back.ok, back.error);
  assert.deepEqual(back.data.study.sheets['s-calc1'].items[0], calc);
  const v3file = { ...f, version: 3 }; assert.ok(SD.parse(JSON.stringify({ ...v3file, study: { ...f.study, sheets: {} } }), { bookIds: IDS }).ok, 'format 3 files still import');
});
test('calc sheet items: bad shapes are rejected, never stored', () => {
  const base = { t: 'calc', calc: 'convection', solve: 'h', inputs: { Q: [1, 'W'] }, result: [1, 'W/m²·K'], at: T1 };
  for (const bad of [{ ...base, calc: 'Bad Id!' }, { ...base, solve: '' }, { ...base, inputs: { Q: [NaN, 'W'] } }, { ...base, inputs: { Q: ['1', 'W'] } }, { ...base, result: [1, ''] }, { ...base, extra: 1 }, { ...base, inputs: { h: [1, 'W'] } }])
    assert.throws(() => SD.validSheet({ title: 'x', items: [bad], at: T1 }, 's', IDS), undefined, JSON.stringify(bad).slice(0, 80));
  assert.deepEqual(SD.validSheet({ title: 'x', items: [base], at: T1 }, 's', IDS).items[0], base);
});
