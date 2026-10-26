// LearnScroll study data export / import: pure, testable logic (browser global StudyData + CommonJS).
// Nothing here touches the network; the app reads/writes localStorage and calls these functions.
(function (root) {
  const APP = 'learnscroll', VERSION = 1;
  const STUDY_KEY = 'learnscroll-study-v1', TUTOR_KEY = 'learnscroll-tutor-v1';
  const STYLES = ['default', 'simple', 'math', 'example'];
  const SCOPES = ['card', 'chapter', 'book'];
  const MAX_BYTES = 5 * 1024 * 1024, MAX_RECENT = 10, MAX_NOTE = 4000, MAX_MSGS = 60, MAX_MSG = 20000;
  const QUIZ_RE = /^c\d{1,3}-q\d{1,4}$/, MAX_ATTEMPTS = 50;
  const CARD_RE = /^c\d{1,3}-q?\d{1,4}$/, CH_RE = /^\d{1,3}$/, BOOK_RE = /^[a-z0-9-]{1,40}$/, CONV_RE = /^[A-Za-z0-9_-]{1,64}$/;

  // Same shape the app stores: only true flags are kept ({ b: true } / { d: true } / both).
  const flags = (b, d) => Object.assign({}, b ? { b: true } : null, d ? { d: true } : null);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isInt = (v, min = 0) => Number.isInteger(v) && v >= min && v < 1e6;
  const isTime = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14;
  class Invalid extends Error {}
  const fail = msg => { throw new Invalid(msg); };
  function onlyKeys(o, allowed, where) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`Unexpected field "${k}" in ${where}.`);
  }
  function mapOf(o, keyRe, where, check) {
    if (!isObj(o)) fail(`${where} must be an object.`);
    const out = {};
    for (const [k, v] of Object.entries(o)) { if (!keyRe.test(k)) fail(`Invalid key "${k}" in ${where}.`); out[k] = check(v, `${where}.${k}`); }
    return out;
  }

  function validBook(b, where) {
    if (!isObj(b)) fail(`${where} must be an object.`);
    onlyKeys(b, ['chapter', 'card', 'done', 'marks', 'seen', 'notes', 'review', 'attempts'], where);
    if (!(b.chapter === null || b.chapter === undefined || isInt(b.chapter, 1))) fail(`${where}.chapter must be a chapter number or null.`);
    if (b.card !== undefined && !isInt(b.card)) fail(`${where}.card must be a whole number.`);
    return {
      chapter: b.chapter === undefined ? null : b.chapter, card: b.card === undefined ? 0 : b.card,
      done: mapOf(b.done || {}, CH_RE, `${where}.done`, (v, w) => (v === true ? true : fail(`${w} must be true.`))),
      marks: mapOf(b.marks || {}, CARD_RE, `${where}.marks`, (v, w) => {
        if (!isObj(v)) fail(`${w} must be an object.`); onlyKeys(v, ['b', 'd'], w);
        if ((v.b !== undefined && typeof v.b !== 'boolean') || (v.d !== undefined && typeof v.d !== 'boolean')) fail(`${w} flags must be true/false.`);
        return flags(!!v.b, !!v.d);
      }),
      seen: mapOf(b.seen || {}, CH_RE, `${where}.seen`, (v, w) => (isInt(v) ? v : fail(`${w} must be a whole number.`))),
      notes: mapOf(b.notes || {}, CARD_RE, `${where}.notes`, (v, w) => {
        if (!isObj(v)) fail(`${w} must be an object.`); onlyKeys(v, ['text', 'at'], w);
        if (typeof v.text !== 'string' || !v.text.trim() || v.text.length > MAX_NOTE) fail(`${w}.text must be non-empty text (max ${MAX_NOTE} characters).`);
        if (!isTime(v.at)) fail(`${w}.at must be a timestamp.`);
        return { text: v.text, at: v.at };
      }),
      review: mapOf(b.review || {}, CARD_RE, `${where}.review`, (v, w) => {
        if (!isObj(v)) fail(`${w} must be an object.`); onlyKeys(v, ['r', 'at'], w);
        if (v.r !== 'got' && v.r !== 'again') fail(`${w}.r must be "got" or "again".`);
        if (!isTime(v.at)) fail(`${w}.at must be a timestamp.`);
        return { r: v.r, at: v.at };
      }),
      attempts: mapOf(b.attempts || {}, QUIZ_RE, `${where}.attempts`, (v, w) => {
        if (!Array.isArray(v) || v.length > MAX_ATTEMPTS) fail(`${w} must be a list (max ${MAX_ATTEMPTS}).`);
        return v.map((a, i) => {
          const aw = `${w}[${i}]`;
          if (!isObj(a)) fail(`${aw} must be an object.`); onlyKeys(a, ['k', 'ok', 'at'], aw);
          if (!Number.isInteger(a.k) || a.k < 0 || a.k > 9) fail(`${aw}.k must be an option number 0-9.`);
          if (typeof a.ok !== 'boolean') fail(`${aw}.ok must be true/false.`);
          if (!isTime(a.at)) fail(`${aw}.at must be a timestamp.`);
          return { k: a.k, ok: a.ok, at: a.at };
        });
      }),
    };
  }
  function validStudy(s, bookIds) {
    if (!isObj(s)) fail('"study" must be an object.');
    onlyKeys(s, ['books', 'last', 'recent', 'sessions', 'sessionPrefs'], 'study');
    const books = mapOf(s.books || {}, BOOK_RE, 'study.books', (v, w) => validBook(v, w));
    for (const id of Object.keys(books)) if (bookIds && !bookIds.includes(id)) fail(`Unknown book "${id}".`);
    if (!(s.last === null || s.last === undefined || (typeof s.last === 'string' && (!bookIds || bookIds.includes(s.last))))) fail('study.last must be a known book id or null.');
    if (s.recent !== undefined && !Array.isArray(s.recent)) fail('study.recent must be a list.');
    const recent = (s.recent || []).map((r, i) => {
      const w = `study.recent[${i}]`;
      if (!isObj(r)) fail(`${w} must be an object.`); onlyKeys(r, ['book', 'chapter', 'card', 'at'], w);
      if (typeof r.book !== 'string' || (bookIds && !bookIds.includes(r.book))) fail(`${w}.book must be a known book id.`);
      if (!isInt(r.chapter, 1) || !isInt(r.card) || !isTime(r.at)) fail(`${w} needs chapter, card and at numbers.`);
      return { book: r.book, chapter: r.chapter, card: r.card, at: r.at };
    });
    if (recent.length > 50) fail('study.recent is too long.');
    if (s.sessions !== undefined && (!Array.isArray(s.sessions) || s.sessions.length > 100)) fail('study.sessions must be a list (max 100).');
    const sessions = (s.sessions || []).map((x, i) => {
      const w = `study.sessions[${i}]`;
      if (!isObj(x)) fail(`${w} must be an object.`); onlyKeys(x, ['book', 'minutes', 'start', 'end', 'seconds', 'seen', 'marked', 'queued'], w);
      if (typeof x.book !== 'string' || (bookIds && !bookIds.includes(x.book))) fail(`${w}.book must be a known book id.`);
      if (![10, 20, 30].includes(x.minutes) || !isTime(x.start) || !isTime(x.end) || ![x.seconds, x.seen, x.marked, x.queued].every(v => isInt(v))) fail(`${w} has invalid numbers.`);
      return { book: x.book, minutes: x.minutes, start: x.start, end: x.end, seconds: x.seconds, seen: x.seen, marked: x.marked, queued: x.queued };
    });
    let sessionPrefs;
    if (s.sessionPrefs !== undefined) {
      const p = s.sessionPrefs;
      if (!isObj(p)) fail('study.sessionPrefs must be an object.'); onlyKeys(p, ['book', 'minutes'], 'study.sessionPrefs');
      if (typeof p.book !== 'string' || (bookIds && !bookIds.includes(p.book)) || ![10, 20, 30].includes(p.minutes)) fail('study.sessionPrefs is invalid.');
      sessionPrefs = { book: p.book, minutes: p.minutes };
    }
    const out = { books, last: s.last || null, recent, sessions };
    if (sessionPrefs) out.sessionPrefs = sessionPrefs;
    return out;
  }
  function validTutor(t, bookIds) {
    if (!isObj(t)) fail('"tutor" must be an object.');
    onlyKeys(t, ['prefs', 'conversations'], 'tutor');
    const prefs = {};
    if (t.prefs !== undefined) {
      if (!isObj(t.prefs)) fail('tutor.prefs must be an object.'); onlyKeys(t.prefs, ['style'], 'tutor.prefs');
      if (t.prefs.style !== undefined) { if (!STYLES.includes(t.prefs.style)) fail('tutor.prefs.style is not a known answer style.'); prefs.style = t.prefs.style; }
    }
    let conversations;
    if (t.conversations !== undefined) {
      conversations = mapOf(t.conversations, BOOK_RE, 'tutor.conversations', (c, w) => {
        if (bookIds && !bookIds.includes(w.split('.').pop())) fail(`Unknown book in ${w}.`);
        if (!isObj(c)) fail(`${w} must be an object.`); onlyKeys(c, ['conversationId', 'messages', 'draft', 'scope'], w);
        if (typeof c.conversationId !== 'string' || !CONV_RE.test(c.conversationId)) fail(`${w}.conversationId is invalid.`);
        if (!Array.isArray(c.messages) || c.messages.length > MAX_MSGS) fail(`${w}.messages must be a list (max ${MAX_MSGS}).`);
        if (c.draft !== undefined && (typeof c.draft !== 'string' || c.draft.length > 2000)) fail(`${w}.draft is invalid.`);
        if (c.scope !== undefined && !SCOPES.includes(c.scope)) fail(`${w}.scope is invalid.`);
        const messages = c.messages.map((m, i) => {
          const mw = `${w}.messages[${i}]`;
          if (!isObj(m) || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > MAX_MSG) fail(`${mw} needs role user|assistant and text.`);
          if (m.at !== undefined && !isTime(m.at)) fail(`${mw}.at must be a timestamp.`);
          // display-only metadata from the tutor is kept as-is when it has the right basic shape
          for (const k of ['sources', 'passages']) if (m[k] !== undefined && !Array.isArray(m[k])) fail(`${mw}.${k} must be a list.`);
          if (m.retrieval !== undefined && m.retrieval !== null && !isObj(m.retrieval)) fail(`${mw}.retrieval must be an object.`);
          if (m.where !== undefined && typeof m.where !== 'string') fail(`${mw}.where must be text.`);
          if (m.check !== undefined && !(isObj(m.check) && ['question', 'hint', 'answer'].every(k => typeof m.check[k] === 'string' && m.check[k].length <= 2000) && Object.keys(m.check).length === 3)) fail(`${mw}.check must have question, hint and answer text.`);
          const out = { role: m.role, content: m.content };
          for (const k of ['where', 'at', 'sources', 'passages', 'retrieval', 'check']) if (m[k] !== undefined) out[k] = m[k];
          return out;
        });
        return { conversationId: c.conversationId, messages, draft: c.draft || '', scope: c.scope || 'card' };
      });
    }
    return conversations ? { prefs, conversations } : { prefs };
  }

  // Parses and strictly validates an export file. Returns { ok: true, data } or { ok: false, error }.
  function parse(text, { bookIds } = {}) {
    try {
      if (typeof text !== 'string') fail('The file could not be read as text.');
      if (text.length > MAX_BYTES) fail('The file is too large to be a LearnScroll export.');
      let obj; try { obj = JSON.parse(text); } catch (e) { fail('The file is not valid JSON.'); }
      if (!isObj(obj)) fail('The file is not a LearnScroll export.');
      if (obj.app !== APP) fail('The file is not a LearnScroll export (missing app id).');
      if (obj.version !== VERSION) fail(`Unsupported export version ${JSON.stringify(obj.version)}; this app reads version ${VERSION}.`);
      onlyKeys(obj, ['app', 'version', 'exportedAt', 'study', 'tutor'], 'the file');
      if (typeof obj.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(obj.exportedAt) || isNaN(Date.parse(obj.exportedAt))) fail('exportedAt must be an ISO date.');
      const data = { app: APP, version: VERSION, exportedAt: obj.exportedAt, study: validStudy(obj.study, bookIds), tutor: validTutor(obj.tutor === undefined ? {} : obj.tutor, bookIds) };
      return { ok: true, data };
    } catch (e) {
      if (e instanceof Invalid) return { ok: false, error: e.message };
      return { ok: false, error: 'The file could not be read.' };
    }
  }

  // Normalises raw localStorage values into export-shaped objects (tolerant: local data is ours).
  function fromStorage(studyRaw, tutorRaw) {
    let s = {}, t = {};
    try { s = JSON.parse(studyRaw || '{}') || {}; } catch (e) { s = {}; }
    try { t = JSON.parse(tutorRaw || '{}') || {}; } catch (e) { t = {}; }
    const study = { books: isObj(s.books) ? s.books : {}, last: s.last || null, recent: Array.isArray(s.recent) ? s.recent : [], sessions: Array.isArray(s.sessions) ? s.sessions : [] };
    if (isObj(s.sessionPrefs)) study.sessionPrefs = s.sessionPrefs;
    const conversations = {};
    for (const [k, v] of Object.entries(t)) if (k !== '_prefs' && isObj(v)) conversations[k] = v;
    return { study, tutor: { prefs: isObj(t._prefs) ? { ...t._prefs } : {}, conversations } };
  }
  function toStorage({ study, tutor }) {
    const t = { ...(tutor.conversations || {}) };
    if (tutor.prefs && Object.keys(tutor.prefs).length) t._prefs = tutor.prefs;
    return { study: JSON.stringify(study), tutor: JSON.stringify(t) };
  }
  function build(local, { conversations = false, now = new Date() } = {}) {
    const tutor = { prefs: local.tutor.prefs || {} };
    if (conversations) tutor.conversations = local.tutor.conversations || {};
    return { app: APP, version: VERSION, exportedAt: now.toISOString(), study: local.study, tutor };
  }

  function counts(data) {
    const c = { attempts: 0, mistakes: 0, sessions: (data.study.sessions || []).length, books: 0, bookmarks: 0, difficult: 0, notes: 0, reviews: 0, chaptersDone: 0, recent: 0, conversations: 0, style: null };
    for (const b of Object.values(data.study.books || {})) {
      c.books++;
      for (const m of Object.values(b.marks || {})) { if (m.b) c.bookmarks++; if (m.d) c.difficult++; }
      c.notes += Object.keys(b.notes || {}).length;
      c.reviews += Object.keys(b.review || {}).length;
      for (const l of Object.values(b.attempts || {})) { c.attempts += l.length; if (l.length && !l[l.length - 1].ok) c.mistakes++; }
      c.chaptersDone += Object.keys(b.done || {}).length;
    }
    c.recent = (data.study.recent || []).length;
    c.conversations = Object.values((data.tutor && data.tutor.conversations) || {}).filter(x => x.messages && x.messages.length).length;
    c.style = (data.tutor && data.tutor.prefs && data.tutor.prefs.style) || null;
    return c;
  }

  const newer = (a, b) => (!a ? b : !b ? a : (b.at > a.at ? b : a));
  const lastAt = (recent, book) => Math.max(0, ...recent.filter(r => r.book === book).map(r => r.at || 0));
  // Merge: union of marks/notes/reviews/completions; newer timestamp wins on conflict; progress takes the max.
  function merge(local, incoming) {
    const L = local.study, I = incoming.study, books = {};
    for (const id of new Set([...Object.keys(L.books || {}), ...Object.keys(I.books || {})])) {
      const a = L.books[id] || {}, b = I.books[id] || {};
      const out = { done: { ...(a.done || {}), ...(b.done || {}) }, marks: {}, seen: { ...(a.seen || {}) }, notes: {}, review: {} };
      for (const k of new Set([...Object.keys(a.marks || {}), ...Object.keys(b.marks || {})])) {
        const x = (a.marks || {})[k] || {}, y = (b.marks || {})[k] || {};
        out.marks[k] = flags(!!(x.b || y.b), !!(x.d || y.d));
      }
      for (const [k, v] of Object.entries(b.seen || {})) out.seen[k] = Math.max(out.seen[k] || 0, v);
      out.attempts = {};
      for (const k of new Set([...Object.keys(a.attempts || {}), ...Object.keys(b.attempts || {})])) {
        const seenA = new Set(), all = [];
        for (const x of [...((a.attempts || {})[k] || []), ...((b.attempts || {})[k] || [])]) { const key = x.at + ':' + x.k; if (!seenA.has(key)) { seenA.add(key); all.push(x); } }
        out.attempts[k] = all.sort((x, y) => x.at - y.at).slice(-MAX_ATTEMPTS);
      }
      for (const f of ['notes', 'review']) for (const k of new Set([...Object.keys(a[f] || {}), ...Object.keys(b[f] || {})])) out[f][k] = newer((a[f] || {})[k], (b[f] || {})[k]);
      // resume position: from whichever side studied this book most recently
      const useB = b.chapter != null && (a.chapter == null || lastAt(I.recent || [], id) > lastAt(L.recent || [], id));
      out.chapter = useB ? b.chapter : (a.chapter != null ? a.chapter : null);
      out.card = useB ? (b.card || 0) : (a.card || 0);
      books[id] = out;
    }
    const rmap = new Map();
    for (const r of [...(L.recent || []), ...(I.recent || [])]) { const k = r.book + '/' + r.chapter; rmap.set(k, newer(rmap.get(k), r)); }
    const recent = [...rmap.values()].sort((x, y) => y.at - x.at).slice(0, MAX_RECENT);
    const last = recent.length ? recent[0].book : (L.last || I.last || null);
    const prefs = { ...(incoming.tutor.prefs || {}), ...(local.tutor.prefs || {}) }; // keep this browser's choice if set
    const conversations = { ...(local.tutor.conversations || {}) };
    for (const [id, c] of Object.entries(incoming.tutor.conversations || {})) {
      const mine = conversations[id], at = x => Math.max(0, ...((x && x.messages) || []).map(m => m.at || 0));
      if (!mine || !(mine.messages || []).length || at(c) > at(mine)) conversations[id] = c;
    }
    const smap = new Map();
    for (const x of [...(L.sessions || []), ...(I.sessions || [])]) smap.set(x.book + '/' + x.start, x);
    const sessions = [...smap.values()].sort((x, y) => y.start - x.start).slice(0, 20);
    const study = { books, last, recent, sessions };
    const sp = L.sessionPrefs || I.sessionPrefs; if (sp) study.sessionPrefs = sp;
    return { study, tutor: { prefs, conversations } };
  }
  // Overwrite: study data and style come from the file. Conversations are replaced only if the file has them.
  function overwrite(local, incoming) {
    return {
      study: incoming.study,
      tutor: { prefs: { ...(incoming.tutor.prefs || {}) }, conversations: incoming.tutor.conversations ? incoming.tutor.conversations : (local.tutor.conversations || {}) },
    };
  }

  // Repairs whatever is in localStorage into the shape the app expects, dropping only malformed pieces.
  // Returns { study, repaired } where repaired is true if anything had to be dropped or reset.
  function sanitizeStudy(raw) {
    let repaired = false;
    const s = isObj(raw) ? raw : (repaired = raw !== undefined && raw !== null, {});
    const books = {};
    const objOr = (v, f) => { if (v === undefined) return {}; if (!isObj(v)) { repaired = true; return {}; } const o = {}; for (const [k, x] of Object.entries(v)) { if (f(k, x)) o[k] = x; else repaired = true; } return o; };
    if (s.books !== undefined && !isObj(s.books)) repaired = true;
    for (const [id, b] of Object.entries(isObj(s.books) ? s.books : {})) {
      if (!BOOK_RE.test(id) || !isObj(b)) { repaired = true; continue; }
      const chapter = b.chapter === null || b.chapter === undefined || isInt(b.chapter, 1) ? (b.chapter ?? null) : (repaired = true, null);
      const card = b.card === undefined || isInt(b.card) ? (b.card || 0) : (repaired = true, 0);
      books[id] = {
        chapter, card,
        done: objOr(b.done, (k, v) => CH_RE.test(k) && v === true),
        marks: objOr(b.marks, (k, v) => CARD_RE.test(k) && isObj(v)),
        seen: objOr(b.seen, (k, v) => CH_RE.test(k) && isInt(v)),
        notes: objOr(b.notes, (k, v) => CARD_RE.test(k) && isObj(v) && typeof v.text === 'string' && isTime(v.at)),
        attempts: objOr(b.attempts, (k, v) => QUIZ_RE.test(k) && Array.isArray(v) && v.every(a => isObj(a) && Number.isInteger(a.k) && typeof a.ok === 'boolean' && isTime(a.at))),
        review: objOr(b.review, (k, v) => CARD_RE.test(k) && isObj(v) && (v.r === 'got' || v.r === 'again') && isTime(v.at)),
      };
    }
    const arr = (v, f) => { if (v === undefined) return []; if (!Array.isArray(v)) { repaired = true; return []; } const a = v.filter(f); if (a.length !== v.length) repaired = true; return a; };
    const recent = arr(s.recent, r => isObj(r) && typeof r.book === 'string' && isInt(r.chapter, 1) && isInt(r.card) && isTime(r.at));
    const sessions = arr(s.sessions, x => isObj(x) && typeof x.book === 'string' && isTime(x.start) && isInt(x.seen) && isInt(x.seconds));
    let last = s.last === undefined || s.last === null ? null : s.last;
    if (last !== null && typeof last !== 'string') { repaired = true; last = null; }
    const study = { books, last, recent, sessions };
    if (s.sessionPrefs !== undefined) { if (isObj(s.sessionPrefs)) study.sessionPrefs = s.sessionPrefs; else repaired = true; }
    return { study, repaired };
  }

  // Notes as Markdown: grouped by book, chapter and card heading (in book order); card equation as $$latex$$.
  function notesMarkdown(study, books, { now = new Date() } = {}) {
    const plain = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const out = ['# LearnScroll notes', '', `Exported ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.`, ''];
    let count = 0;
    for (const book of books) {
      const notes = ((study.books || {})[book.id] || {}).notes || {};
      if (!Object.keys(notes).length) continue;
      const used = new Set(), parts = [];
      for (const ch of book.chapters) {
        const items = [];
        (ch.cards || []).forEach((c, i) => { const id = `c${ch.n}-${i + 1}`; if (notes[id]) items.push({ id, h: plain(c.h), eq: c.eq }); });
        (ch.quiz || []).forEach((q, i) => { const id = `c${ch.n}-q${i + 1}`; if (notes[id]) items.push({ id, h: `Practice question ${i + 1}: ${plain(q.q)}` }); });
        if (!items.length) continue;
        parts.push(`### Chapter ${ch.n}: ${plain(ch.title)}`, '');
        for (const it of items) {
          used.add(it.id); count++;
          parts.push(`#### ${it.h}`, '');
          if (it.eq) parts.push(`$$${it.eq}$$`, '');
          parts.push(notes[it.id].text.replace(/\r\n?/g, '\n').trim(), '');
        }
      }
      const other = Object.keys(notes).filter(id => !used.has(id)).sort();
      if (other.length) {
        parts.push('### Other notes', '');
        for (const id of other) { count++; parts.push(`#### Card ${id}`, '', notes[id].text.trim(), ''); }
      }
      out.push(`## ${plain(book.title)}`, '', ...parts);
    }
    return { markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', count };
  }

  // 'Needs attention': up to `limit` items from local data, in priority order: chapters with quiz mistakes,
  // difficult cards, review-again cards, unfinished chapters. `shown` lists what Recently studied already shows
  // ({ book, chapter, card } with card 0-based); those chapters/cards are skipped.
  function needsAttention(study, books, { shown = [], limit = 5 } = {}) {
    const ready = ch => Array.isArray(ch.cards) && ch.cards.length > 0;
    const screens = ch => ch.cards.length + (ch.quiz || []).length;
    const shownCh = new Set(shown.map(r => `${r.book}/${r.chapter}`)), shownCard = new Set(shown.map(r => `${r.book}/${r.chapter}/${r.card}`));
    const strip = s => String(s || '').replace(/<[^>]*>/g, '').trim();
    const pick = { mistakes: [], difficult: [], again: [], unfinished: [] };
    for (const book of books) {
      const bs = (study.books || {})[book.id]; if (!bs) continue;
      for (const ch of book.chapters.filter(ready)) {
        const n = screens(ch);
        const miss = (ch.quiz || []).filter((_, i) => { const l = (bs.attempts || {})[`c${ch.n}-q${i + 1}`]; return l && l.length && !l[l.length - 1].ok; }).length;
        if (miss) pick.mistakes.push({ kind: 'mistakes', book: book.id, chapter: ch.n, count: miss, title: `${miss} quiz mistake${miss === 1 ? '' : 's'} · Ch ${ch.n}: ${strip(ch.title)}`, href: `#/mistakes/${book.id}/${ch.n}` });
        for (let i = 0; i < n; i++) {
          const id = i < ch.cards.length ? `c${ch.n}-${i + 1}` : `c${ch.n}-q${i - ch.cards.length + 1}`;
          if (shownCard.has(`${book.id}/${ch.n}/${i}`)) continue;
          const h = i < ch.cards.length ? strip(ch.cards[i].h) : `Practice: ${strip(ch.quiz[i - ch.cards.length].q)}`;
          const item = { book: book.id, chapter: ch.n, card: i, title: h, href: `#/read/${book.id}/${ch.n}/${i + 1}` };
          if (bs.marks && bs.marks[id] && bs.marks[id].d) pick.difficult.push({ ...item, kind: 'difficult' });
          else if (bs.review && bs.review[id] && bs.review[id].r === 'again') pick.again.push({ ...item, kind: 'again', at: bs.review[id].at });
        }
        const seen = bs.seen && bs.seen[ch.n];
        if (Number.isInteger(seen) && !(bs.done && bs.done[ch.n]) && !shownCh.has(`${book.id}/${ch.n}`)) {
          const next = Math.min(seen + 1, n - 1);
          pick.unfinished.push({ kind: 'unfinished', book: book.id, chapter: ch.n, card: next, title: `Ch ${ch.n}: ${strip(ch.title)}`, detail: `${seen + 1} of ${n} cards`, href: `#/read/${book.id}/${ch.n}/${next + 1}` });
        }
      }
    }
    pick.again.sort((a, b) => b.at - a.at);
    return [...pick.mistakes, ...pick.difficult, ...pick.again, ...pick.unfinished].slice(0, limit);
  }

  const api = { needsAttention, notesMarkdown, sanitizeStudy, APP, VERSION, STUDY_KEY, TUTOR_KEY, parse, fromStorage, toStorage, build, counts, merge, overwrite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StudyData = api;
})(typeof window !== 'undefined' ? window : globalThis);
