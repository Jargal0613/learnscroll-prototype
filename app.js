// LearnScroll — a calm, card-by-card study feed for five textbooks.
const BOOK_IDS = ['heat-mass-transfer', 'koretsky-thermo', 'electric-circuits', 'university-physics', 'chemistry-silberberg'];
const KEY = 'learnscroll-study-v1';
const app = document.getElementById('app');
const books = {};

// ---------- saved progress ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { books: (s && typeof s.books === 'object' && s.books) || {}, last: (s && s.last) || null };
  } catch (e) { return { books: {}, last: null }; }
}
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function bookState(id) { return state.books[id] || (state.books[id] = { chapter: null, card: 0, done: {} }); }

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ready = ch => Array.isArray(ch.cards) && ch.cards.length > 0;
const screens = ch => ch.cards.length + (ch.quiz ? ch.quiz.length : 0);
function renderMath(el) {
  if (!window.katex) return;
  el.querySelectorAll('[data-eq]').forEach(n => {
    try { katex.render(n.dataset.eq, n, { displayMode: true, throwOnError: false }); } catch (e) {}
  });
  if (window.renderMathInElement) renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false });
}
function progressLabel(book) {
  const bs = state.books[book.id];
  if (!bs || !bs.chapter) {
    const n = book.chapters.filter(ready).length;
    return { text: `Not started · ${n} of ${book.chapters.length} chapters ready`, active: false };
  }
  const ch = book.chapters.find(c => c.n === bs.chapter);
  const total = ch && ready(ch) ? screens(ch) : 0;
  return { text: `Ch ${bs.chapter} · ${Math.min(bs.card + 1, total)}/${total} cards`, active: true };
}

// ---------- routing ----------
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.addEventListener('hashchange', route);
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (parts[0] === 'book' && books[parts[1]]) return renderBook(books[parts[1]]);
  if (parts[0] === 'read' && books[parts[1]]) {
    const ch = books[parts[1]].chapters.find(c => c.n === Number(parts[2]));
    if (ch && ready(ch)) return renderReader(books[parts[1]], ch);
  }
  renderHome();
}

// ---------- home ----------
function renderHome() {
  document.title = 'LearnScroll';
  const last = state.last && books[state.last] ? books[state.last] : null;
  let cont = '';
  if (last) {
    const bs = bookState(last.id);
    const ch = last.chapters.find(c => c.n === bs.chapter);
    if (ch && ready(ch)) cont = `<a class="continue" href="#/read/${last.id}/${ch.n}">Continue <small>${esc(last.short)} · Ch ${ch.n} · card ${bs.card + 1}</small></a>`;
  }
  app.innerHTML = `<main class="page">
    <div class="brand"><b>LearnScroll</b></div>
    <h1>Study, one card at a time.</h1>
    <p class="lead">Short notes for five textbooks, chapter by chapter. Scroll down to move through a chapter, then check yourself with a few questions.</p>
    ${cont}
    <div class="list">${BOOK_IDS.filter(id => books[id]).map(id => {
      const b = books[id], p = progressLabel(b);
      return `<a class="item" href="#/book/${b.id}">
        <div class="item-title">${esc(b.title)}</div>
        <div class="item-meta">${esc(b.author)} · ${esc(b.edition)}</div>
        <div class="item-desc">${esc(b.description)}</div>
        <div class="item-progress${p.active ? ' active' : ''}">${esc(p.text)}</div>
      </a>`;
    }).join('')}</div>
  </main>`;
}

// ---------- chapter list ----------
function renderBook(book) {
  document.title = book.short + ' · LearnScroll';
  const bs = bookState(book.id);
  app.innerHTML = `<main class="page">
    <a class="back" href="#/">← All books</a>
    <h1>${esc(book.title)}</h1>
    <p class="lead">${esc(book.author)} · ${esc(book.edition)}</p>
    <div class="list">${book.chapters.map(ch => {
      if (!ready(ch)) return `<div class="chap soon"><span class="num">${ch.n}</span><span class="name">${esc(ch.title)}</span><span class="info">coming soon</span></div>`;
      const here = bs.chapter === ch.n;
      const info = bs.done[ch.n] ? '<span class="info done">done</span>' : here ? `<span class="info done">${bs.card + 1}/${screens(ch)}</span>` : `<span class="info">${ch.cards.length} cards · ${(ch.quiz || []).length} questions</span>`;
      return `<a class="chap" href="#/read/${book.id}/${ch.n}"><span class="num">${ch.n}</span><span class="name">${esc(ch.title)}</span>${info}</a>`;
    }).join('')}</div>
  </main>`;
}

// ---------- reader ----------
function cardHTML(c) {
  return `<section class="card"><div class="card-body">
    <div class="sec">${esc(c.s)}</div>
    <h2>${esc(c.h)}</h2>
    <p>${c.t}</p>
    ${c.eq ? `<div class="eq" data-eq="${esc(c.eq)}"></div>` : ''}
    ${c.def ? `<div class="note"><span class="label">Definition</span>${c.def}</div>` : ''}
    ${c.ex ? `<div class="note example"><span class="label">Example</span>${c.ex}</div>` : ''}
  </div></section>`;
}
function quizHTML(q, i, n) {
  return `<section class="card quiz" data-q="${i}"><div class="card-body">
    <div class="sec">Practice · ${i + 1} of ${n}</div>
    <h2>${q.q}</h2>
    <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${o}</button>`).join('')}</div>
    <div class="feedback"></div>
  </div></section>`;
}
function renderReader(book, ch) {
  document.title = `Ch ${ch.n} · ${book.short}`;
  const bs = bookState(book.id);
  const total = screens(ch);
  const next = book.chapters.find(c => c.n === ch.n + 1);
  const nextReady = next && ready(next);
  const quiz = ch.quiz || [];
  app.innerHTML = `<div class="reader">
    <div class="line" id="line"></div>
    <div class="bar"><a href="#/book/${book.id}" class="back">← Chapters</a><span class="where">Ch ${ch.n} · ${esc(ch.title)}</span><span class="count" id="count"></span></div>
    <div class="feed" id="feed">
      ${ch.cards.map(cardHTML).join('')}
      ${quiz.map((q, i) => quizHTML(q, i, quiz.length)).join('')}
      <section class="card end"><div class="card-body">
        <div class="sec">End of chapter ${ch.n}</div>
        <h2>${esc(ch.title)}</h2>
        <p>${nextReady ? `Next up: Chapter ${next.n}, ${esc(next.title)}.` : next ? `Chapter ${next.n} is coming soon.` : 'That’s the last chapter.'}</p>
        ${nextReady ? `<a class="btn" href="#/read/${book.id}/${next.n}">Next chapter →</a>` : ''}<a class="btn ghost" href="#/book/${book.id}">All chapters</a>
      </div></section>
    </div>
    <div class="hint">↑ ↓ or space to move</div>
  </div>`;
  const feed = document.getElementById('feed');
  renderMath(feed);

  const h = () => feed.clientHeight || 1;
  const idx = () => Math.round(feed.scrollTop / h());
  function update() {
    const i = Math.min(idx(), total);
    document.getElementById('count').textContent = i >= total ? 'Done' : `${i + 1} / ${total}`;
    document.getElementById('line').style.width = `${Math.min(100, (Math.min(i + 1, total) / total) * 100)}%`;
    bs.chapter = ch.n;
    bs.card = Math.min(i, total - 1);
    if (i >= total) bs.done[ch.n] = true;
    state.last = book.id;
    save();
  }
  // Resume where the reader left off in this chapter.
  const start = bs.chapter === ch.n && !bs.done[ch.n] ? bs.card : 0;
  feed.style.scrollSnapType = 'none';
  feed.scrollTop = start * h();
  feed.style.scrollSnapType = '';
  update();

  let t;
  feed.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 80); });
  feed.addEventListener('click', e => {
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
    fb.innerHTML = `<b class="${pick === q.answer ? 'ok' : 'no'}">${pick === q.answer ? 'Correct.' : 'Not quite.'}</b> ${q.why}`;
    renderMath(fb);
  });
  const onKey = e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let d = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) d = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) d = -1;
    else if (e.key === 'Escape') { go(`#/book/${book.id}`); return; }
    if (!d) return;
    e.preventDefault();
    const target = Math.max(0, Math.min(total, idx() + d));
    feed.scrollTo({ top: target * h(), behavior: 'smooth' });
  };
  document.addEventListener('keydown', onKey);
  feed.tabIndex = -1; feed.focus({ preventScroll: true });
  cleanup = () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
}

// ---------- boot ----------
Promise.all(BOOK_IDS.map(id => fetch(`data/${id}.json`).then(r => r.json()).then(b => { books[id] = b; }).catch(() => {})))
  .then(route);
