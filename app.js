// LearnScroll — a calm, card-by-card study feed for five textbooks.
const BOOK_IDS = ['heat-mass-transfer', 'koretsky-thermo', 'electric-circuits', 'university-physics', 'chemistry-silberberg'];
const KEY = 'learnscroll-study-v1';
const app = document.getElementById('app');
const books = {};

// ---------- saved progress ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { books: (s && typeof s.books === 'object' && s.books) || {}, last: (s && s.last) || null, recent: (s && Array.isArray(s.recent) && s.recent) || [] };
  } catch (e) { return { books: {}, last: null, recent: [] }; }
}
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function bookState(id) {
  const b = state.books[id] || (state.books[id] = { chapter: null, card: 0, done: {} });
  if (!b.marks) b.marks = {};   // cardId -> { b: bookmarked, d: difficult }
  if (!b.seen) b.seen = {};     // chapter -> furthest screen index reached (recorded from Phase 1 on)
  if (!b.notes) b.notes = {};   // cardId -> { text, at }  (plain text, Phase 2)
  if (!b.review) b.review = {}; // cardId -> { r: 'got' | 'again', at }  (last review result, Phase 2)
  return b;
}
// Stable ids (same as the tutor/server): c<chapter>-<n> for cards, c<chapter>-q<n> for practice questions.
const screenId = (ch, i) => i < ch.cards.length ? `c${ch.n}-${i + 1}` : `c${ch.n}-q${i - ch.cards.length + 1}`;
const screenTitle = (ch, i) => i < ch.cards.length ? ch.cards[i].h : `Practice question ${i - ch.cards.length + 1}`;
function markedList(book, kind) {
  const bs = state.books[book.id]; if (!bs) return [];
  const out = [];
  for (const ch of book.chapters.filter(ready)) for (let i = 0; i < screens(ch); i++) {
    const id = screenId(ch, i);
    if (kind === 'n' ? bs.notes && bs.notes[id] : bs.marks && bs.marks[id] && bs.marks[id][kind]) out.push({ ch, i });
  }
  return out;
}
const stripTags = s => String(s).replace(/<[^>]*>/g, '');

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ready = ch => Array.isArray(ch.cards) && ch.cards.length > 0;
const screens = ch => ch.cards.length + (ch.quiz ? ch.quiz.length : 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
let loadFailed = [];
function renderMath(el) {
  if (!window.katex) return;
  el.querySelectorAll('[data-eq]').forEach(n => {
    try { katex.render(n.dataset.eq, n, { displayMode: true, throwOnError: false }); } catch (e) {}
  });
  if (window.renderMathInElement) renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false });
}
// Real, stored progress only. Returns null when nothing has been stored for this book.
function bookProgress(book) {
  const bs = state.books[book.id];
  const avail = book.chapters.filter(ready);
  const done = bs ? avail.filter(c => bs.done && bs.done[c.n]).length : 0;
  const cur = bs && bs.chapter ? book.chapters.find(c => c.n === bs.chapter && ready(c)) : null;
  if (!done && !cur) return null;
  return { done, avail: avail.length, cur, card: bs.card, curDone: cur ? !!bs.done[cur.n] : false };
}
function chapterState(book, ch) {
  if (!ready(ch)) return 'soon';
  const bs = state.books[book.id];
  if (bs && bs.done && bs.done[ch.n]) return 'done';
  if (bs && bs.chapter === ch.n) return 'progress';
  return 'ready';
}

// ---------- routing ----------
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.addEventListener('hashchange', route);
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if ((parts[0] === 'book' || parts[0] === 'read') && parts[1] && !books[parts[1]]) return renderMissing('That book couldn’t be loaded.', '#/', 'Back to library');
  if (parts[0] === 'book') return renderBook(books[parts[1]], parts[2]);
  if (parts[0] === 'import') return renderImport();
  if (parts[0] === 'review' && books[parts[1]]) return renderReview(books[parts[1]], parts[2]);
  if (parts[0] === 'read') {
    const b = books[parts[1]];
    const ch = b.chapters.find(c => c.n === Number(parts[2]));
    if (ch && ready(ch)) {
      const at = parts[3] !== undefined ? Number(parts[3]) : NaN; // optional 1-based card position
      return renderReader(b, ch, Number.isInteger(at) && at >= 1 && at <= screens(ch) ? at - 1 : null);
    }
    return renderMissing(ch ? `Chapter ${ch.n}, ${ch.title}, is coming soon.` : 'That chapter doesn’t exist.', `#/book/${b.id}`, 'Back to chapters');
  }
  renderHome();
}
function renderMissing(msg, href, label) {
  document.title = 'LearnScroll';
  app.innerHTML = `<main class="page"><div class="empty"><h1>Not available</h1><p>${esc(msg)}</p><div class="btns"><a class="btn ghost" href="${href}">${label}</a></div></div></main>`;
}

// ---------- home ----------
function renderHome() {
  document.title = 'LearnScroll';
  const ids = BOOK_IDS.filter(id => books[id]);
  if (!ids.length) {
    app.innerHTML = `<main class="page"><div class="empty"><h1>Couldn’t load the library</h1><p>The book data failed to load. Check your connection and try again.</p><div class="btns"><button class="btn" id="retry">Retry</button></div></div></main>`;
    document.getElementById('retry').onclick = () => location.reload();
    return;
  }
  const last = state.last && books[state.last] ? books[state.last] : null;
  let cont = '';
  if (last) {
    const bs = bookState(last.id);
    const ch = last.chapters.find(c => c.n === bs.chapter);
    if (ch && ready(ch)) cont = `<a class="continue" id="continue" href="#/read/${last.id}/${ch.n}/${Math.min(bs.card, screens(ch) - 1) + 1}"><div><div class="k">Continue studying</div><div class="t">${esc(last.short)} · Ch ${ch.n}: ${esc(ch.title)}</div><div class="s">Card ${bs.card + 1} of ${screens(ch)}</div></div><span class="go">Resume →</span></a>`;
  }
  app.innerHTML = `<main class="page">
    <div class="topline"><div class="brand"><i></i>LearnScroll</div>
      <div class="search" role="search"><label class="sr" for="q">Search the library</label><input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="Search cards, chapters, books" aria-controls="q-res" aria-expanded="false" aria-autocomplete="list"><kbd class="q-key" aria-hidden="true">/</kbd>
        <div class="q-res" id="q-res" role="listbox" aria-label="Search results" hidden></div></div></div>
    <h1>Study, one card at a time.</h1>
    <p class="lead">Short study notes for five textbooks, chapter by chapter. Move through a chapter one idea per screen, then check yourself with a few practice questions. Progress is saved in this browser.</p>
    ${flash ? `<div class="notice ok" role="status">${esc(flash)}</div>` : ''}
    ${loadFailed.length ? `<div class="notice">${plural(loadFailed.length, 'book')} couldn’t be loaded. Reload the page to try again.</div>` : ''}
    ${cont}
    ${recentHTML()}
    ${reviewHomeHTML(ids)}
    <div class="section-h"><span>Library</span><span>${plural(ids.length, 'book')}</span></div>
    <div class="grid">${ids.map(id => {
      const b = books[id], p = bookProgress(b);
      const avail = b.chapters.filter(ready);
      const cards = avail.reduce((s, c) => s + c.cards.length, 0);
      const qs = avail.reduce((s, c) => s + (c.quiz || []).length, 0);
      let prog = '<div class="prog">Not started</div>';
      if (p) {
        const parts = [];
        if (p.cur && !p.curDone) parts.push(`In progress · Ch ${p.cur.n}, card ${p.card + 1}/${screens(p.cur)}`);
        parts.push(`${p.done} of ${p.avail} available chapters complete`);
        prog = `<div class="prog on">${parts.join(' · ')}</div><div class="meter" aria-hidden="true"><span style="width:${(p.done / p.avail) * 100}%"></span></div>`;
      }
      return `<a class="book" href="#/book/${b.id}">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-meta">${esc(b.author)} · ${esc(b.edition)}</div>
        <div class="book-desc">${esc(b.description)}</div>
        <div class="stats"><span><b>${b.chapters.length}</b> chapters</span><span><b>${avail.length}</b> available</span><span><b>${cards}</b> cards</span><span><b>${qs}</b> questions</span></div>
        ${prog}
      </a>`;
    }).join('')}</div>
    <footer class="lib-foot"><span>Study data is saved only in this browser.</span>
      <span class="lib-foot-a"><button class="t-link" id="exp">Export study data</button><label class="exp-conv"><input type="checkbox" id="exp-conv"> include tutor conversations</label><span aria-hidden="true">·</span><button class="t-link" id="imp">Import study data</button><input type="file" id="imp-file" accept="application/json,.json" hidden></span></footer>
  </main>`;
  flash = '';
  mountSearch();
  document.getElementById('exp').onclick = () => exportData(document.getElementById('exp-conv').checked);
  document.getElementById('imp').onclick = () => document.getElementById('imp-file').click();
  document.getElementById('imp-file').onchange = e => { const f = e.target.files[0]; if (f) readImport(f); };
}

function recentHTML() {
  const items = state.recent.filter(r => books[r.book] && books[r.book].chapters.some(c => c.n === r.chapter && ready(c))).slice(0, 3);
  const body = items.length ? `<ol class="recent">${items.map(r => {
    const b = books[r.book], ch = b.chapters.find(c => c.n === r.chapter), n = screens(ch);
    const done = state.books[r.book] && state.books[r.book].done && state.books[r.book].done[ch.n];
    return `<li><a href="#/read/${b.id}/${ch.n}/${Math.min(r.card, n - 1) + 1}"><span class="r-book">${esc(b.short)}</span><span class="r-ch">Ch ${ch.n} · ${esc(ch.title)}</span><span class="r-pos">${done ? 'Completed' : `Card ${Math.min(r.card, n - 1) + 1}/${n}`}</span></a></li>`;
  }).join('')}</ol>` : '<p class="empty-note">Nothing studied yet. Chapters you open will appear here.</p>';
  return `<div class="section-h"><span>Recently studied</span><span>${items.length ? `Last ${items.length}` : ''}</span></div>${body}`;
}

function reviewHomeHTML(ids) {
  const rows = ids.map(id => ({ b: books[id], n: reviewCards(books[id], 'both').length })).filter(r => r.n);
  const body = rows.length
    ? `<div class="review-row">${rows.map(r => `<a class="btn ghost sm" href="#/review/${r.b.id}">Review ${esc(r.b.short)} (${r.n})</a>`).join('')}</div>`
    : '<p class="empty-note">Nothing to review yet. Bookmark cards or mark them as difficult in the reader, then review them here.</p>';
  return `<div class="section-h"><span>Review</span><span>Marked cards</span></div>${body}`;
}

// ---------- library search (local; all book JSON is already loaded once at start) ----------
let searchIndex = null;
const plainText = s => stripTags(String(s || '')).replace(/\\[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
function buildIndex() {
  const out = [];
  for (const id of BOOK_IDS) {
    const b = books[id]; if (!b) continue;
    out.push({ book: b, kind: 'book', title: b.title, text: `${b.author} ${b.description || ''}`, href: `#/book/${b.id}` });
    for (const ch of b.chapters) {
      const ok = ready(ch);
      out.push({ book: b, ch, kind: 'chapter', title: `Ch ${ch.n}: ${ch.title}`, text: ok ? '' : 'Coming soon', href: ok ? `#/read/${b.id}/${ch.n}/1` : `#/book/${b.id}` });
      if (!ok) continue;
      ch.cards.forEach((c, i) => out.push({ book: b, ch, i, kind: 'card', title: plainText(c.h), text: plainText([c.t, c.def, c.ex].filter(Boolean).join(' ')), href: `#/read/${b.id}/${ch.n}/${i + 1}` }));
      (ch.quiz || []).forEach((q, k) => out.push({ book: b, ch, i: ch.cards.length + k, kind: 'quiz', title: `Practice: ${plainText(q.q)}`, text: plainText(q.options.join(' · ')), href: `#/read/${b.id}/${ch.n}/${ch.cards.length + k + 1}` }));
    }
  }
  for (const e of out) { e.lt = e.title.toLowerCase(); e.lx = e.text.toLowerCase(); }
  return out;
}
function searchLibrary(q, limit = 40) {
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (!terms.length) return [];
  if (!searchIndex) searchIndex = buildIndex();
  const hits = [];
  for (const e of searchIndex) {
    let score = 0, all = true;
    for (const t of terms) {
      const inT = e.lt.includes(t), inX = !inT && e.lx.includes(t);
      if (!inT && !inX) { all = false; break; }
      score += inT ? 3 : 1;
    }
    if (!all) continue;
    if (e.lt.startsWith(terms[0])) score += 2;
    score += e.kind === 'book' ? 2 : e.kind === 'chapter' ? 1 : 0;
    hits.push({ e, score });
  }
  // keep library order within the best results
  const top = hits.sort((a, b) => b.score - a.score).slice(0, limit);
  const order = new Map(searchIndex.map((e, k) => [e, k]));
  return top.sort((a, b) => order.get(a.e) - order.get(b.e)).map(h => h.e);
}
function highlight(text, terms) {
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return esc(text).replace(re, '<mark>$1</mark>');
}
function snippet(text, terms, len = 140) {
  const lx = text.toLowerCase();
  let at = -1; for (const t of terms) { const k = lx.indexOf(t); if (k >= 0 && (at < 0 || k < at)) at = k; }
  if (at < 0) return text.length > len ? text.slice(0, len).replace(/\s+\S*$/, '') + '…' : text;
  let s = Math.max(0, at - 50); if (s > 0) { const sp = text.indexOf(' ', s); s = sp >= 0 && sp < at ? sp + 1 : s; }
  let out = text.slice(s, s + len); if (s + len < text.length) out = out.replace(/\s+\S*$/, '') + '…';
  return (s > 0 ? '…' : '') + out;
}
function mountSearch() {
  const input = document.getElementById('q'), box = document.getElementById('q-res');
  if (!input) return;
  let timer = null, items = [], active = -1;
  const kindLabel = { book: 'Book', chapter: 'Chapter', card: 'Card', quiz: 'Practice' };
  function paint() {
    const q = input.value.trim();
    if (!q) { box.hidden = true; box.innerHTML = ''; items = []; active = -1; input.setAttribute('aria-expanded', 'false'); return; }
    const t0 = performance.now();
    const res = searchLibrary(q), terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const ms = Math.round(performance.now() - t0);
    input.setAttribute('aria-expanded', 'true'); box.hidden = false; active = res.length ? 0 : -1;
    if (!res.length) { box.innerHTML = `<div class="q-empty">No results for “${esc(q)}”. Try a different word, or fewer words.</div>`; items = []; return; }
    let html = '', lastBook = null, lastCh = null, n = 0;
    for (const e of res) {
      if (e.book !== lastBook) { html += `<div class="q-book">${esc(e.book.short)}</div>`; lastBook = e.book; lastCh = null; }
      if (e.ch && e.ch !== lastCh && e.kind !== 'chapter') { html += `<div class="q-ch">Ch ${e.ch.n} · ${esc(e.ch.title)}</div>`; lastCh = e.ch; }
      if (e.kind === 'chapter') lastCh = e.ch;
      const snip = e.text ? snippet(e.text, terms) : '';
      html += `<a class="q-item" role="option" id="qr-${n}" href="${e.href}" data-k="${n++}"><span class="q-kind">${kindLabel[e.kind]}</span><span class="q-main"><span class="q-t">${highlight(e.title, terms)}</span>${snip ? `<span class="q-s">${highlight(snip, terms)}</span>` : ''}</span></a>`;
    }
    box.innerHTML = html + `<div class="q-foot">${plural(res.length, 'result')}${res.length >= 40 ? ' (top 40)' : ''} · ↑ ↓ to move · Enter to open · Esc to clear<span class="q-ms" data-ms="${ms}"></span></div>`;
    items = [...box.querySelectorAll('.q-item')]; mark();
  }
  function mark() {
    items.forEach((a, k) => a.setAttribute('aria-selected', String(k === active)));
    if (items[active]) { items[active].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', items[active].id); }
    else input.removeAttribute('aria-activedescendant');
  }
  let stale = false; // input changed but results not painted yet
  input.addEventListener('input', () => { stale = true; clearTimeout(timer); timer = setTimeout(() => { stale = false; paint(); }, 120); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (stale || box.hidden) { clearTimeout(timer); stale = false; paint(); }
      if (items.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark(); }
    } else if (e.key === 'Enter') {
      e.preventDefault(); if (stale) { clearTimeout(timer); stale = false; paint(); }
      if (items[active]) location.hash = items[active].getAttribute('href');
    } else if (e.key === 'Escape') {
      e.preventDefault(); if (input.value) { input.value = ''; paint(); } else input.blur();
    }
  });
  box.addEventListener('mousemove', e => { const a = e.target.closest('.q-item'); if (a) { active = Number(a.dataset.k); mark(); } });
  const onDoc = e => {
    const t = e.target;
    if (e.key === '/' && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) { e.preventDefault(); input.focus(); input.select(); }
  };
  const onClick = e => { if (!e.target.closest('.search')) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); } };
  input.addEventListener('focus', () => { if (input.value.trim()) paint(); });
  document.addEventListener('keydown', onDoc); document.addEventListener('click', onClick);
  cleanup = () => { document.removeEventListener('keydown', onDoc); document.removeEventListener('click', onClick); clearTimeout(timer); };
}

// ---------- export / import (all local; logic in studydata.js) ----------
let flash = '', pendingImport = null;
const localData = () => StudyData.fromStorage(localStorage.getItem(StudyData.STUDY_KEY), localStorage.getItem(StudyData.TUTOR_KEY));
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData(conversations, suffix = '') {
  const now = new Date();
  const d = StudyData.build(localData(), { conversations, now });
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  download(`learnscroll-study-${day}${suffix}.json`, JSON.stringify(d, null, 2));
}
function readImport(file) {
  const done = text => { const r = StudyData.parse(text, { bookIds: BOOK_IDS }); pendingImport = { name: file.name, ...r }; go('#/import'); };
  if (file.size > 5 * 1024 * 1024) return done(null);
  file.text().then(done, () => done(null));
}
function countsHTML(c) {
  const row = (k, v) => `<li><span>${k}</span><b>${v}</b></li>`;
  return `<ul class="imp-counts">${row('Books with data', c.books)}${row('Bookmarks', c.bookmarks)}${row('Difficult marks', c.difficult)}${row('Notes', c.notes)}${row('Review results', c.reviews)}${row('Completed chapters', c.chaptersDone)}${row('Recent history', c.recent)}${row('Tutor conversations', c.conversations)}${row('Answer style', c.style || '—')}</ul>`;
}
function renderImport() {
  document.title = 'Import study data · LearnScroll';
  const p = pendingImport;
  const head = '<a class="back" href="#/">← Library</a><h1>Import study data</h1>';
  if (!p) { app.innerHTML = `<main class="page imp">${head}<p class="lead">Choose a file with <b>Import study data</b> at the bottom of the library.</p></main>`; return; }
  if (!p.ok) {
    app.innerHTML = `<main class="page imp">${head}<div class="imp-err" role="alert"><b>This file can’t be imported.</b><p>${esc(p.error || 'The file could not be read.')}</p><p class="imp-file">${esc(p.name)} · Nothing was changed.</p></div><div class="btns"><a class="btn ghost" href="#/" id="imp-back">Back to library</a></div></main>`;
    pendingImport = null; return;
  }
  const inc = StudyData.counts(p.data), cur = StudyData.counts(localData());
  app.innerHTML = `<main class="page imp">${head}
    <p class="lead">${esc(p.name)} · exported ${esc(new Date(p.data.exportedAt).toLocaleString())}. Nothing changes until you confirm.</p>
    <div class="imp-cols"><section><h2>In the file</h2>${countsHTML(inc)}</section><section><h2>In this browser now</h2>${countsHTML(cur)}</section></div>
    <div class="imp-opts">
      <section class="imp-opt"><h2>Merge</h2><p>Keeps everything from both. Bookmarks, difficult marks, notes, review results and completed chapters are combined; when the same note or result exists in both, the newer one wins; progress takes the furthest point.</p><button class="btn" id="imp-merge">Merge into this browser</button></section>
      <section class="imp-opt warn"><h2>Overwrite</h2><p>Replaces this browser’s study data with the file.${p.data.tutor.conversations ? ' Tutor conversations are replaced too.' : ' Tutor conversations here are kept (the file has none).'} <b>Current data not in the file will be lost.</b></p>
        <label class="imp-chk"><input type="checkbox" id="imp-backup" checked> First download a backup of this browser’s current data</label>
        <button class="btn danger" id="imp-over">Overwrite this browser’s data</button></section>
    </div>
    <div class="btns"><a class="btn ghost" href="#/" id="imp-cancel">Cancel</a></div></main>`;
  const apply = (mode) => {
    const local = localData();
    if (mode === 'overwrite' && document.getElementById('imp-backup').checked) exportData(true, '-backup');
    const next = mode === 'merge' ? StudyData.merge(local, p.data) : StudyData.overwrite(local, p.data);
    const out = StudyData.toStorage(next);
    try { localStorage.setItem(StudyData.STUDY_KEY, out.study); localStorage.setItem(StudyData.TUTOR_KEY, out.tutor); }
    catch (e) { flash = 'Import failed: browser storage is full or unavailable. Nothing was changed.'; localStorage.setItem(StudyData.STUDY_KEY, StudyData.toStorage(local).study); go('#/'); return; }
    state = load(); pendingImport = null;
    const c = StudyData.counts(next);
    flash = `${mode === 'merge' ? 'Merged' : 'Imported'} study data: ${plural(c.bookmarks, 'bookmark')}, ${plural(c.difficult, 'difficult mark')}, ${plural(c.notes, 'note')}, ${plural(c.reviews, 'review result')}.`;
    go('#/');
  };
  document.getElementById('imp-merge').onclick = () => apply('merge');
  document.getElementById('imp-over').onclick = () => apply('overwrite');
  document.getElementById('imp-cancel').onclick = () => { pendingImport = null; };
}

// ---------- review mode (no scheduling: just the cards you marked) ----------
function reviewCards(book, kind) {
  const ks = kind === 'bookmarked' ? ['b'] : kind === 'difficult' ? ['d'] : ['b', 'd'];
  const seen = new Set(), out = [];
  for (const k of ks) for (const x of markedList(book, k)) { const id = screenId(x.ch, x.i); if (!seen.has(id)) { seen.add(id); out.push(x); } }
  return out.sort((a, b) => a.ch.n - b.ch.n || a.i - b.i);
}
const fmtWhen = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function renderReview(book, kind) {
  document.title = `Review · ${book.short}`;
  const bs = bookState(book.id);
  const nb = markedList(book, 'b').length, nd = markedList(book, 'd').length, nboth = reviewCards(book, 'both').length;
  const head = `<a class="back" href="#/book/${book.id}">← Chapters</a><div class="book-head"><div><h1>Review</h1><p class="meta-line">${esc(book.title)}</p></div></div>`;
  if (!['bookmarked', 'difficult', 'both'].includes(kind)) {
    const opt = (k, label, n) => n ? `<a class="rv-choice" href="#/review/${book.id}/${k}"><b>${label}</b><span>${plural(n, 'card')}</span></a>` : `<span class="rv-choice off" aria-disabled="true"><b>${label}</b><span>none marked</span></span>`;
    app.innerHTML = `<main class="page">${head}${nboth ? `<p class="lead">Choose which marked cards to review. You'll see each card's heading first; recall what it says, then reveal it.</p>
      <div class="rv-choices">${opt('bookmarked', 'Bookmarked', nb)}${opt('difficult', 'Difficult', nd)}${opt('both', 'Bookmarked and difficult', nboth)}</div>`
      : `<div class="marked-empty"><p>Nothing to review yet.</p><p>In the reader, bookmark cards (<kbd>B</kbd>) or mark them as difficult (<kbd>D</kbd>); they'll show up here.</p></div>`}</main>`;
    return;
  }
  const list = reviewCards(book, kind);
  if (!list.length) { go(`#/review/${book.id}`); return; }
  let pos = 0, revealed = false;
  const results = [];
  app.innerHTML = `<main class="page review"><div class="rv-top"><a class="back" href="#/review/${book.id}">← Review options</a><span class="rv-count" id="rv-count"></span></div><div class="rv-track"><i id="rv-line"></i></div><section class="rv-card" id="rv-card" aria-live="polite"></section></main>`;
  const el = document.getElementById('rv-card');
  function body(ch, i) {
    if (i < ch.cards.length) {
      const c = ch.cards[i];
      return `<p>${c.t}</p>${c.eq ? `<div class="eq" data-eq="${esc(c.eq)}"></div>` : ''}${c.def ? `<div class="note"><span class="label">Definition</span>${c.def}</div>` : ''}${c.ex ? `<div class="note example"><span class="label">Example</span>${c.ex}</div>` : ''}`;
    }
    const q = ch.quiz[i - ch.cards.length], letter = String.fromCharCode(65 + q.answer);
    return `<ol class="rv-opts">${q.options.map((o, k) => `<li class="${k === q.answer ? 'right' : ''}"><span>${String.fromCharCode(65 + k)}</span>${o}</li>`).join('')}</ol>
      <div class="feedback"><span class="answer-line">Correct answer: <span class="k">${letter}</span> — ${q.options[q.answer]}</span><p style="margin-top:8px">${q.why}</p></div>`;
  }
  function show() {
    if (pos >= list.length) return summary();
    const { ch, i } = list[pos], id = screenId(ch, i), isQ = i >= ch.cards.length;
    const prompt = isQ ? ch.quiz[i - ch.cards.length].q : esc(ch.cards[i].h);
    const last = bs.review[id];
    const m = bs.marks[id] || {};
    document.getElementById('rv-count').textContent = `${pos + 1} / ${list.length}`;
    document.getElementById('rv-line').style.width = `${(pos / list.length) * 100}%`;
    el.innerHTML = `<div class="sec"><span>Ch ${ch.n} · card ${i + 1}</span>${isQ ? '<span class="tag q-t">Practice</span>' : `<span>${esc(ch.cards[i].s)}</span>`}${m.b ? '<span class="tag">Bookmarked</span>' : ''}${m.d ? '<span class="tag">Difficult</span>' : ''}</div>
      <h2>${prompt}</h2>
      ${last ? `<p class="rv-last">Last review: ${last.r === 'got' ? 'Got it' : 'Review again'} · ${esc(fmtWhen(last.at))}</p>` : ''}
      <div id="rv-body" ${revealed ? '' : 'hidden'}>${body(ch, i)}</div>
      <div class="rv-actions">${revealed
        ? `<button class="btn" id="rv-got">Got it <kbd>1</kbd></button><button class="btn ghost" id="rv-again">Review again <kbd>2</kbd></button>`
        : `<button class="btn" id="rv-reveal">${isQ ? 'Reveal answer' : 'Reveal'} <kbd>space</kbd></button><span class="rv-tip">Recall the ${isQ ? 'answer' : 'idea'} first, then reveal.</span>`}</div>`;
    renderMath(el);
    const b = document.getElementById(revealed ? 'rv-got' : 'rv-reveal'); b.focus({ preventScroll: true });
    if (revealed) { document.getElementById('rv-got').onclick = () => grade('got'); document.getElementById('rv-again').onclick = () => grade('again'); }
    else document.getElementById('rv-reveal').onclick = () => { revealed = true; show(); };
  }
  function grade(r) {
    const { ch, i } = list[pos];
    bs.review[screenId(ch, i)] = { r, at: Date.now() };
    save();
    results.push({ ch, i, r });
    pos++; revealed = false; show();
  }
  function summary() {
    document.getElementById('rv-count').textContent = 'Done';
    document.getElementById('rv-line').style.width = '100%';
    const again = results.filter(x => x.r === 'again');
    el.innerHTML = `<div class="sec"><span>Session summary</span></div><h2>${results.length - again.length} of ${results.length} got it</h2>
      ${again.length ? `<p class="rv-last">Cards to review again:</p><ol class="marked">${again.map(({ ch, i }) => `<li><a href="#/read/${book.id}/${ch.n}/${i + 1}"><span class="num">Ch ${ch.n}</span><span class="name">${esc(stripTags(screenTitle(ch, i)))}</span><span class="counts">card ${i + 1}/${screens(ch)}</span></a></li>`).join('')}</ol>` : '<p>Nothing marked for another look this session.</p>'}
      <div class="btns"><a class="btn" href="#/review/${book.id}/${kind}" id="rv-restart">Review again from the start</a><a class="btn ghost" href="#/book/${book.id}">Back to chapters</a></div>`;
    document.getElementById('rv-restart').onclick = e => { e.preventDefault(); pos = 0; results.length = 0; revealed = false; show(); };
  }
  const onKey = e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'Escape') { e.preventDefault(); go(`#/book/${book.id}`); return; }
    if (pos >= list.length) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); revealed = true; show(); }
    else if (revealed && e.key === '1') { e.preventDefault(); grade('got'); }
    else if (revealed && e.key === '2') { e.preventDefault(); grade('again'); }
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => document.removeEventListener('keydown', onKey);
  show();
}

// ---------- chapter list ----------
function renderBook(book, filter) {
  document.title = book.short + ' · LearnScroll';
  const bs = state.books[book.id];
  const view = filter === 'bookmarked' ? 'b' : filter === 'difficult' ? 'd' : filter === 'notes' ? 'n' : null;
  const nb = markedList(book, 'b').length, nd = markedList(book, 'd').length, nn = markedList(book, 'n').length;
  const tabs = `<nav class="tabs" aria-label="Chapter filters">
      <a href="#/book/${book.id}" ${!view ? 'aria-current="page"' : ''}>All chapters</a>
      <a href="#/book/${book.id}/bookmarked" ${view === 'b' ? 'aria-current="page"' : ''}>Bookmarked <span>${nb}</span></a>
      <a href="#/book/${book.id}/difficult" ${view === 'd' ? 'aria-current="page"' : ''}>Difficult <span>${nd}</span></a>
      <a href="#/book/${book.id}/notes" ${view === 'n' ? 'aria-current="page"' : ''}>Notes <span>${nn}</span></a>
      <span class="tabs-r">${reviewAction(book)}</span></nav>`;
  const avail = book.chapters.filter(ready).length;
  const label = { done: 'Completed', ready: 'Available', soon: 'Coming soon' };
  app.innerHTML = `<main class="page">
    <a class="back" href="#/">← Library</a>
    <div class="book-head"><div><h1>${esc(book.title)}</h1><p class="meta-line">${esc(book.author)} · ${esc(book.edition)}</p></div>
    <div class="legend"><span>${avail} of ${book.chapters.length} chapters available</span></div></div>
    ${tabs}
    ${view ? markedHTML(book, view) : `<div class="chapters" role="list">${book.chapters.map(ch => {
      const st = chapterState(book, ch);
      if (st === 'soon') return `<div class="chap soon" role="listitem"><span class="num">${ch.n}</span><span class="name">${esc(ch.title)}</span><span class="counts"></span><span class="pill">Coming soon</span></div>`;
      const pill = st === 'progress' ? `<span class="pill prog">Card ${bs.card + 1}/${screens(ch)}</span>` : `<span class="pill ${st}">${label[st]}</span>`;
      const seen = bs && bs.seen && bs.seen[ch.n] !== undefined ? Math.min(bs.seen[ch.n] + 1, screens(ch)) : 0;
      const meter = seen && st !== 'done' ? `<span class="cmeter" title="Furthest card reached: ${seen} of ${screens(ch)}"><i style="width:${(seen / screens(ch)) * 100}%"></i></span>` : '';
      return `<a class="chap" role="listitem" href="#/read/${book.id}/${ch.n}"><span class="num">${ch.n}</span><span class="name">${esc(ch.title)}${meter}</span><span class="counts">${plural(ch.cards.length, 'card')} · ${plural((ch.quiz || []).length, 'question')}</span>${pill}</a>`;
    }).join('')}</div>`}
  </main>`;
}

function reviewAction(book) {
  const n = reviewCards(book, 'both').length;
  return n ? `<a class="btn ghost sm" href="#/review/${book.id}">Review marked cards (${n})</a>`
    : `<button class="btn ghost sm" disabled title="Bookmark or mark cards as difficult to review them">Review marked cards</button>`;
}
function markedHTML(book, kind) {
  const list = markedList(book, kind);
  if (kind === 'n') {
    const bs = state.books[book.id];
    if (!list.length) return `<div class="marked-empty"><p>No notes yet.</p><p>In the reader, use <b>Add note</b> on any card. Notes are saved in this browser.</p></div>`;
    return `<ol class="marked">${list.map(({ ch, i }) => { const nt = bs.notes[screenId(ch, i)]; return `<li><a href="#/read/${book.id}/${ch.n}/${i + 1}"><span class="num">Ch ${ch.n}</span><span class="name">${esc(stripTags(screenTitle(ch, i)))}<span class="note-snip">${esc(nt.text.length > 140 ? nt.text.slice(0, 140) + '…' : nt.text)}</span></span><span class="counts">${esc(ch.title)} · card ${i + 1}/${screens(ch)}</span></a></li>`; }).join('')}</ol>`;
  }
  if (!list.length) return `<div class="marked-empty"><p>${kind === 'b' ? 'No bookmarked cards yet.' : 'No cards marked as difficult yet.'}</p><p>In the reader, use the ${kind === 'b' ? 'Bookmark' : 'Difficult'} button on a card or press <kbd>${kind === 'b' ? 'B' : 'D'}</kbd>.</p></div>`;
  return `<ol class="marked">${list.map(({ ch, i }) => `<li><a href="#/read/${book.id}/${ch.n}/${i + 1}"><span class="num">Ch ${ch.n}</span><span class="name">${esc(stripTags(screenTitle(ch, i)))}</span><span class="counts">${esc(ch.title)} · card ${i + 1}/${screens(ch)}</span></a></li>`).join('')}</ol>`;
}

// ---------- reader ----------
// Card kinds come from the existing fields: eq → equation, def → definition, ex → worked example.
const markBtns = id => `<span class="marks"><button class="mark" data-mark="n" data-id="${id}" aria-expanded="false" title="Add a note to this card">Add note</button><button class="mark" data-mark="b" data-id="${id}" aria-pressed="false" title="Bookmark (B)">Bookmark</button><button class="mark" data-mark="d" data-id="${id}" aria-pressed="false" title="Mark as difficult (D)">Difficult</button></span>`;
const noteEditor = id => `<div class="note-ed" data-note="${id}" hidden><label class="sr" for="ne-${id}">Your note</label><textarea id="ne-${id}" rows="3" maxlength="4000" placeholder="Your note on this card (plain text, saved in this browser)…"></textarea><div class="note-row"><span class="note-status" aria-live="polite"></span><span><button class="t-link note-del">Delete note</button><button class="t-link note-close">Close <kbd>esc</kbd></button></span></div></div>`;
function cardHTML(c, i, ch) {
  const tags = [c.eq && '<span class="tag eq-t">Equation</span>', c.def && '<span class="tag def-t">Definition</span>', c.ex && '<span class="tag">Example</span>'].filter(Boolean).join('');
  return `<section class="card" aria-label="${esc(c.h)}"><div class="card-body">
    <div class="sec"><span>${esc(c.s)}</span>${tags}${markBtns(screenId(ch, i))}</div>
    <h2>${esc(c.h)}</h2>
    <p>${c.t}</p>
    ${c.eq ? `<div class="eq" data-eq="${esc(c.eq)}"></div>` : ''}
    ${c.def ? `<div class="note"><span class="label">Definition</span>${c.def}</div>` : ''}
    ${c.ex ? `<div class="note example"><span class="label">Example</span>${c.ex}</div>` : ''}
    ${noteEditor(screenId(ch, i))}
  </div></section>`;
}
function quizHTML(q, i, n, ch) {
  return `<section class="card quiz" data-q="${i}"><div class="card-body">
    <div class="sec"><span class="tag q-t">Practice</span><span>${i + 1} of ${n}</span>${markBtns(`c${ch.n}-q${i + 1}`)}</div>
    <h2>${q.q}</h2>
    <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${o}</button>`).join('')}</div>
    <div class="feedback" aria-live="polite"></div>
    ${noteEditor(`c${ch.n}-q${i + 1}`)}
  </div></section>`;
}
function renderReader(book, ch, at = null) {
  document.title = `Ch ${ch.n} · ${book.short}`;
  const bs = bookState(book.id);
  const total = screens(ch);
  const next = book.chapters.find(c => c.n === ch.n + 1);
  const nextReady = next && ready(next);
  const quiz = ch.quiz || [];
  app.innerHTML = `<div class="reader">
    <header class="bar"><a href="#/book/${book.id}" class="back">← Chapters</a><span class="where" title="${esc(ch.title)}"><span>Ch ${ch.n} · </span>${esc(ch.title)}</span><span class="bar-r"><span class="count" id="count" aria-live="polite"></span><button class="navbtn sm" id="tutorBtn" aria-expanded="false" aria-controls="tutor">Ask tutor</button></span></header>
    <div class="track" role="progressbar" aria-label="Chapter progress" aria-valuemin="0" aria-valuemax="${total}" id="track"><div class="line" id="line"></div></div>
    <main class="feed" id="feed">
      ${ch.cards.map((c, i) => cardHTML(c, i, ch)).join('')}
      ${quiz.map((q, i) => quizHTML(q, i, quiz.length, ch)).join('')}
      <section class="card end"><div class="card-body">
        <div class="sec"><span>End of chapter ${ch.n}</span></div>
        <h2>${esc(ch.title)}</h2>
        <p>${nextReady ? `Next up: Chapter ${next.n}, ${esc(next.title)}.` : next ? `Chapter ${next.n} is coming soon.` : 'That’s the last chapter.'}</p>
        <div class="btns">${nextReady ? `<a class="btn" href="#/read/${book.id}/${next.n}">Next chapter →</a>` : ''}<a class="btn ghost" href="#/book/${book.id}">All chapters</a></div>
      </div></section>
    </main>
    <footer class="foot"><span class="hint"><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>space</kbd> to move · <kbd>esc</kbd> chapters · <kbd>B</kbd> bookmark · <kbd>D</kbd> difficult</span>
      <div class="nav"><button class="navbtn" id="prev" aria-label="Previous card">↑ Previous</button><button class="navbtn" id="next" aria-label="Next card">Next ↓</button></div></footer>
  </div>`;
  const feed = document.getElementById('feed');
  if (window.Tutor) { Tutor.mount(app.querySelector('.reader'), book, ch, 0); document.getElementById('tutorBtn').addEventListener('click', () => Tutor.toggle()); }
  else document.getElementById('tutorBtn').remove();
  const prevBtn = document.getElementById('prev'), nextBtn = document.getElementById('next');
  renderMath(feed);

  const h = () => feed.clientHeight || 1;
  const idx = () => Math.max(0, Math.min(total, Math.round(feed.scrollTop / h())));
  let target = null; // index we are smooth-scrolling toward; prevents double jumps on repeated keys
  function paint(i) {
    document.getElementById('count').textContent = i >= total ? 'Done' : `${i + 1} / ${total}`;
    document.getElementById('line').style.width = `${Math.min(100, (Math.min(i + 1, total) / total) * 100)}%`;
    document.getElementById('track').setAttribute('aria-valuenow', Math.min(i + 1, total));
    if (window.Tutor) Tutor.setIndex(Math.min(i, total));
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= total;
  }
  function update() {
    const i = idx();
    if (target !== null && i === target) target = null;
    paint(i);
    bs.chapter = ch.n;
    bs.card = Math.min(i, total - 1);
    if (i >= total) bs.done[ch.n] = true;
    bs.seen[ch.n] = Math.max(bs.seen[ch.n] ?? -1, Math.min(i, total - 1));
    state.last = book.id;
    state.recent = [{ book: book.id, chapter: ch.n, card: bs.card, at: Date.now() }, ...state.recent.filter(r => !(r.book === book.id && r.chapter === ch.n))].slice(0, 10);
    save();
  }
  function move(d) {
    const from = target !== null ? target : idx();
    const to = Math.max(0, Math.min(total, from + d));
    if (to === from) return;
    target = to;
    paint(to);
    feed.scrollTo({ top: to * h(), behavior: 'smooth' });
  }
  // Resume where the reader left off in this chapter.
  // A deep link (#/read/book/ch/N) jumps once; then drop N so a reload resumes at the saved card instead.
  if (at !== null) history.replaceState(null, '', `#/read/${book.id}/${ch.n}`);
  const start = at !== null ? at : bs.chapter === ch.n && !bs.done[ch.n] ? bs.card : 0;
  feed.style.scrollSnapType = 'none';
  feed.scrollTop = start * h();
  feed.style.scrollSnapType = '';
  update();

  let t;
  feed.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 80); });
  prevBtn.addEventListener('click', () => move(-1));
  nextBtn.addEventListener('click', () => move(1));
  // Bookmark / Difficult marks, saved per book by stable card id.
  function paintMarks() {
    feed.querySelectorAll('.mark[data-mark="n"]').forEach(b => {
      const has = !!bs.notes[b.dataset.id];
      b.classList.toggle('has-note', has);
      b.textContent = has ? 'Note' : 'Add note';
      b.title = has ? 'Edit your note on this card' : 'Add a note to this card';
    });
    feed.querySelectorAll('.mark:not([data-mark="n"])').forEach(b => {
      const on = !!(bs.marks[b.dataset.id] && bs.marks[b.dataset.id][b.dataset.mark]);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = b.dataset.mark === 'b' ? (on ? 'Bookmarked' : 'Bookmark') : 'Difficult';
    });
  }
  function toggleMark(id, kind) {
    const m = bs.marks[id] || {};
    m[kind] = !m[kind];
    if (!m.b && !m.d) delete bs.marks[id]; else bs.marks[id] = m;
    save(); paintMarks();
  }
  // Card notes: plain text, autosaved (debounced) by card id; empty text deletes the note.
  let noteTimer = null;
  function openNote(id) {
    const ed = feed.querySelector(`.note-ed[data-note="${id}"]`); if (!ed) return;
    ed.hidden = false;
    feed.querySelector(`.mark[data-mark="n"][data-id="${id}"]`).setAttribute('aria-expanded', 'true');
    const ta = ed.querySelector('textarea');
    ta.value = bs.notes[id] ? bs.notes[id].text : '';
    ed.querySelector('.note-status').textContent = bs.notes[id] ? `Saved · ${fmtWhen(bs.notes[id].at)}` : '';
    ed.querySelector('.note-del').hidden = !bs.notes[id];
    ta.focus();
    ed.scrollIntoView({ block: 'nearest' });
  }
  function saveNote(id, text) {
    const t = text.replace(/\s+$/, '');
    if (t.trim()) bs.notes[id] = { text: t, at: Date.now() }; else delete bs.notes[id];
    save(); paintMarks();
    const ed = feed.querySelector(`.note-ed[data-note="${id}"]`);
    if (ed) { ed.querySelector('.note-status').textContent = t.trim() ? 'Saved' : 'Note removed'; ed.querySelector('.note-del').hidden = !t.trim(); }
  }
  function closeNote(ed) {
    const id = ed.dataset.note;
    clearTimeout(noteTimer); saveNote(id, ed.querySelector('textarea').value);
    ed.hidden = true;
    const btn = feed.querySelector(`.mark[data-mark="n"][data-id="${id}"]`);
    btn.setAttribute('aria-expanded', 'false'); btn.focus({ preventScroll: true });
  }
  feed.addEventListener('input', e => {
    const ed = e.target.closest('.note-ed'); if (!ed) return;
    ed.querySelector('.note-status').textContent = 'Saving…';
    clearTimeout(noteTimer); noteTimer = setTimeout(() => saveNote(ed.dataset.note, e.target.value), 600);
  });
  feed.addEventListener('keydown', e => {
    const ed = e.target.closest && e.target.closest('.note-ed');
    if (ed && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNote(ed); }
  });
  paintMarks();
  feed.addEventListener('click', e => {
    const ned = e.target.closest('.note-ed');
    if (ned) {
      if (e.target.closest('.note-close')) closeNote(ned);
      else if (e.target.closest('.note-del')) { clearTimeout(noteTimer); ned.querySelector('textarea').value = ''; saveNote(ned.dataset.note, ''); ned.hidden = true; feed.querySelector(`.mark[data-mark="n"][data-id="${ned.dataset.note}"]`).setAttribute('aria-expanded', 'false'); }
      return;
    }
    const mk = e.target.closest('.mark');
    if (mk && mk.dataset.mark === 'n') { const ed = feed.querySelector(`.note-ed[data-note="${mk.dataset.id}"]`); if (ed && !ed.hidden) closeNote(ed); else openNote(mk.dataset.id); return; }
    if (mk) { toggleMark(mk.dataset.id, mk.dataset.mark); return; }
    const opt = e.target.closest('.opt');
    if (!opt || opt.disabled) return;
    const card = opt.closest('.quiz');
    const q = quiz[Number(card.dataset.q)];
    const pick = Number(opt.dataset.k);
    card.querySelectorAll('.opt').forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add('right');
      else if (k === pick) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    const fb = card.querySelector('.feedback');
    const letter = String.fromCharCode(65 + q.answer);
    fb.innerHTML = `<b class="${pick === q.answer ? 'ok' : 'no'}">${pick === q.answer ? 'Correct.' : 'Not quite.'}</b> ${q.why}<span class="answer-line">Correct answer: <span class="k">${letter}</span> — ${q.options[q.answer]}</span>`;
    renderMath(fb);
  });
  const onKey = e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const el = e.target;
    if (el && el.closest && el.closest('.tutor')) return; // the tutor panel handles its own keys
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const onControl = el && el.closest && el.closest('button, a');
    let d = 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') d = 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') d = -1;
    else if (e.key === ' ') { if (onControl) return; d = e.shiftKey ? -1 : 1; } // Space activates a focused button/link
    else if (e.key === 'Escape') { e.preventDefault(); go(`#/book/${book.id}`); return; }
    else if ((e.key === 'b' || e.key === 'B' || e.key === 'd' || e.key === 'D') && !e.shiftKey) {
      const i = target !== null ? target : idx();
      if (i < total) { e.preventDefault(); toggleMark(screenId(ch, i), e.key.toLowerCase()); }
      return;
    }
    if (!d) return;
    e.preventDefault();
    move(d);
  };
  document.addEventListener('keydown', onKey);
  feed.tabIndex = -1; feed.focus({ preventScroll: true });
  cleanup = () => {
    document.removeEventListener('keydown', onKey); clearTimeout(t); if (window.Tutor) Tutor.unmount();
    // flush any pending note edit before leaving the reader
    feed.querySelectorAll('.note-ed:not([hidden])').forEach(ed => { clearTimeout(noteTimer); saveNote(ed.dataset.note, ed.querySelector('textarea').value); });
  };
}

// ---------- boot ----------
Promise.all(BOOK_IDS.map(id => fetch(`data/${id}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(b => { books[id] = b; }).catch(() => { loadFailed.push(id); })))
  .then(route);
