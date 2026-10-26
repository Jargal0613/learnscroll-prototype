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
  if (parts[0] === 'book') return renderBook(books[parts[1]]);
  if (parts[0] === 'read') {
    const b = books[parts[1]];
    const ch = b.chapters.find(c => c.n === Number(parts[2]));
    if (ch && ready(ch)) return renderReader(b, ch);
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
    if (ch && ready(ch)) cont = `<a class="continue" href="#/read/${last.id}/${ch.n}"><div><div class="k">Continue</div><div class="t">${esc(last.short)} · Ch ${ch.n}: ${esc(ch.title)}</div><div class="s">Card ${bs.card + 1} of ${screens(ch)}</div></div><span class="go">Resume →</span></a>`;
  }
  app.innerHTML = `<main class="page">
    <div class="topline"><div class="brand"><i></i>LearnScroll</div></div>
    <h1>Study, one card at a time.</h1>
    <p class="lead">Short study notes for five textbooks, chapter by chapter. Move through a chapter one idea per screen, then check yourself with a few practice questions. Progress is saved in this browser.</p>
    ${loadFailed.length ? `<div class="notice">${plural(loadFailed.length, 'book')} couldn’t be loaded. Reload the page to try again.</div>` : ''}
    ${cont}
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
  </main>`;
}

// ---------- chapter list ----------
function renderBook(book) {
  document.title = book.short + ' · LearnScroll';
  const bs = state.books[book.id];
  const avail = book.chapters.filter(ready).length;
  const label = { done: 'Completed', ready: 'Available', soon: 'Coming soon' };
  app.innerHTML = `<main class="page">
    <a class="back" href="#/">← Library</a>
    <div class="book-head"><div><h1>${esc(book.title)}</h1><p class="meta-line">${esc(book.author)} · ${esc(book.edition)}</p></div>
    <div class="legend"><span>${avail} of ${book.chapters.length} chapters available</span></div></div>
    <div class="chapters" role="list">${book.chapters.map(ch => {
      const st = chapterState(book, ch);
      if (st === 'soon') return `<div class="chap soon" role="listitem"><span class="num">${ch.n}</span><span class="name">${esc(ch.title)}</span><span class="counts"></span><span class="pill">Coming soon</span></div>`;
      const pill = st === 'progress' ? `<span class="pill prog">Card ${bs.card + 1}/${screens(ch)}</span>` : `<span class="pill ${st}">${label[st]}</span>`;
      return `<a class="chap" role="listitem" href="#/read/${book.id}/${ch.n}"><span class="num">${ch.n}</span><span class="name">${esc(ch.title)}</span><span class="counts">${plural(ch.cards.length, 'card')} · ${plural((ch.quiz || []).length, 'question')}</span>${pill}</a>`;
    }).join('')}</div>
  </main>`;
}

// ---------- reader ----------
// Card kinds come from the existing fields: eq → equation, def → definition, ex → worked example.
function cardHTML(c) {
  const tags = [c.eq && '<span class="tag eq-t">Equation</span>', c.def && '<span class="tag def-t">Definition</span>', c.ex && '<span class="tag">Example</span>'].filter(Boolean).join('');
  return `<section class="card" aria-label="${esc(c.h)}"><div class="card-body">
    <div class="sec"><span>${esc(c.s)}</span>${tags}</div>
    <h2>${esc(c.h)}</h2>
    <p>${c.t}</p>
    ${c.eq ? `<div class="eq" data-eq="${esc(c.eq)}"></div>` : ''}
    ${c.def ? `<div class="note"><span class="label">Definition</span>${c.def}</div>` : ''}
    ${c.ex ? `<div class="note example"><span class="label">Example</span>${c.ex}</div>` : ''}
  </div></section>`;
}
function quizHTML(q, i, n) {
  return `<section class="card quiz" data-q="${i}"><div class="card-body">
    <div class="sec"><span class="tag q-t">Practice</span><span>${i + 1} of ${n}</span></div>
    <h2>${q.q}</h2>
    <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${o}</button>`).join('')}</div>
    <div class="feedback" aria-live="polite"></div>
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
    <header class="bar"><a href="#/book/${book.id}" class="back">← Chapters</a><span class="where" title="${esc(ch.title)}"><span>Ch ${ch.n} · </span>${esc(ch.title)}</span><span class="count" id="count" aria-live="polite"></span></header>
    <div class="track" role="progressbar" aria-label="Chapter progress" aria-valuemin="0" aria-valuemax="${total}" id="track"><div class="line" id="line"></div></div>
    <main class="feed" id="feed">
      ${ch.cards.map(cardHTML).join('')}
      ${quiz.map((q, i) => quizHTML(q, i, quiz.length)).join('')}
      <section class="card end"><div class="card-body">
        <div class="sec"><span>End of chapter ${ch.n}</span></div>
        <h2>${esc(ch.title)}</h2>
        <p>${nextReady ? `Next up: Chapter ${next.n}, ${esc(next.title)}.` : next ? `Chapter ${next.n} is coming soon.` : 'That’s the last chapter.'}</p>
        <div class="btns">${nextReady ? `<a class="btn" href="#/read/${book.id}/${next.n}">Next chapter →</a>` : ''}<a class="btn ghost" href="#/book/${book.id}">All chapters</a></div>
      </div></section>
    </main>
    <footer class="foot"><span class="hint"><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>space</kbd> to move · <kbd>esc</kbd> chapters</span>
      <div class="nav"><button class="navbtn" id="prev" aria-label="Previous card">↑ Previous</button><button class="navbtn" id="next" aria-label="Next card">Next ↓</button></div></footer>
  </div>`;
  const feed = document.getElementById('feed');
  const prevBtn = document.getElementById('prev'), nextBtn = document.getElementById('next');
  renderMath(feed);

  const h = () => feed.clientHeight || 1;
  const idx = () => Math.max(0, Math.min(total, Math.round(feed.scrollTop / h())));
  let target = null; // index we are smooth-scrolling toward; prevents double jumps on repeated keys
  function paint(i) {
    document.getElementById('count').textContent = i >= total ? 'Done' : `${i + 1} / ${total}`;
    document.getElementById('line').style.width = `${Math.min(100, (Math.min(i + 1, total) / total) * 100)}%`;
    document.getElementById('track').setAttribute('aria-valuenow', Math.min(i + 1, total));
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
    state.last = book.id;
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
  const start = bs.chapter === ch.n && !bs.done[ch.n] ? bs.card : 0;
  feed.style.scrollSnapType = 'none';
  feed.scrollTop = start * h();
  feed.style.scrollSnapType = '';
  update();

  let t;
  feed.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(update, 80); });
  prevBtn.addEventListener('click', () => move(-1));
  nextBtn.addEventListener('click', () => move(1));
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
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const onControl = el && el.closest && el.closest('button, a');
    let d = 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') d = 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') d = -1;
    else if (e.key === ' ') { if (onControl) return; d = e.shiftKey ? -1 : 1; } // Space activates a focused button/link
    else if (e.key === 'Escape') { e.preventDefault(); go(`#/book/${book.id}`); return; }
    if (!d) return;
    e.preventDefault();
    move(d);
  };
  document.addEventListener('keydown', onKey);
  feed.tabIndex = -1; feed.focus({ preventScroll: true });
  cleanup = () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
}

// ---------- boot ----------
Promise.all(BOOK_IDS.map(id => fetch(`data/${id}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(b => { books[id] = b; }).catch(() => { loadFailed.push(id); })))
  .then(route);
