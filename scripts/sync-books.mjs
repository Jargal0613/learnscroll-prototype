#!/usr/bin/env node
// Copies B's own plain-text books into the site: data/books/index.json (library), data/books/<id>/toc.json
// (chapters and sections from 00_outline.txt, falling back to each file's own headings) and one
// data/books/<id>/<NN_MM>.json per written section. Only NN_MM_slug.txt files are read (progress.txt, scripts,
// .docx and full-book dumps are ignored). Re-run whenever the writers add sections:
//   node scripts/sync-books.mjs [--ai /workspace/ai-book] [--neuro /workspace/neuro-book]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const BookText = createRequire(import.meta.url)('../booktext.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'books');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const BOOKS = [
  { id: 'ai-history', dir: arg('--ai', '/workspace/ai-book'), meta: { category: 'Computing history', features: { reader: true, bookmarks: true, tutor: 'section-context' } } },
  { id: 'neuro-history', dir: arg('--neuro', '/workspace/neuro-book'), meta: { category: 'Neuroscience', features: { reader: true, bookmarks: true, tutor: 'section-context' } } },
];
const SEC_FILE = /^(\d{2})_(\d{2})_([a-z0-9_]+)\.txt$/;
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);
const titleCase = s => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/[a-z][a-z'’]*/g, (w, i) => (i > 0 && MINOR.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
  .replace(/\b(Ai|Eeg|Dna|Mri|Fmri|Ii|Iii|Iv)\b/g, w => w.toUpperCase()));

// Outline: "1. Title" + "  1.2 Title" (AI book) or "CHAPTER 01  TITLE" + " 01_02  Title" (neuro book).
export function parseOutline(text) {
  const lines = text.split(/\r?\n/), head = [], chapters = new Map();
  let started = false;
  for (const l of lines) {
    let m;
    if ((m = /^CHAPTER\s+(\d{1,2})\.?\s+(.+)$/.exec(l)) || (m = /^(\d{1,2})\.\s+(\S.*)$/.exec(l))) { started = true; chapters.set(+m[1], { n: +m[1], title: titleCase(m[2].trim()), sections: new Map() }); continue; }
    if ((m = /^\s+(\d{1,2})[._](\d{1,2})\s+(\S.*)$/.exec(l)) && chapters.has(+m[1])) { chapters.get(+m[1]).sections.set(+m[2], m[3].trim()); continue; }
    if (!started && l.trim()) head.push(l.trim());
  }
  return { title: head[0] ? titleCase(head[0]) : '', subtitle: head.slice(1).filter(l => !/^(Plain-text|Target length|File naming|Every chapter)/i.test(l)).slice(0, 2).join(' · '), chapters };
}
// Section file: optional "CHAPTER n. TITLE" / "SECTION n.m. TITLE" heading lines, then the body.
// Reads a source file exactly. Only two documented normalizations: a leading UTF-8 BOM is removed and CRLF/CR
// line endings become LF. Nothing else is changed (no trimming, no re-wrapping, no spelling fixes).
export const normalize = raw => raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
export const sha256 = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
// The file's own heading lines ("CHAPTER n. TITLE", "SECTION n.m. TITLE"), used only to name a section the outline lacks.
export function headings(text) {
  let chapter = null, section = null;
  for (const l of text.split('\n').slice(0, 6)) {
    const m = /^(CHAPTER|SECTION)\s+[\d.]+\.?\s+(.+)$/.exec(l.trim());
    if (m) { if (m[1] === 'CHAPTER') chapter = m[2].trim(); else section = m[2].trim(); }
  }
  return { chapter, section };
}
const words = t => (t.match(/\S+/g) || []).length;
// Builds the book and a validation report. Never writes to the source directory.
export function build(dir, id, meta = {}, previous = null) {
  const all = fs.readdirSync(dir, { withFileTypes: true });
  const files = all.filter(d => d.isFile() && SEC_FILE.test(d.name)).map(d => d.name).sort();
  const ignored = all.filter(d => !(d.isFile() && SEC_FILE.test(d.name)) && d.name !== '00_outline.txt').map(d => d.name).sort();
  const report = { book: id, sourceDir: dir, files: files.length, ignored, missing: [], unmatched: [], duplicates: [], empty: [], changed: [], added: [], removed: [], malformedRefs: [], words: 0, chars: 0, bytes: 0 };
  const outlineRaw = fs.existsSync(path.join(dir, '00_outline.txt')) ? normalize(fs.readFileSync(path.join(dir, '00_outline.txt'), 'utf8')) : '';
  const outline = parseOutline(outlineRaw);
  const chapters = new Map([...outline.chapters].map(([n, c]) => [n, { n, id: `ch${String(n).padStart(2, '0')}`, title: c.title, sections: [...c.sections].map(([sn, t], i) => ({ id: `${String(n).padStart(2, '0')}_${String(sn).padStart(2, '0')}`, n: `${n}.${sn}`, order: i + 1, title: t, inOutline: true, written: false })) }]));
  const texts = {}, seen = new Map();
  for (const f of files) {
    const [, cn, sn, slug] = SEC_FILE.exec(f), sid = `${cn}_${sn}`;
    if (seen.has(sid)) { report.duplicates.push([seen.get(sid), f]); continue; }
    seen.set(sid, f);
    const buf = fs.readFileSync(path.join(dir, f)), text = normalize(buf.toString('utf8'));
    if (!text.trim()) { report.empty.push(f); continue; }
    const h = headings(text);
    if (!chapters.has(+cn)) chapters.set(+cn, { n: +cn, id: `ch${cn}`, title: h.chapter ? titleCase(h.chapter) : `Chapter ${+cn}`, sections: [], notInOutline: true });
    const ch = chapters.get(+cn);
    let s = ch.sections.find(x => x.id === sid);
    if (!s) { report.unmatched.push(f); s = { id: sid, n: `${+cn}.${+sn}`, order: 1000 + +sn, title: h.section ? titleCase(h.section) : slug.replace(/_/g, ' '), inOutline: false, written: false }; ch.sections.push(s); }
    const checksum = sha256(text);
    Object.assign(s, { written: true, sourceFile: f, words: words(text), chars: [...text].length, checksum });
    report.words += s.words; report.chars += s.chars; report.bytes += buf.length;
    for (const r of BookText.refsOf(text)) if (!r.ok) report.malformedRefs.push({ file: f, ref: r.raw, reason: r.reason });
    report.refs = (report.refs || 0) + BookText.refsOf(text).filter(r => r.ok).length;
    texts[sid] = { id: sid, n: s.n, title: s.title, chapter: +cn, sourceFile: f, checksum, text };
  }
  const list = [...chapters.values()].sort((a, b) => a.n - b.n).map(c => ({ ...c, sections: c.sections.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) }));
  for (const c of list) for (const s of c.sections) if (!s.written) report.missing.push(`${s.n} ${s.title}`);
  if (previous) {
    const old = new Map(previous.chapters.flatMap(c => c.sections).filter(s => s.checksum).map(s => [s.id, s.checksum]));
    for (const t of Object.values(texts)) { if (!old.has(t.id)) report.added.push(t.id); else if (old.get(t.id) !== t.checksum) report.changed.push(t.id); }
    for (const k of old.keys()) if (!texts[k]) report.removed.push(k);
  }
  const written = list.flatMap(c => c.sections).filter(s => s.written);
  report.sections = written.length; report.planned = list.flatMap(c => c.sections).length; report.chapters = list.length;
  report.complete = !report.missing.length && !report.empty.length && !report.duplicates.length;
  const toc = { id, title: outline.title, subtitle: outline.subtitle, ...meta, outlineChecksum: sha256(outlineRaw), complete: report.complete, chapters: list };
  return { toc, texts, report };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = [], reports = [];
  for (const b of BOOKS) {
    if (!fs.existsSync(b.dir)) { console.error(`skip ${b.id}: ${b.dir} not found`); continue; }
    const od = path.join(OUT, b.id), prevFile = path.join(od, 'toc.json');
    const previous = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : null;
    const { toc, texts, report } = build(b.dir, b.id, b.meta, previous);
    fs.rmSync(od, { recursive: true, force: true }); fs.mkdirSync(od, { recursive: true });
    fs.writeFileSync(prevFile, JSON.stringify(toc, null, 1) + '\n');
    for (const t of Object.values(texts)) fs.writeFileSync(path.join(od, `${t.id}.json`), JSON.stringify(t) + '\n');
    index.push({ id: b.id, title: toc.title, subtitle: toc.subtitle, category: toc.category, features: toc.features, complete: toc.complete, chapters: report.chapters, sections: report.sections, planned: report.planned, words: report.words });
    reports.push(report);
    console.log(`${b.id}: ${report.sections}/${report.planned} sections, ${report.chapters} chapters, ${report.words} words, complete=${report.complete}; missing ${report.missing.length}, unmatched ${report.unmatched.length}, duplicates ${report.duplicates.length}, empty ${report.empty.length}; changed ${report.changed.length}, added ${report.added.length}, removed ${report.removed.length}`);
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  fs.writeFileSync(path.join(OUT, 'import-report.json'), JSON.stringify(reports.map(({ sourceDir, ...r }) => r), null, 1) + '\n');
}
