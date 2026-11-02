// Round 13 reading books: import integrity (exact text, checksums, counts, order, idempotence, change detection,
// originals untouched), See: reference parsing and safe rendering, and study.reading storage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const SD = require('../studydata.js');
const BT = require('../booktext.js');
const D = path.join(__dirname, '..', 'data', 'books');
const SRC = { 'ai-history': '/workspace/ai-book', 'neuro-history': '/workspace/neuro-book' };
const EXPECT = { 'ai-history': { sections: 64, chapters: 20 }, 'neuro-history': { sections: 52, chapters: 15 } };
const mod = () => import('../scripts/sync-books.mjs');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const haveSrc = fs.existsSync(SRC['ai-history']) && fs.existsSync(SRC['neuro-history']);

test('generated data: counts, complete, unique ids, outline order, every section file present', () => {
  const idx = json(path.join(D, 'index.json'));
  assert.deepEqual(idx.map(b => b.id), ['ai-history', 'neuro-history']);
  for (const b of idx) {
    assert.equal(b.sections, EXPECT[b.id].sections, b.id); assert.equal(b.chapters, EXPECT[b.id].chapters); assert.equal(b.complete, true);
    const toc = json(path.join(D, b.id, 'toc.json')), secs = toc.chapters.flatMap(c => c.sections);
    assert.equal(new Set(secs.map(s => s.id)).size, secs.length, 'unique ids');
    assert.deepEqual(toc.chapters.map(c => c.n), toc.chapters.map((_, i) => i + 1), 'chapter order');
    for (const c of toc.chapters) assert.deepEqual(c.sections.map(s => s.order), c.sections.map((_, i) => i + 1), 'outline order');
    const files = fs.readdirSync(path.join(D, b.id)).filter(f => f !== 'toc.json').sort();
    assert.deepEqual(files, secs.map(s => s.id + '.json').sort());
    for (const s of secs) { const t = json(path.join(D, b.id, s.id + '.json')); assert.equal(crypto.createHash('sha256').update(t.text).digest('hex'), s.checksum); assert.equal(t.sourceFile, s.sourceFile); }
  }
  const rep = json(path.join(D, 'import-report.json'));
  for (const r of rep) { assert.deepEqual([r.missing, r.unmatched, r.duplicates, r.empty, r.malformedRefs].map(a => a.length), [0, 0, 0, 0, 0]); assert.ok(!r.ignored.some(f => /^\d{2}_\d{2}_.*\.txt$/.test(f))); assert.ok(r.ignored.includes('progress.txt')); }
});
test('integrity: stored text equals the source file exactly (only BOM/CRLF normalised) — every section', { skip: !haveSrc && 'sources absent' }, () => {
  for (const [id, dir] of Object.entries(SRC)) {
    const files = fs.readdirSync(dir).filter(f => /^\d{2}_\d{2}_[a-z0-9_]+\.txt$/.test(f));
    assert.equal(files.length, EXPECT[id].sections, `${id}: ${files.length} section files (expected ${EXPECT[id].sections})`);
    for (const f of files) { const t = json(path.join(D, id, f.slice(0, 5) + '.json')).text; assert.equal(t, fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), f); }
  }
});
test('importer: outline parsing, BOM/CRLF/Unicode, missing/duplicate/empty/unmatched detection, idempotent, change detection, source untouched', async () => {
  const { build, parseOutline } = await mod();
  const o = parseOutline('MY BOOK\nWritten for B\n\n1. First\n  1.1 Alpha\n  1.2 Beta\n\nCHAPTER 02  SECOND PART\n 02_01  Gamma\n');
  assert.equal(o.title, 'My Book'); assert.deepEqual([...o.chapters.keys()], [1, 2]); assert.equal(o.chapters.get(2).title, 'Second Part'); assert.equal(o.chapters.get(1).sections.get(2), 'Beta');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  fs.writeFileSync(path.join(dir, '00_outline.txt'), 'MY BOOK\n\n1. First\n  1.1 Alpha\n  1.2 Beta\n  1.3 Delta\n');
  fs.writeFileSync(path.join(dir, '01_01_alpha.txt'), '\uFEFFCHAPTER 1. FIRST\r\nSECTION 1.1. ALPHA\r\n\r\nNaïve Schrödinger — <b>x</b> ∂T/∂x\r\n');
  fs.writeFileSync(path.join(dir, '01_02_beta.txt'), '   \n');
  fs.writeFileSync(path.join(dir, '01_04_extra.txt'), 'SECTION 1.4. EXTRA\n\nText.\n');
  fs.writeFileSync(path.join(dir, 'progress.txt'), 'ignore'); fs.writeFileSync(path.join(dir, 'book_full.txt'), 'ignore');
  const before = fs.readdirSync(dir).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
  const a = build(dir, 't'), b = build(dir, 't');
  assert.deepEqual(a.toc, b.toc, 'idempotent'); assert.deepEqual(Object.keys(a.texts), ['01_01', '01_04']);
  assert.equal(a.texts['01_01'].text, 'CHAPTER 1. FIRST\nSECTION 1.1. ALPHA\n\nNaïve Schrödinger — <b>x</b> ∂T/∂x\n');
  assert.deepEqual(a.report.empty, ['01_02_beta.txt']); assert.deepEqual(a.report.unmatched, ['01_04_extra.txt']);
  assert.deepEqual(a.report.missing, ['1.2 Beta', '1.3 Delta']); assert.equal(a.report.complete, false);
  assert.deepEqual(a.report.ignored, ['book_full.txt', 'progress.txt']);
  fs.writeFileSync(path.join(dir, '01_01_alpha.txt'), 'Changed.\n');
  const c = build(dir, 't', {}, a.toc); assert.deepEqual(c.report.changed, ['01_01']);
  fs.writeFileSync(path.join(dir, '01_01_alpha2.txt'), 'dup'); // same id, another file: reported as duplicate
  assert.equal(build(dir, 't').report.duplicates.length, 1);
  fs.unlinkSync(path.join(dir, '01_01_alpha2.txt')); fs.writeFileSync(path.join(dir, '01_01_alpha.txt'), before.find(x => x[0] === '01_01_alpha.txt')[1]);
  assert.deepEqual(fs.readdirSync(dir).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]), before, 'source untouched');
});
test('See: references: https/http kept exactly, unsafe and malformed shown as text, multiple and repeated', () => {
  const ok = BT.parseRef('https://en.wikipedia.org/wiki/Turing%27s_proof'); assert.equal(ok.url, 'https://en.wikipedia.org/wiki/Turing%27s_proof'); assert.equal(ok.host, 'en.wikipedia.org');
  assert.equal(BT.parseRef('http://example.com/a?b=1&c=2').ok, true);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.org/a', 'https://', 'not a url', 'www.example.com']) assert.equal(BT.parseRef(bad).ok, false, bad);
  const text = 'Para.\n\nSee:\nhttps://a.org/x\nhttps://a.org/x\njavascript:alert(1)\nhttp://b.org/y?q=1&r=2\n\nSee: https://c.org/z\nSee: https://d.org/w\n';
  const refs = BT.refsOf(text); assert.deepEqual(refs.map(r => r.ok), [true, true, false, true, true, true]);
  const h = BT.html(text);
  assert.equal((h.match(/href="https:\/\/a\.org\/x"/g) || []).length, 2, 'repeated URLs both shown');
  assert.match(h, /href="http:\/\/b\.org\/y\?q=1&amp;r=2" target="_blank" rel="noopener noreferrer"/);
  assert.ok(!/href="javascript/.test(h)); assert.match(h, /<li class="tb-bad">javascript:alert\(1\)<\/li>/);
  assert.equal((h.match(/class="tb-see"/g) || []).length, 2);
});
test('rendering: escaped HTML-like text, headings, lists, line breaks, code; no source words dropped (all sections)', () => {
  const h = BT.html('CHAPTER 1. X\nSECTION 1.1. Y\n\n1. A heading\n\nLine one\nline two <img src=x onerror=alert(1)>\n\n  - one\n  - two\n\n    code()\n    more()\n');
  assert.match(h, /<div class="tb-kicker">CHAPTER 1\. X<\/div>/); assert.match(h, /<h1 class="tb-h1">SECTION 1\.1\. Y<\/h1>/); assert.match(h, /<h3>1\. A heading<\/h3>/);
  assert.match(h, /Line one<br>line two &lt;img/); assert.ok(!/<img/.test(h)); assert.match(h, /<ul class="tb-list"><li>one<\/li><li>two<\/li><\/ul>/); assert.match(h, /<pre class="tb-code"><code>    code\(\)/);
  const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  let n = 0; const t0 = Date.now();
  for (const id of ['ai-history', 'neuro-history']) for (const f of fs.readdirSync(path.join(D, id)).filter(f => /^\d/.test(f))) {
    const src = json(path.join(D, id, f)).text, out = plain(BT.html(src)).split(/\s+/).filter(Boolean);
    const bag = new Map(); for (const w of out) bag.set(w, (bag.get(w) || 0) + 1);
    for (const w of src.replace(/^\s{0,8}See:/gm, ' ').replace(/^\s*[-*•]\s/gm, ' ').split(/\s+/).filter(Boolean)) { const k = bag.get(w); assert.ok(k, `${id}/${f}: "${w}" dropped`); bag.set(w, k - 1); }
    n++;
  }
  assert.equal(n, 116); assert.ok(Date.now() - t0 < 5000, 'renders all 116 sections quickly');
});
test('study.reading: validated (bookmarks, notes, done), sanitized, merged, kept on overwrite, in import plan; HMT data untouched', () => {
  const rd = { 'ai-history': { section: '03_01', at: 5, done: { '01_01': 2 }, marks: [{ section: '02_01', note: 'Shannon', at: 3 }] } };
  const base = { books: { 'heat-mass-transfer': { chapter: 2, card: 3, marks: {}, attempts: {}, review: {} } }, last: 'heat-mass-transfer', recent: [], sessions: [] };
  const v = SD.parse ? null : null; void v;
  const s = SD.sanitizeStudy({ schema: SD.SCHEMA, ...base, reading: { ...rd, 'neuro-history': { section: 'bad', at: 1 } } });
  assert.deepEqual(s.study.reading, rd); assert.equal(s.repaired, true); assert.deepEqual(s.study.books['heat-mass-transfer'].chapter, 2);
  assert.equal(SD.sanitizeStudy({ schema: SD.SCHEMA, ...base, reading: { 'ai-history': { section: '01_01', at: 1, marks: [{ section: '01_01', at: 1, note: 'x'.repeat(2000) }] } } }).study.reading['ai-history'], undefined);
  const file = { study: { ...base, reading: { 'ai-history': { section: '01_01', at: 1, done: { '01_02': 1 }, marks: [{ section: '05_01', at: 1 }] } } }, tutor: { prefs: {}, conversations: {} }, session: null };
  const m = SD.merge({ study: { ...base, reading: rd }, tutor: { prefs: {}, conversations: {} }, session: null }, file).study.reading['ai-history'];
  assert.equal(m.section, '03_01'); assert.deepEqual(m.done, { '01_01': 2, '01_02': 1 }); assert.equal(m.marks.length, 2);
  const o = SD.overwrite({ study: { ...base, reading: rd }, tutor: { prefs: {}, conversations: {} }, session: null }, { study: base, tutor: { prefs: {} }, session: null });
  assert.deepEqual(o.study.reading, rd, 'file without reading data keeps bookmarks and progress');
  assert.ok(SD.importPlan({ study: base, tutor: { prefs: {}, conversations: {} }, session: null }, file).some(r => r.key === 'reading'));
});
