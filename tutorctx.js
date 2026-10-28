// Page context for the tutor: a small, versioned, allowlisted description of what the student is looking at.
// Built in the browser from app data (no AI call is ever made to build it) and validated AGAIN on the server
// with the same function. Anything unknown is dropped; student-typed text is bounded and treated as data.
(function (root) {
  const SCHEMA_VERSION = 1;
  const PAGE_TYPES = ['reader', 'quiz', 'formula-notebook', 'calculation-workspace', 'guided-practice', 'progress', 'study-sheets'];
  const LIMITS = { excerpt: 600, refs: 4, ref: 40, stateKeys: 12, stateValue: 160, total: 2500 };
  // allowed pageState keys per page type (values: short strings, finite numbers or booleans)
  const STATE_KEYS = {
    reader: ['cardTitle', 'cardIndex', 'cards'],
    quiz: ['question', 'selected', 'correct', 'attempts'],
    'formula-notebook': ['formulaTitle', 'saved', 'custom'],
    'calculation-workspace': ['calculator', 'solveFor', 'inputs', 'result', 'error'],
    'guided-practice': ['example', 'step', 'attempt', 'hintsUsed', 'stepsDone', 'solved'],
    progress: ['cardsOpened', 'quizAnswers', 'needsReview', 'chapterViewed'],
    'study-sheets': ['sheetTitle', 'items', 'selectedItem'],
  };
  const CARD_RE = /^c(\d{1,2})-(q?)(\d{1,3})$/, SECTION_RE = /^(\d{1,2}–\d{1,3}|Topic)$/;
  const REF_RE = /^(Eqs?\.|Sec\.|Example)\s[\d–(),\sandto.]{1,30}$/;
  const ITEM_RE = { 'formula-notebook': /^f(-[a-z0-9-]{1,40}-c\d{1,3}-\d{1,4}|c-[a-z0-9]{4,24})$/, 'calculation-workspace': /^[a-z0-9-]{2,40}$/, 'guided-practice': /^ex\d{1,2}-\d{1,2}$/, 'study-sheets': /^s-[a-z0-9]{4,24}$/ };
  // Remove control characters and invisible formatting, collapse whitespace, cut to n characters.
  const clean = (s, n) => String(s).replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uE000-\uF8FF]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const chapterOf = (book, n) => book && Array.isArray(book.chapters) ? book.chapters.find(c => c.n === n && Array.isArray(c.cards) && c.cards.length) : null;
  function cardExists(book, id) {
    const m = CARD_RE.exec(id); if (!m) return false;
    const ch = chapterOf(book, Number(m[1])); if (!ch) return false;
    const i = Number(m[3]) - 1; return m[2] ? !!(ch.quiz || [])[i] : !!ch.cards[i];
  }
  // known: optional { calcIds: Set, practiceIds: Set } so the server can check ids it owns
  function sanitize(raw, book, known = {}) {
    const dropped = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ctx: null, dropped: ['all'] };
    if (raw.schemaVersion !== SCHEMA_VERSION || !PAGE_TYPES.includes(raw.pageType)) return { ctx: null, dropped: ['all'] };
    if (!book || raw.bookId !== book.id) return { ctx: null, dropped: ['all'] };
    const t = raw.pageType, out = { schemaVersion: SCHEMA_VERSION, pageType: t, bookId: book.id, chapterId: null, itemId: null, sectionId: null, excerpt: null, sourceRefs: [], pageState: {} };
    for (const k of Object.keys(raw)) if (!(k in out)) dropped.push(k);
    if (raw.chapterId !== null && raw.chapterId !== undefined) { if (Number.isInteger(raw.chapterId) && chapterOf(book, raw.chapterId)) out.chapterId = raw.chapterId; else dropped.push('chapterId'); }
    if (raw.itemId !== null && raw.itemId !== undefined) {
      const id = typeof raw.itemId === 'string' ? raw.itemId : '';
      let okId = false;
      if (t === 'reader' || t === 'quiz') okId = cardExists(book, id) && (t === 'quiz') === /-q\d/.test(id) && (out.chapterId === null || id.startsWith(`c${out.chapterId}-`));
      else if (t === 'formula-notebook') okId = ITEM_RE[t].test(id);
      else if (t === 'calculation-workspace') okId = ITEM_RE[t].test(id) && (!known.calcIds || known.calcIds.has(id));
      else if (t === 'guided-practice') okId = ITEM_RE[t].test(id) && (!known.practiceIds || known.practiceIds.has(id));
      else if (t === 'study-sheets') okId = ITEM_RE[t].test(id);
      if (okId) out.itemId = id; else dropped.push('itemId');
    }
    if (raw.sectionId !== null && raw.sectionId !== undefined) { if (typeof raw.sectionId === 'string' && SECTION_RE.test(raw.sectionId)) out.sectionId = raw.sectionId; else dropped.push('sectionId'); }
    if (raw.excerpt !== null && raw.excerpt !== undefined) { if (typeof raw.excerpt === 'string' && raw.excerpt.trim()) out.excerpt = clean(raw.excerpt, LIMITS.excerpt); else dropped.push('excerpt'); }
    if (Array.isArray(raw.sourceRefs)) for (const r of raw.sourceRefs.slice(0, LIMITS.refs)) { if (typeof r === 'string' && r.length <= LIMITS.ref && REF_RE.test(r)) out.sourceRefs.push(r); else dropped.push('sourceRefs'); }
    if (raw.pageState && typeof raw.pageState === 'object' && !Array.isArray(raw.pageState)) {
      const allow = STATE_KEYS[t];
      for (const [k, v] of Object.entries(raw.pageState).slice(0, 40)) {
        if (!allow.includes(k) || Object.keys(out.pageState).length >= LIMITS.stateKeys) { dropped.push(`pageState.${k}`); continue; }
        if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out.pageState[k] = v;
        else if (typeof v === 'string' && v.trim()) out.pageState[k] = clean(v, LIMITS.stateValue);
        else dropped.push(`pageState.${k}`);
      }
    }
    // whole-object bound: shorten the excerpt first if needed
    if (JSON.stringify(out).length > LIMITS.total && out.excerpt) out.excerpt = out.excerpt.slice(0, Math.max(0, out.excerpt.length - (JSON.stringify(out).length - LIMITS.total)));
    return { ctx: out, dropped };
  }
  const LABEL = { reader: 'Reader', quiz: 'Quiz', 'formula-notebook': 'Formula notebook', 'calculation-workspace': 'Calculation workspace', 'guided-practice': 'Guided practice', progress: 'My progress', 'study-sheets': 'Study sheets' };
  const api = { SCHEMA_VERSION, PAGE_TYPES, STATE_KEYS, LIMITS, LABEL, sanitize, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TutorCtx = api;
})(typeof window !== 'undefined' ? window : globalThis);
