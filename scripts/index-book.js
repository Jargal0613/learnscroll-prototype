#!/usr/bin/env node
// Upload ONE book PDF to the owner's OpenAI account and attach it to a vector store for File Search.
// Usage: OPENAI_API_KEY=... node scripts/index-book.js <bookId> <path/to/book.pdf>
// - Dedupes by SHA-256: if api/_lib/knowledge.json already records the same hash with status "completed", it skips.
// - Records vectorStoreId, fileId, sha256, status, errors and timestamps in api/_lib/knowledge.json (server-side only;
//   ids are not secrets but are NEVER accepted from the browser).
// - Only upload books the owner is authorized to upload. Nothing is printed about the API key.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
const { BOOK_IDS } = require('../api/_lib/books');

const KNOW = path.join(__dirname, '..', 'api', '_lib', 'knowledge.json');
const MAX_BYTES = 512 * 1024 * 1024; // OpenAI per-file upload limit

async function main() {
  const [bookId, pdf] = process.argv.slice(2);
  if (!BOOK_IDS.includes(bookId) || !pdf) throw new Error('Usage: node scripts/index-book.js <bookId> <file.pdf>');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.');
  const stat = fs.statSync(pdf);
  if (stat.size > MAX_BYTES) throw new Error(`File is ${stat.size} bytes; OpenAI's per-file limit is 512 MB.`);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex');
  const know = fs.existsSync(KNOW) ? JSON.parse(fs.readFileSync(KNOW, 'utf8')) : { books: {} };
  const prev = know.books[bookId];
  if (prev && prev.sha256 === sha256 && prev.status === 'completed') { console.log(`${bookId}: same file already indexed (${prev.vectorStoreId}); skipping.`); return; }

  const client = new OpenAI();
  const rec = { filename: path.basename(pdf), bytes: stat.size, sha256, status: 'in_progress', startedAt: new Date().toISOString() };
  const write = () => { know.books[bookId] = rec; fs.writeFileSync(KNOW, JSON.stringify(know, null, 2) + '\n'); };
  try {
    const vs = (prev && prev.vectorStoreId && prev.sha256 === sha256) ? { id: prev.vectorStoreId } : await client.vectorStores.create({ name: `learnscroll-${bookId}`, metadata: { app: 'learnscroll', book: bookId } });
    rec.vectorStoreId = vs.id; write();
    let fileId = prev && prev.sha256 === sha256 ? prev.fileId : null;
    if (!fileId) {
      const f = await client.files.create({ file: fs.createReadStream(pdf), purpose: 'assistants' });
      fileId = f.id;
    }
    rec.fileId = fileId; write();
    console.log(`${bookId}: uploaded ${rec.filename} (${(stat.size / 1048576).toFixed(1)} MB) as ${fileId}; attaching to ${vs.id}…`);
    await client.vectorStores.files.create(vs.id, { file_id: fileId, attributes: { book: bookId } }).catch(e => { if (e.status !== 409) throw e; });
    const t0 = Date.now();
    for (;;) {
      const vf = await client.vectorStores.files.retrieve(fileId, { vector_store_id: vs.id });
      rec.fileStatus = vf.status; rec.usageBytes = vf.usage_bytes; rec.lastError = vf.last_error || null;
      if (vf.status !== 'in_progress') break;
      if (Date.now() - t0 > 30 * 60 * 1000) throw new Error('Timed out after 30 min waiting for file processing.');
      process.stdout.write('.'); await new Promise(r => setTimeout(r, 10000));
    }
    const store = await client.vectorStores.retrieve(vs.id);
    rec.vectorStoreUsageBytes = store.usage_bytes;
    rec.status = rec.fileStatus === 'completed' ? 'completed' : 'failed';
  } catch (e) {
    rec.status = 'failed'; rec.lastError = { message: String(e.message || e).slice(0, 300), status: e.status || null };
  }
  rec.finishedAt = new Date().toISOString();
  write();
  console.log(`\n${bookId}: ${rec.status}`, JSON.stringify({ vectorStoreId: rec.vectorStoreId, fileId: rec.fileId, fileStatus: rec.fileStatus, usageBytes: rec.usageBytes, lastError: rec.lastError }));
  if (rec.status !== 'completed') process.exitCode = 1;
}
main().catch(e => { console.error(String(e.message || e)); process.exitCode = 1; });
