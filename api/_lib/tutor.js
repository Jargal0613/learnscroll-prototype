// Pipeline: validate -> provider -> (File Search | local retrieval + prompt) -> verified citations.
const { validate } = require('./validate');
const { retrieve } = require('./retrieve');
const { buildPrompt, buildFileSearchPrompt } = require('./prompt');
const { getProvider } = require('./providers');
const knowledge = require('./knowledge');
const { E } = require('./errors');

const MAX_ANSWER = 8000;

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
  return {
    answer: out.text.slice(0, MAX_ANSWER).trim(), sources,
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
module.exports = { answer, status };
