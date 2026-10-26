#!/usr/bin/env node
// Builds the PRIVATE textbook retrieval index from pdftotext output.
// Usage: node scripts/build-index.js [textDir] [outDir]
//   textDir defaults to /workspace/books/text (one <bookId>.txt per book, pages separated by form feeds \f,
//   i.e. `pdftotext -layout book.pdf book.txt`).
//   outDir defaults to ./private/book-index (gitignored + vercelignored; NEVER commit or serve it).
// Output: <outDir>/<bookId>.json = { bookId, builtAt, pages, chunks: [{ id, book, chapter, page, section, text }] }
//   printedPage = page label read from the running head when detectable (null otherwise).
//   page    = 1-based PDF page index (the \f-separated page), not the printed page label.
//   chapter = best-effort chapter number from running heads / chapter openers (null when unknown).
// Future: OCR'd scanned pages or diagram captions can be appended as extra chunks with the same shape
// (e.g. kind: 'figure'); retrieval treats every chunk uniformly.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const textDir = process.argv[2] || '/workspace/books/text';
const outDir = process.argv[3] || path.join(root, 'private', 'book-index');
const CHUNK_WORDS = 220;

const norm = s => s.toLowerCase().normalize('NFKD').replace(/[\u2018\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function detectChapter(lines, titles, cur) {
  const edge = lines.slice(0, 2).concat(lines.slice(-2)).map(norm);
  if (edge.some(l => /\b(contents|preface|fm indd|index)\b/.test(l))) return cur; // front/back matter
  const hits = new Set();
  for (const l of edge) {
    if (l.length > 120) continue;
    let m = l.match(/^(?:\d+ )?chapter (\d{1,2})\b/) || l.match(/^c(\d{2}) indd\b/);
    if (m) hits.add(Number(m[1]));
    for (const t of titles) if (t.key.length >= 8 && l.length < t.key.length + 30 && l.includes(t.key)) hits.add(t.n);
  }
  if (!hits.size || hits.size > 2) return cur; // nothing, or a contents/index page
  if (cur && hits.has(cur)) return cur;
  // Chapters only advance: accept the smallest forward step of at most 2.
  const c = [...hits].filter(n => n > (cur || 0) && n <= (cur || 0) + 2).sort((x, y) => x - y);
  return c.length ? c[0] : cur;
}

// Printed page label from the running head (e.g. "37  CHAPTER 1" or "1.2 Title ◄ 3"); null if unsure.
function printedPage(lines) {
  for (const l of [lines[0], lines[lines.length - 1]]) {
    const m = l.match(/^(\d{1,4})(?:\s|$)/) || l.match(/[◄\s](\d{1,4})$/);
    if (m && l.length < 110 && !/\.\d|=/.test(l)) return Number(m[1]);
  }
  return null;
}

// "1–2 ■ ENGINEERING HEAT TRANSFER", "1.2 Systems of Units", "1.2 Preliminary Concepts ◄ 3" -> section label.
// Problems ("1.2 The prefix micro stands for:") are rejected because they read as sentences, not title case.
function sectionHeading(line, chapter) {
  if (!chapter) return null;
  const cols = line.replace(/[\x00-\x1f]/g, '').split(/\s{3,}/);
  if (/^\d{1,2}[–.\-]\d{1,2}\s*[■]?$/.test(cols[0]) && cols[1]) cols.splice(0, 2, cols[0] + ' ' + cols[1]);
  const col = cols[0].replace(/[■◄►]/g, ' ').replace(/\s+\d{1,4}$/, '').replace(/\s+/g, ' ').trim();
  const m = col.match(/^(\d{1,2})[–.\-](\d{1,2}) ([A-Za-z].{2,70})$/);
  if (!m || Number(m[1]) !== chapter || Number(m[2]) > 15) return null;
  const title = m[3].trim();
  if (/[:.?,\-]$/.test(title) || /\d/.test(title)) return null;
  const long = title.split(/[\s—–-]+/).filter(w => w.length > 3);
  if (!long.length || long.some(w => !/^[A-Z]/.test(w))) return null;
  const pretty = title === title.toUpperCase() ? title.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : title;
  return `${m[1]}${line.includes('–') ? '–' : '.'}${m[2]} ${pretty}`;
}

function build(bookId) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'data', bookId + '.json'), 'utf8'));
  const titles = meta.chapters.map(c => ({ n: c.n, key: norm(c.title) }));
  const pages = fs.readFileSync(path.join(textDir, bookId + '.txt'), 'utf8').split('\f');
  const chunks = [];
  let chapter = null, section = null;
  pages.forEach((raw, pi) => {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const prevCh = chapter;
    chapter = detectChapter(lines, titles, chapter);
    if (chapter !== prevCh) section = null;
    const printed = printedPage(lines);
    let pending = null;
    let words = [], k = 0, chunkSection = section;
    const flush = () => {
      if (words.length >= 25) chunks.push({ id: `${bookId}:p${pi + 1}:${k++}`, book: bookId, chapter, page: pi + 1, printedPage: printed, section: chunkSection, text: words.join(' ') });
      words = []; chunkSection = section;
    };
    for (const l of lines) {
      // Heading number alone on a line ("1–2 ■") with the title on the next line.
      const sec = sectionHeading(pending ? `${pending} ${l}` : l, chapter);
      pending = /^\d{1,2}[–.\-]\d{1,2}\s*■?$/.test(l) ? l.replace('■', '').trim() : null;
      if (sec) { section = sec; if (!words.length) chunkSection = section; }
      words.push(...l.split(/\s+/));
      if (words.length >= CHUNK_WORDS) flush();
    }
    flush();
  });
  return { bookId, builtAt: new Date().toISOString(), pages: pages.length, chunks };
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(textDir).filter(f => f.endsWith('.txt'))) {
  const id = f.replace(/\.txt$/, '');
  if (!fs.existsSync(path.join(root, 'data', id + '.json'))) continue;
  const idx = build(id);
  fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(idx));
  const byCh = {};
  idx.chunks.forEach(c => { byCh[c.chapter] = byCh[c.chapter] || [c.page, c.page]; byCh[c.chapter][1] = c.page; });
  console.log(id, idx.chunks.length, 'chunks; chapter first/last page:', JSON.stringify(byCh));
}
