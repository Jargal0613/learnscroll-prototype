// LearnScroll study data export / import: pure, testable logic (browser global StudyData + CommonJS).
// Nothing here touches the network; the app reads/writes localStorage and calls these functions.
(function (root) {
  const APP = 'learnscroll', VERSION = 1;
  const STUDY_KEY = 'learnscroll-study-v1', TUTOR_KEY = 'learnscroll-tutor-v1';
  const STYLES = ['default', 'simple', 'math', 'example'];
  const SCOPES = ['card', 'chapter', 'book'];
  const MAX_BYTES = 5 * 1024 * 1024, MAX_RECENT = 10, MAX_NOTE = 4000, MAX_MSGS = 60, MAX_MSG = 20000;
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
    onlyKeys(b, ['chapter', 'card', 'done', 'marks', 'seen', 'notes', 'review'], where);
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
    };
  }
  function validStudy(s, bookIds) {
    if (!isObj(s)) fail('"study" must be an object.');
    onlyKeys(s, ['books', 'last', 'recent'], 'study');
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
    return { books, last: s.last || null, recent };
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
          const out = { role: m.role, content: m.content };
          for (const k of ['where', 'at', 'sources', 'passages', 'retrieval']) if (m[k] !== undefined) out[k] = m[k];
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
    const study = { books: isObj(s.books) ? s.books : {}, last: s.last || null, recent: Array.isArray(s.recent) ? s.recent : [] };
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
    const c = { books: 0, bookmarks: 0, difficult: 0, notes: 0, reviews: 0, chaptersDone: 0, recent: 0, conversations: 0, style: null };
    for (const b of Object.values(data.study.books || {})) {
      c.books++;
      for (const m of Object.values(b.marks || {})) { if (m.b) c.bookmarks++; if (m.d) c.difficult++; }
      c.notes += Object.keys(b.notes || {}).length;
      c.reviews += Object.keys(b.review || {}).length;
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
    return { study: { books, last, recent }, tutor: { prefs, conversations } };
  }
  // Overwrite: study data and style come from the file. Conversations are replaced only if the file has them.
  function overwrite(local, incoming) {
    return {
      study: incoming.study,
      tutor: { prefs: { ...(incoming.tutor.prefs || {}) }, conversations: incoming.tutor.conversations ? incoming.tutor.conversations : (local.tutor.conversations || {}) },
    };
  }

  const api = { APP, VERSION, STUDY_KEY, TUTOR_KEY, parse, fromStorage, toStorage, build, counts, merge, overwrite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StudyData = api;
})(typeof window !== 'undefined' ? window : globalThis);
