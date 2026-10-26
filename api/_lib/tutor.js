// Pipeline: validate -> provider -> (File Search | local retrieval + prompt) -> verified citations.
const { validate } = require('./validate');
const { retrieve } = require('./retrieve');
const { buildPrompt, buildFileSearchPrompt } = require('./prompt');
const { getProvider } = require('./providers');
const knowledge = require('./knowledge');
const { E } = require('./errors');

const MAX_ANSWER = 8000;
const MAX_PASSAGES = 3, EXCERPT_CHARS = 300;
const { tokenize } = require('./retrieve');

// Short, cleaned excerpt of a passage OpenAI actually returned, centred on the sentence that best matches the
// question. Never more than EXCERPT_CHARS characters (copyright: short context only).
function excerpt(raw, question) {
  const lines = String(raw).replace(/\r/g, '').split('\n')
    .map(l => l.replace(/\S+\.indd\s+\d+\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*$/, '').trim())
    .filter(l => l.split(/\s+/).length >= 6); // drop figure labels, axis ticks, page furniture
  const text = lines.join(' ').replace(/[\uFFFE\u00AD]\s*/g, '').replace(/(\w)-\s+(\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const words = text.split(' ');
  if (words.filter(w => /^[\d–.,:-]+$/.test(w)).length / words.length > 0.12) return ''; // contents/index pages
  const q = new Set(tokenize(question));
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  let best = 0, bestScore = -1, pos = 0, bestPos = 0;
  sentences.forEach((sen, i) => {
    const sc = tokenize(sen).filter(t => q.has(t)).length;
    if (sc > bestScore && /^[A-Z(]/.test(sen.trim())) { bestScore = sc; best = i; bestPos = pos; }
    pos += sen.length;
  });
  if (bestScore < 0) { const k = text.search(/[.!?]\s+[A-Z]/); bestPos = k >= 0 ? k + 2 : 0; }
  let out = text.slice(bestPos).trim();
  if (/^[a-z]/.test(out)) out = '…' + out; // starts mid-sentence
  if (out.length > EXCERPT_CHARS) out = out.slice(0, EXCERPT_CHARS).replace(/\s+\S*$/, '') + '…';
  return out;
}
// Chapter is only reported when the passage itself carries the publisher's print footer (e.g. "..._ch03_p142-236.indd").
function verifiedChapter(raw) {
  const m = String(raw).match(/_ch(\d{2})_p\d+-\d+\.indd/);
  return m ? Number(m[1]) : null;
}

// Some model outputs contain raw inline citation markers (private-use chars, e.g. \uE200filecite\uE202turn0file6\uE201).
// The app shows sources separately, so strip them.
function cleanMarkers(t) {
  return String(t).replace(/\uE200[^\uE201]{0,200}\uE201/g, '').replace(/[\uE200-\uE2FF]/g, '').replace(/[ \t]+\n/g, '\n');
}

async function answer(body, { provider, env = process.env } = {}) {
  const req = validate(body);
  const p = provider || getProvider(env); // throws not_configured when no credentials
  if (p.kind === 'file_search') return answerFileSearch(req, p);
  const { sources, bookIndexAvailable } = retrieve(req);
  const messages = buildPrompt(req, sources, { bookIndexAvailable });
  let text = String(await p.complete(messages) || '').slice(0, MAX_ANSWER);
  // Citations: only refs that match a source we retrieved; anything else is stripped.
  const byRef = new Map(sources.map(s => [s.ref, s]));
  const used = new Set();
  text = text.replace(/\[(S\d{1,2})\]/g, (m, r) => (byRef.has(r) ? (used.add(r), m) : ''));
  const cited = sources.filter(s => used.has(s.ref)).map(({ text: _t, ...meta }) => meta);
  return { answer: text.trim(), sources: cited, retrieval: { bookIndexAvailable, consulted: sources.length }, conversationId: req.conversationId };
}

async function answerFileSearch(req, p) {
  const kb = knowledge.forBook(req.book.id); // server-side mapping only
  if (!kb) throw E.notAvailable();
  const { instructions, input } = buildFileSearchPrompt(req);
  const out = await p.respond({ instructions, input, vectorStoreId: kb.vectorStoreId });
  // Sources: only file_citation annotations that point at this book's own uploaded file. No page numbers are
  // claimed because the annotations do not carry them.
  const seen = new Set(), sources = [];
  for (const c of out.citations) {
    if (c.fileId !== kb.fileId || seen.has(c.fileId)) continue;
    seen.add(c.fileId);
    sources.push({ id: c.fileId, kind: 'book', filename: c.filename || kb.filename, label: `${req.book.short} (${req.book.edition}), textbook PDF “${c.filename || kb.filename}”`, citations: out.citations.filter(x => x.fileId === c.fileId).length });
  }
  // Retrieved passages: only from this book's file, only when the answer cites the book or has a
  // "From the textbook" section (off-topic refusals show none).
  const usesBook = sources.length > 0 || /^#{1,4}\s*\**from the textbook/im.test(out.text);
  const passages = !usesBook ? [] : (out.passages || [])
    .filter(x => x.fileId === kb.fileId)
    .sort((a, b) => b.score - a.score)
    .map(x => ({ excerpt: excerpt(x.text, req.question), chapter: verifiedChapter(x.text), score: Math.round(x.score * 1000) / 1000 }))
    .filter(x => x.excerpt.length >= 40)
    .filter((x, i, arr) => arr.findIndex(y => y.excerpt === x.excerpt) === i)
    .slice(0, MAX_PASSAGES)
    .map(x => ({ ...x, book: `${req.book.short} (${req.book.edition})`, label: 'Retrieved passage', page: null }));
  return {
    answer: cleanMarkers(out.text).slice(0, MAX_ANSWER).trim(), sources, passages,
    retrieval: { provider: 'openai-file-search', model: p.model, searched: out.searched, passages: out.results, usage: out.usage },
    conversationId: req.conversationId,
  };
}

// Public status for the panel: which books the tutor can answer for. No ids or secrets.
function status(env = process.env) {
  let p = null; try { p = getProvider(env); } catch (e) { p = null; }
  const { BOOK_IDS } = require('./books');
  const books = {};
  for (const id of BOOK_IDS) books[id] = !!p && (p.kind !== 'file_search' || !!knowledge.forBook(id));
  return { configured: !!p, provider: p ? p.name : null, books };
}
module.exports = { answer, status, excerpt, verifiedChapter, cleanMarkers };
