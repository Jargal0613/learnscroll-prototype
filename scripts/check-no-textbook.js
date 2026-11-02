#!/usr/bin/env node
// Leak guard: the copyrighted Heat & Mass Transfer textbook (text, figures, page scans, the PDF itself) must never be
// in this public repo or its history. B's own reading books (data/books) are fine.
//   node scripts/check-no-textbook.js            current tree (also run by test/no_textbook_content.test.js)
//   node scripts/check-no-textbook.js --history  every blob in every commit reachable from any ref
// Checks: (1) no PDF/EPUB/image/archive/office files at all (by extension and by magic bytes);
// (2) hmtpages.js holds page numbers only; (3) if a local copy of the PDF is available (HMT_PDF, default
// /workspace/books/heat-mass-transfer.pdf), no tracked text shares a 12-word run with chapters 1–5. The PDF's text is
// read through a pipe into memory for that comparison only and is never written anywhere.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const BAD_EXT = /\.(pdf|epub|djvu|mobi|png|jpe?g|gif|webp|avif|bmp|tiff?|svgz|heic|zip|gz|tgz|7z|rar|docx?|pptx?|xlsx?|ps|eps)$/i;
const MAGIC = [[0x25, 0x50, 0x44, 0x46], [0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x47, 0x49, 0x46, 0x38], [0x50, 0x4b, 0x03, 0x04]];
const ALLOW_BINARY = /^test\/e2e\/__pycache__\//; // python bytecode of our own tests
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 30, ...opts });
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const W = 12;
function bookShingles(pdf) {
  if (!pdf || !fs.existsSync(pdf)) return null;
  let txt; try { txt = execFileSync('pdftotext', ['-q', '-f', '24', '-l', '401', pdf, '-'], { maxBuffer: 1 << 28 }).toString(); } catch (e) { return null; }
  const w = norm(txt), set = new Set();
  for (let i = 0; i + W <= w.length; i++) set.add(w.slice(i, i + W).join(' '));
  txt = null; return set;
}
function checkBlob(name, buf, shingles, problems) {
  if (BAD_EXT.test(name)) problems.push(`${name}: file type not allowed (textbook files, scans and images never go in this repo)`);
  if (!ALLOW_BINARY.test(name) && MAGIC.some(m => m.every((b, i) => buf[i] === b))) problems.push(`${name}: PDF/image/archive content`);
  if (shingles && !ALLOW_BINARY.test(name) && !name.startsWith('data/books/')) {
    const w = norm(buf.toString('utf8'));
    for (let i = 0; i + W <= w.length; i++) if (shingles.has(w.slice(i, i + W).join(' '))) { problems.push(`${name}: shares a ${W}-word run with the textbook ("${w.slice(i, i + 4).join(' ')} …")`); break; }
  }
}
function pagesOnly(src) {
  const HMT = new Function(src.replace(/if \(typeof module[^\n]*/, '') + '\nreturn HMT_PAGES;')();
  const leaves = []; (function walk(o, k) { if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, k + '.' + kk); else leaves.push([k, o]); })(HMT, '');
  const code = src.replace(/^\/\/.*$/mg, '');
  return leaves.every(([k, v]) => Number.isInteger(v) || (k === '.verifiedFile.sha256' && /^[0-9a-f]{64}$/.test(v))) && [...code.matchAll(/"([^"\n]*)"/g)].every(m => /^[A-Za-z0-9-]+$/.test(m[1]));
}
function run({ history = false, pdf = process.env.HMT_PDF || '/workspace/books/heat-mass-transfer.pdf' } = {}) {
  const shingles = bookShingles(pdf), problems = [];
  if (history) {
    const seen = new Set();
    const objs = git(['rev-list', '--objects', '--all']).toString().trim().split('\n');
    for (const line of objs) {
      const [sha, ...rest] = line.split(' '); const name = rest.join(' '); if (!name || seen.has(sha)) continue; seen.add(sha);
      if (git(['cat-file', '-t', sha]).toString().trim() !== 'blob') continue;
      checkBlob(name, git(['cat-file', 'blob', sha]), shingles, problems);
    }
  } else {
    for (const name of git(['ls-files']).toString().trim().split('\n')) { const p = path.join(ROOT, name); if (fs.existsSync(p)) checkBlob(name, fs.readFileSync(p), shingles, problems); }
  }
  const hp = path.join(ROOT, 'hmtpages.js'); if (fs.existsSync(hp) && !pagesOnly(fs.readFileSync(hp, 'utf8'))) problems.push('hmtpages.js: must contain page numbers only');
  return { problems, textChecked: !!shingles };
}
module.exports = { run, pagesOnly, BAD_EXT };
if (require.main === module) {
  const r = run({ history: process.argv.includes('--history') });
  console.log(`textbook text comparison: ${r.textChecked ? 'done (local PDF found)' : 'skipped (no local PDF)'}`);
  if (r.problems.length) { console.error(r.problems.join('\n')); process.exit(1); }
  console.log('OK: no textbook files or text found' + (process.argv.includes('--history') ? ' in any commit' : ' in the tree'));
}
