// LearnScroll tutor panel (client). Talks only to /api/tutor; no provider keys ever live here.
// Conversations are stored per book in localStorage (no accounts or database exist).
(function () {
  const KEY = 'learnscroll-tutor-v1';
  const API = '/api/tutor';
  const MAX_HISTORY = 10;
  const STYLES = [['default', 'Default'], ['simple', 'Simple'], ['math', 'Math walkthrough'], ['example', 'Example']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Markdown-lite: paragraphs, **bold**, *italic*, `code`, "-"/"1." lists, ### headings. Math is protected first.
  function md(src) {
    const math = [];
    let s = String(src).replace(/\uE200[^\uE201]{0,200}\uE201/g, '').replace(/[\uE200-\uE2FF]/g, '').replace(/\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$/g, m => `\u0000${math.push(m) - 1}\u0000`);
    s = esc(s);
    const inline = t => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    const out = []; let list = null, para = [];
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
    for (const block of s.split(/\n{2,}/)) {
      for (const line of block.split('\n')) {
        let m;
        if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
        else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
        else if ((m = line.match(/^#{1,4}\s+(.*)/))) { close(); const t = m[1].replace(/\*\*/g, '').trim(); const cls = /^from the textbook/i.test(t) ? ' class="sec-book"' : /^additional explanation/i.test(t) ? ' class="sec-extra"' : ''; out.push(`<h4${cls}>${inline(m[1])}</h4>`); }
        else if (line.trim()) { if (list) { out.push(`</${list}>`); list = null; } para.push(inline(line)); }
      }
      close();
    }
    return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => esc(math[i].replace(/\\cdotp\b/g, '\\cdot')));
  }
  function renderMath(el) {
    if (window.renderMathInElement) renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
  }

  let ctx = null; // { book, ch, reader, index, open, busy }

  function cardAt(i) {
    const ch = ctx.ch, nc = ch.cards.length, nq = (ch.quiz || []).length;
    if (i < nc) return { id: `c${ch.n}-${i + 1}`, label: `Card ${i + 1}: ${ch.cards[i].h}`, data: ch.cards[i] };
    if (i < nc + nq) return { id: `c${ch.n}-q${i - nc + 1}`, label: `Practice ${i - nc + 1}`, data: ch.quiz[i - nc] };
    return null;
  }
  function conv() {
    const all = load();
    return all[ctx.book.id] || { conversationId: newId(), messages: [], draft: '', scope: 'card' };
  }
  function store(c) { const all = load(); all[ctx.book.id] = c; save(all); }

  function mount(reader, book, ch, index) {
    ctx = { reader, book, ch, index, open: false, busy: false };
    const panel = document.createElement('aside');
    panel.className = 'tutor'; panel.id = 'tutor'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Ask your tutor');
    panel.innerHTML = `
      <div class="t-head"><div><h2>Ask your tutor</h2><div class="t-ctx" id="t-ctx"></div></div>
        <div class="t-actions"><button class="t-link" id="t-new" title="Start a new conversation for this book">New conversation</button><button class="t-x" id="t-close" aria-label="Close tutor (Esc)">✕</button></div></div>
      <div class="t-scope" role="radiogroup" aria-label="Question scope">
        <button role="radio" data-scope="card">This card</button><button role="radio" data-scope="chapter">This chapter</button><button role="radio" data-scope="book">Whole book</button></div>
      <div class="t-style" role="radiogroup" aria-label="Answer style">${STYLES.map(([k, l]) => `<button role="radio" data-style="${k}">${l}</button>`).join('')}</div>
      <div class="t-notice" id="t-notice" hidden></div>
      <div class="t-log" id="t-log" aria-live="polite"></div>
      <form class="t-form" id="t-form">
        <textarea id="t-input" rows="3" maxlength="2000" placeholder="Ask a question about this card, chapter or book, e.g. “Why is the minus sign in Fourier’s law?” or “Work a numeric example with SI units.”" aria-label="Your question"></textarea>
        <div class="t-row"><span class="t-tip">Enter to send · Shift+Enter for a new line</span><button type="submit" class="t-send" id="t-send">Send</button></div>
      </form>`;
    reader.appendChild(panel);
    const $ = id => panel.querySelector('#' + id);
    const input = $('t-input');
    const c = conv(); input.value = c.draft || '';
    paintScope(); paintStyle(); paintLog(); paintCtx();
    checkStatus(book.id);

    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggle(false); }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => { const c = conv(); c.draft = input.value; store(c); });
    $('t-form').addEventListener('submit', e => { e.preventDefault(); send(); });
    $('t-close').addEventListener('click', () => toggle(false));
    $('t-new').addEventListener('click', () => {
      if (ctx.busy) return;
      const c = conv(); store({ conversationId: newId(), messages: [], draft: input.value, scope: c.scope });
      paintLog(); input.focus();
    });
    panel.querySelector('.t-scope').addEventListener('click', e => {
      const b = e.target.closest('[data-scope]'); if (!b || b.disabled) return;
      const c = conv(); c.scope = b.dataset.scope; store(c); paintScope();
    });
    panel.querySelector('.t-style').addEventListener('click', e => {
      const b = e.target.closest('[data-style]'); if (!b) return;
      const all = load(); all._prefs = { ...(all._prefs || {}), style: b.dataset.style }; save(all); paintStyle();
    });
  }

  // Ask the server which books the tutor can answer for, and say so up front instead of after a failed send.
  let statusCache = null;
  async function checkStatus(bookId) {
    try {
      if (!statusCache) { const r = await fetch(API, { method: 'GET' }); statusCache = r.ok ? await r.json() : null; }
    } catch (e) { statusCache = null; }
    if (!ctx || ctx.book.id !== bookId || !statusCache) return;
    const n = document.getElementById('t-notice'); if (!n) return;
    let msg = '';
    if (!statusCache.configured) msg = '<b>Tutor not configured.</b> The server has no AI provider credentials yet.';
    else if (!statusCache.books[bookId]) msg = '<b>Tutor not available for this book yet.</b> Only books whose textbook has been indexed can be asked about.';
    n.innerHTML = msg; n.hidden = !msg;
    ctx.unavailable = !!msg;
    const dis = !!msg;
    document.querySelectorAll('#t-input, #t-send').forEach(x => { x.disabled = dis; });
  }

  function effectiveScope() {
    const s = conv().scope || 'card';
    return s === 'card' && !cardAt(ctx.index) ? 'chapter' : s;
  }
  function paintScope() {
    const panel = document.getElementById('tutor'); if (!panel) return;
    const s = effectiveScope(), noCard = !cardAt(ctx.index);
    panel.querySelectorAll('[data-scope]').forEach(b => {
      b.setAttribute('aria-checked', String(b.dataset.scope === s));
      b.disabled = b.dataset.scope === 'card' && noCard;
    });
  }
  function getStyle() { const s = (load()._prefs || {}).style; return STYLES.some(x => x[0] === s) ? s : 'default'; }
  function paintStyle() {
    const s = getStyle();
    document.querySelectorAll('#tutor [data-style]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.style === s)));
  }
  function paintCtx() {
    const el = document.getElementById('t-ctx'); if (!el) return;
    const card = cardAt(ctx.index);
    el.innerHTML = `${esc(ctx.book.short)} · Ch ${ctx.ch.n}: ${esc(ctx.ch.title)}<br><span>${card ? esc(card.label) : 'End of chapter'}</span>`;
  }
  function msgHTML(m) {
    if (m.role === 'user') return `<div class="t-msg user"><div class="t-who">You${m.where ? ` · ${esc(m.where)}` : ''}</div><div class="t-body">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
    let src = '';
    if ((m.passages || []).length) {
      src = `<details class="t-src"><summary>Sources retrieved from the textbook (${m.passages.length})</summary>${m.passages.map(x => `<div class="t-pass"><div class="t-pass-h">Retrieved passage <span>· ${esc(x.book)}${x.chapter ? ` · Ch ${x.chapter}` : ''}</span></div><p>${esc(x.excerpt)}</p></div>`).join('')}<div class="t-pass-note">Page number unavailable. This passage was retrieved as relevant context; it is not a sentence-by-sentence citation.</div></details>`;
    } else if ((m.sources || []).length) {
      src = `<div class="t-src"><div class="t-src-h">Sources</div><ol>${m.sources.map(s => `<li><span class="t-kind k-${s.kind}">${s.kind === 'book' ? 'Book' : 'Notes'}</span>${esc(s.label)}</li>`).join('')}</ol></div>`;
    } else if (m.retrieval) src = '<div class="t-src none">No textbook sources for this answer.</div>';
    return `<div class="t-msg bot"><div class="t-who">Tutor</div><div class="t-body md">${md(m.content)}</div>${src}</div>`;
  }
  function paintLog(extra = '') {
    const log = document.getElementById('t-log'); if (!log) return;
    const c = conv();
    log.innerHTML = c.messages.length || extra
      ? c.messages.map(msgHTML).join('') + extra
      : `<div class="t-empty"><p>Ask anything about what you're studying. Answers search this book's textbook and list the sources they cite.</p><p>Pick a scope and an answer style above, then type your question below.</p></div>`;
    renderMath(log);
    log.scrollTop = log.scrollHeight;
  }

  async function send() {
    if (!ctx || ctx.busy || ctx.unavailable) return;
    const input = document.getElementById('t-input');
    const q = input.value.trim(); if (!q) { input.focus(); return; }
    const c = conv(), card = cardAt(ctx.index), scope = effectiveScope();
    const where0 = scope === 'book' ? 'Whole book' : scope === 'chapter' ? `Ch ${ctx.ch.n}` : card.label;
    const style = getStyle();
    const styleLabel = style === 'default' ? '' : STYLES.find(x => x[0] === style)[1];
    const where = [where0, styleLabel].filter(Boolean).join(' · ');
    // Ids only: the server resolves book, chapter and card titles from its own data.
    const payload = {
      bookId: ctx.book.id, chapterId: ctx.ch.n, cardId: card ? card.id : null,
      conversationId: c.conversationId, scope, style, question: q,
      messages: c.messages.slice(-MAX_HISTORY).map(m => ({ role: m.role, content: m.content })),
    };
    ctx.busy = true; setBusy(true);
    input.value = '';
    paintLog(msgHTML({ role: 'user', content: q, where }) + '<div class="t-msg bot loading"><div class="t-who">Tutor</div><div class="t-dots" aria-label="Generating answer"><i></i><i></i><i></i></div></div>');
    let res, data;
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 45000);
      try { res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ac.signal }); }
      finally { clearTimeout(t); }
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || typeof data.answer !== 'string') {
        const err = data && data.error;
        throw Object.assign(new Error(err && err.message || `The tutor service is unavailable (HTTP ${res.status}).`), { code: err && err.code });
      }
      const fresh = conv(); // re-read in case another tab changed it
      fresh.messages.push({ role: 'user', content: q, where, at: Date.now() }, { role: 'assistant', content: data.answer, sources: data.sources || [], passages: (data.passages || []).slice(0, 3), retrieval: data.retrieval || null, at: Date.now() });
      fresh.messages = fresh.messages.slice(-60);
      fresh.draft = '';
      store(fresh);
      ctx.busy = false; setBusy(false); paintLog();
    } catch (e) {
      ctx.busy = false; setBusy(false);
      // Keep the user's question: put it back in the box (and the saved draft) so nothing is lost.
      input.value = q; const d = conv(); d.draft = q; store(d);
      const msg = e.name === 'AbortError' ? 'The request timed out.' : e.message === 'Failed to fetch' ? 'Could not reach the tutor service. Check your connection.' : e.message;
      paintLog(`<div class="t-err" role="alert"><b>${e.code === 'not_configured' ? 'Tutor not configured' : e.code === 'book_not_available' ? 'Tutor not available for this book yet' : e.code === 'rate_limited' ? 'Too many requests' : 'Couldn’t get an answer'}</b><p>${esc(msg)}</p><button class="t-retry" id="t-retry">Retry</button></div>`);
      document.getElementById('t-retry').addEventListener('click', send);
    }
  }
  function setBusy(b) {
    const s = document.getElementById('t-send'); if (s) { s.disabled = b || !!(ctx && ctx.unavailable); s.textContent = b ? 'Thinking…' : 'Send'; }
    document.querySelectorAll('#t-new').forEach(x => { x.disabled = b; });
  }

  function toggle(force) {
    if (!ctx) return;
    const open = force === undefined ? !ctx.open : force;
    ctx.open = open;
    const panel = document.getElementById('tutor');
    panel.hidden = !open;
    ctx.reader.classList.toggle('with-tutor', open);
    const btn = document.getElementById('tutorBtn');
    if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open); }
    if (open) { paintLog(); document.getElementById('t-input').focus(); }
    else { const f = document.getElementById('feed'); if (f) f.focus({ preventScroll: true }); }
  }
  function setIndex(i) { if (!ctx) return; ctx.index = i; paintCtx(); paintScope(); }
  function unmount() { ctx = null; }

  window.Tutor = { mount, toggle, setIndex, unmount, isOpen: () => !!(ctx && ctx.open), _md: md };
})();
