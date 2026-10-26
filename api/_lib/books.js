// Server-side book data: the same data/*.json the site uses (LearnScroll's own original notes) plus the
// optional PRIVATE textbook index (see TUTOR.md). Client-supplied ids are only trusted if they resolve here.
const fs = require('fs');
const path = require('path');

const BOOK_IDS = ['heat-mass-transfer', 'koretsky-thermo', 'electric-circuits', 'university-physics', 'chemistry-silberberg'];
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const cache = {};

function getBook(id) {
  if (!BOOK_IDS.includes(id)) return null;
  if (!cache[id]) cache[id] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, id + '.json'), 'utf8'));
  return cache[id];
}
// Stable card ids derived from chapter + position: c<chapter>-<n> for cards, c<chapter>-q<n> for questions.
const cardId = (ch, i) => `c${ch}-${i + 1}`;
const quizId = (ch, i) => `c${ch}-q${i + 1}`;
function findCard(book, chapter, id) {
  const ch = book.chapters.find(c => c.n === chapter);
  if (!ch || !id) return null;
  const i = (ch.cards || []).findIndex((_, k) => cardId(ch.n, k) === id);
  if (i >= 0) return { kind: 'card', index: i, ...ch.cards[i] };
  const q = (ch.quiz || []).findIndex((_, k) => quizId(ch.n, k) === id);
  if (q >= 0) return { kind: 'quiz', index: q, ...ch.quiz[q] };
  return null;
}

let indexDirOverride = null;
const indexCache = {};
function indexDir() { return indexDirOverride || process.env.TUTOR_INDEX_DIR || path.join(__dirname, '..', '..', 'private', 'book-index'); }
function setIndexDir(d) { indexDirOverride = d; for (const k in indexCache) delete indexCache[k]; }
// Returns the private textbook chunks for a book, or null when no index is available.
function getBookIndex(id) {
  if (id in indexCache) return indexCache[id];
  let v = null;
  try { v = JSON.parse(fs.readFileSync(path.join(indexDir(), id + '.json'), 'utf8')); } catch (e) { v = null; }
  return (indexCache[id] = v && Array.isArray(v.chunks) ? v : null);
}

module.exports = { BOOK_IDS, getBook, findCard, cardId, quizId, getBookIndex, setIndexDir };
