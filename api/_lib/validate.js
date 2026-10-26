const { getBook, findCard } = require('./books');
const { E } = require('./errors');

const LIMITS = { question: 2000, message: 4000, messages: 12, keptMessages: 10, cardText: 4000, conversationId: 64 };
const SCOPES = ['card', 'chapter', 'book'];
const str = v => typeof v === 'string';

// Returns a normalized request built ONLY from server-known data where possible.
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw E.bad('Request body must be a JSON object.');
  const book = str(body.bookId) && getBook(body.bookId);
  if (!book) throw E.bad('Unknown book.');
  const chapterN = Number(body.chapterId);
  const chapter = Number.isInteger(chapterN) ? book.chapters.find(c => c.n === chapterN) : null;
  if (!chapter) throw E.bad('Unknown chapter for this book.');
  const scope = body.scope === undefined ? 'chapter' : body.scope;
  if (!SCOPES.includes(scope)) throw E.bad('Scope must be card, chapter or book.');
  if (!str(body.question) || !body.question.trim()) throw E.bad('Question is required.');
  const question = body.question.trim();
  if (question.length > LIMITS.question) throw E.bad(`Question is too long (max ${LIMITS.question} characters).`);
  let card = null;
  if (body.cardId !== undefined && body.cardId !== null) {
    if (!str(body.cardId) || body.cardId.length > 20) throw E.bad('Invalid card id.');
    card = findCard(book, chapter.n, body.cardId);
    if (!card) throw E.bad('Unknown card for this chapter.');
    card.id = body.cardId; // server copy of the card; client-supplied card content is ignored
  }
  if (scope === 'card' && !card) throw E.bad('Card scope needs a card id.');
  if (body.card !== undefined && (typeof body.card !== 'object' || JSON.stringify(body.card).length > LIMITS.cardText)) throw E.bad('Card content is too large.');
  let conversationId = null;
  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (!str(body.conversationId) || !/^[A-Za-z0-9_-]{1,64}$/.test(body.conversationId)) throw E.bad('Invalid conversation id.');
    conversationId = body.conversationId;
  }
  const raw = body.messages === undefined ? [] : body.messages;
  if (!Array.isArray(raw)) throw E.bad('Messages must be an array.');
  if (raw.length > 50) throw E.bad('Too many messages.');
  const messages = raw.slice(-LIMITS.keptMessages).map(m => {
    if (!m || !['user', 'assistant'].includes(m.role) || !str(m.content)) throw E.bad('Each message needs role user|assistant and text content.');
    return { role: m.role, content: m.content.slice(0, LIMITS.message) };
  });
  return { book, chapter, card, scope, question, conversationId, messages };
}
module.exports = { validate, LIMITS, SCOPES };
