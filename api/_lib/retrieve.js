// Lexical BM25 retrieval over (a) the private textbook index when present and (b) LearnScroll's own card notes.
const { getBookIndex, cardId, quizId } = require('./books');

const STOP = new Set('a an and are as at be by for from has have how i in is it its of on or that the this to was what when where which why with you your me my we can do does explain more simply walk through give similar example equation'.split(' '));
const tokenize = s => String(s).toLowerCase().normalize('NFKD').replace(/\\[a-z]+/g, ' ').match(/[a-z0-9]+/g)?.filter(t => t.length > 1 && !STOP.has(t)) || [];

class BM25 {
  constructor(docs, k1 = 1.4, b = 0.75) {
    this.docs = docs; this.k1 = k1; this.b = b;
    this.tf = docs.map(d => { const m = new Map(); for (const t of tokenize(d.text)) m.set(t, (m.get(t) || 0) + 1); return m; });
    this.len = this.tf.map(m => { let n = 0; for (const v of m.values()) n += v; return n; });
    this.avg = this.len.reduce((a, b) => a + b, 0) / (docs.length || 1);
    this.df = new Map();
    for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }
  search(query, filter, k) {
    const q = [...new Set(tokenize(query))];
    const N = this.docs.length, out = [];
    for (let i = 0; i < N; i++) {
      if (filter && !filter(this.docs[i])) continue;
      let s = 0;
      for (const t of q) {
        const f = this.tf[i].get(t); if (!f) continue;
        const idf = Math.log(1 + (N - this.df.get(t) + 0.5) / (this.df.get(t) + 0.5));
        s += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg));
      }
      if (s > 0) out.push({ doc: this.docs[i], score: s });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

const bookBM = new WeakMap(), notesBM = {};
function notesDocs(book) {
  const docs = [];
  for (const ch of book.chapters) {
    (ch.cards || []).forEach((c, i) => docs.push({ id: `notes:${book.id}:${cardId(ch.n, i)}`, kind: 'notes', chapter: ch.n, card: i + 1, cardId: cardId(ch.n, i), section: c.s, heading: c.h, text: [c.h, c.t, c.eq, c.def, c.ex].filter(Boolean).join(' ') }));
    (ch.quiz || []).forEach((q, i) => docs.push({ id: `notes:${book.id}:${quizId(ch.n, i)}`, kind: 'notes', chapter: ch.n, card: (ch.cards || []).length + i + 1, cardId: quizId(ch.n, i), heading: 'Practice question', text: [q.q, q.why].join(' ') }));
  }
  return docs;
}

// Returns { sources, bookIndexAvailable }. Each source has server-generated metadata and the text for the prompt.
function retrieve({ book, chapter, card, scope, question }, opts = {}) {
  const kBook = opts.kBook || 5, kNotes = opts.kNotes || 3;
  const query = [question, card && card.h, card && card.q].filter(Boolean).join(' ');
  const inScope = d => scope === 'book' || d.chapter === chapter.n;
  const idx = getBookIndex(book.id);
  let bookHits = [];
  if (idx) {
    let bm = bookBM.get(idx); if (!bm) bookBM.set(idx, (bm = new BM25(idx.chunks)));
    bookHits = bm.search(query, inScope, kBook).map(h => ({
      id: h.doc.id, kind: 'book', chapter: h.doc.chapter, page: h.doc.page, printedPage: h.doc.printedPage ?? null, section: h.doc.section || null, text: h.doc.text,
    }));
  }
  const nb = notesBM[book.id] || (notesBM[book.id] = new BM25(notesDocs(book)));
  let noteHits = nb.search(query, inScope, kNotes).map(h => h.doc);
  // Always include the current card's own note when asking about a card.
  if (card && card.id) {
    const own = nb.docs.find(d => d.cardId === card.id);
    if (own) noteHits = [own, ...noteHits.filter(d => d.id !== own.id)].slice(0, kNotes);
  }
  const sources = [...bookHits, ...noteHits.map(d => ({ id: d.id, kind: 'notes', chapter: d.chapter, card: d.card, cardId: d.cardId, section: d.section || null, heading: d.heading, text: d.text }))];
  sources.forEach((s, i) => { s.ref = `S${i + 1}`; s.label = label(book, s); });
  return { sources, bookIndexAvailable: !!idx };
}
function label(book, s) {
  if (s.kind === 'notes') return `LearnScroll notes, Ch ${s.chapter} card ${s.card}${s.heading ? ` (${s.heading})` : ''}`;
  const page = s.printedPage ? `p. ${s.printedPage} (PDF p. ${s.page})` : `PDF p. ${s.page}`;
  return `${book.short}, ${s.chapter ? `Ch ${s.chapter}, ` : ''}${s.section ? s.section + ', ' : ''}${page}`;
}
module.exports = { retrieve, BM25, tokenize };
