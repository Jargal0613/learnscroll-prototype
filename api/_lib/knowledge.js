// Server-side map of book -> OpenAI vector store (written by scripts/index-book.js). Never taken from the client.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'knowledge.json');
let override = null;
function all() {
  if (override) return override;
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).books || {}; } catch (e) { return {}; }
}
// Returns { vectorStoreId, fileId, filename } for an indexed book, or null.
function forBook(bookId) {
  const r = all()[bookId];
  return r && r.status === 'completed' && r.vectorStoreId && r.fileId ? { vectorStoreId: r.vectorStoreId, fileId: r.fileId, filename: r.filename } : null;
}
const setKnowledge = k => { override = k; };
module.exports = { forBook, all, setKnowledge };
