// LearnScroll tutor panel (client). Talks only to /api/tutor; no provider keys ever live here.
// Conversations are stored per book in localStorage (no accounts or database exist).
(function () {
  const KEY = 'learnscroll-tutor-v1';
  const API = '/api/tutor';
  const MAX_HISTORY = 10;
  const STYLES = [['default', 'Default'], ['simple', 'Simple'], ['math', 'Math walkthrough'], ['example', 'Example']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => {
    let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { return {}; }
    if (raw === null) return {};
    try { const v = JSON.parse(raw); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch (e) {}
    // unreadable: keep a backup before anything overwrites it (the library offers it for download)
    try { if (!localStorage.getItem(KEY + '-corrupt-backup')) localStorage.setItem(KEY + '-corrupt-backup', raw); } catch (e) {}
    return {};
  };
  const save = s => { try { if (window.StudyData) s._schema = window.StudyData.SCHEMA; localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { if (window.lsSaveFailed) window.lsSaveFailed(e); return false; } };
  const validConv = c => c && typeof c === 'object' && typeof c.conversationId === 'string' && Array.isArray(c.messages) && c.messages.every(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Markdown-lite: paragraphs, **bold**, *italic*, `code`, "-"/"1." lists, ### headings. Math is protected first.
  function md(src) {
    const math = [];
    let s = String(src).replace(/\uE200[^\uE201]{0,200}\uE201/g, '').replace(/[\uE200-\uE2FF]/g, '').replace(/\\u00[01][0-9a-fA-F]/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$\$[\s\S]+?\$\$/g, m => `\u0000${math.push(m) - 1}\u0000`);
    s = esc(s);
    const inline = t => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    const out = []; let list = null, para = [], blk = false;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
    for (const block of s.split(/\n{2,}/)) {
      for (const line of block.split('\n')) {
        let m;
        if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
        else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
        else if ((m = line.match(/^#{1,4}\s+(.*)/))) {
          close(); const t = m[1].replace(/\*\*/g, '').trim();
          const kind = /^from the textbook/i.test(t) ? 'book' : /^additional explanation/i.test(t) ? 'extra' : '';
          if (kind) { if (blk) out.push('</div>'); out.push(`<div class="t-sec t-sec-${kind}">`); blk = true; } // textbook vs extra explanation, visibly separate
          out.push(`<h4${kind ? ` class="sec-${kind}"` : ''}>${inline(m[1])}</h4>`);
        }
        else if (line.trim()) { if (list) { out.push(`</${list}>`); list = null; } para.push(inline(line)); }
      }
      close();
    }
    if (blk) out.push('</div>');
    return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => esc(math[i].replace(/\\cdotp\b/g, '\\cdot')));
  }
  function renderMath(el) {
    if (window.renderMathInElement) renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
  }

  let ctx = null; // { book, ch, reader, index, open, busy }

  function cardAt(i) {
    const ch = ctx.ch, nc = ch.cards.length, nq = (ch.quiz || []).length;
    if (!(i >= 0)) return null; // pages other than the reader have no current card
    if (i < nc) return { id: `c${ch.n}-${i + 1}`, label: `Card ${i + 1}: ${ch.cards[i].h}`, data: ch.cards[i] };
    if (i < nc + nq) return { id: `c${ch.n}-q${i - nc + 1}`, label: `Practice ${i - nc + 1}`, data: ch.quiz[i - nc] };
    return null;
  }
  function conv() {
    const all = load();
    const c = all[ctx.book.id];
    return validConv(c) ? c : { conversationId: newId(), messages: [], draft: '', scope: 'card' };
  }
  function store(c) { const all = load(); all[ctx.book.id] = c; return save(all); }
  const MAX_SAVED = 10;
  // Where a conversation started: follow-ups keep this book/chapter/card/scope so the history stays on topic.
  function originNow() {
    const card = cardAt(ctx.index), scope = effectiveScope();
    return { chapter: ctx.ch.n, chapterTitle: ctx.ch.title, index: ctx.index, cardId: card ? card.id : null, label: card ? card.label : ctx.global ? pageLabel() : 'End of chapter', scope, at: Date.now() };
  }
  const scopeLabel = s => (s === 'book' ? 'Whole book' : s === 'chapter' ? 'This chapter' : 'This card');
  function archive(c) { // keep a finished conversation so it can be reopened
    const saved = (c.saved || []).filter(x => x.conversationId !== c.conversationId);
    if (c.messages.length) saved.unshift({ conversationId: c.conversationId, messages: c.messages, scope: c.scope, origin: c.origin || null });
    return saved.slice(0, MAX_SAVED);
  }

  // Page context (tutorctx.js), read fresh at send time. The reader builds it from the current card; other pages
  // register window.lsPageCtx = () => ({ ctx, label }). Building it never calls the API.
  function pageInfo() {
    if (!ctx) return null;
    if (!ctx.global) {
      const card = cardAt(ctx.index); if (!card) return null;
      const quiz = /-q\d/.test(card.id), d = card.data || {};
      const refs = [quiz ? d.ref : d.ref || null].filter(Boolean);
      return { label: card.label, ctx: { schemaVersion: 1, pageType: quiz ? 'quiz' : 'reader', bookId: ctx.book.id, chapterId: ctx.ch.n, itemId: card.id, sectionId: d.s || null, sourceRefs: refs, pageState: quiz ? { question: String(d.q || '').slice(0, 160) } : { cardTitle: d.h || '', cardIndex: ctx.index + 1, cards: ctx.ch.cards.length } } };
    }
    try { return typeof window.lsPageCtx === 'function' ? window.lsPageCtx() : null; } catch (e) { return null; }
  }
  function pageContext() {
    const p = pageInfo(); if (!p || !p.ctx || !window.TutorCtx) return null;
    const pc = window.TutorCtx.sanitize(p.ctx, ctx.book).ctx; // same validator the server runs
    if (pc && ctx.global && pc.chapterId && pc.chapterId !== ctx.ch.n) ctx.ch = ctx.book.chapters.find(c => c.n === pc.chapterId) || ctx.ch;
    return pc;
  }
  function pageLabel() {
    const p = pageInfo(), c = p && p.ctx, T = window.TutorCtx;
    return c && T ? [T.LABEL[c.pageType], p.label].filter(Boolean).join(' · ') : 'This page';
  }
  function mount(reader, book, ch, index, opts = {}) {
    ctx = { reader, book, ch, index, open: false, busy: false, global: !!opts.global };
    const panel = document.createElement('aside');
    panel.className = 'tutor' + (ctx.global ? ' g' : ''); panel.id = 'tutor'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Ask your tutor');
    panel.innerHTML = `
      <div class="t-head"><div><h2>Ask your tutor</h2><div class="t-ctx" id="t-ctx"></div><div class="t-status" id="t-status" data-state="checking" aria-live="polite">Checking tutor…</div></div>
        <div class="t-actions"><button class="t-link" id="t-saved" aria-expanded="false" aria-controls="t-saved-list" title="Reopen an earlier conversation for this book">Saved</button><button class="t-link" id="t-new" title="Start a new conversation for this book">New conversation</button><button class="t-x" id="t-close" aria-label="Close tutor (Esc)">✕</button></div></div>
      <div class="t-solve-row" id="t-solve-row" hidden><button type="button" class="t-solve-b" id="t-solve" aria-pressed="false" title="Get a worked, step-by-step solution to a numeric problem">Solve a problem</button></div>
      <div class="t-scope" role="radiogroup" aria-label="Question scope">
        <button role="radio" data-scope="card">This card</button><button role="radio" data-scope="chapter">This chapter</button><button role="radio" data-scope="book">Whole book</button></div>
      <div class="t-style" role="radiogroup" aria-label="Answer style">${STYLES.map(([k, l]) => `<button role="radio" data-style="${k}">${l}</button>`).join('')}</div>
      <div class="t-saved-list" id="t-saved-list" hidden></div>
      <div class="t-notice" id="t-notice" hidden></div>
      <div class="t-solve-note" id="t-solve-note" hidden>Problem solver: paste a textbook-style problem with its numbers and units. You get Given, Find, Assumptions, Equations, Substitution, Units, Answer and a Sanity check. <button type="button" class="t-link" id="t-solve-off">Back to questions</button></div>
      <div class="t-log" id="t-log" aria-live="polite"></div>
      <form class="t-form" id="t-form">
        <textarea id="t-input" rows="3" maxlength="2000" placeholder="Ask a question about this card, chapter or book, e.g. “Why is the minus sign in Fourier’s law?” or “Work a numeric example with SI units.”" aria-label="Your question"></textarea>
        <div class="t-row"><span class="t-tip">Enter to send · Shift+Enter for a new line</span><button type="submit" class="t-send" id="t-send">Send</button></div>
      </form>`;
    if (ctx.global) panel.querySelector('#t-input').placeholder = 'Ask about this page, its chapter or the book, e.g. “When can I use this equation?”';
    reader.appendChild(panel);
    const $ = id => panel.querySelector('#' + id);
    const input = $('t-input');
    const c = conv(); input.value = c.draft || '';
    paintAll();
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
    $('t-solve').addEventListener('click', () => setSolve(!ctx.solve));
    $('t-solve-off').addEventListener('click', () => setSolve(false));
    $('t-log').addEventListener('click', e => {
      const fb = e.target.closest('[data-fb],[data-fbr]');
      if (fb && !ctx.busy) {
        const i = Number(fb.dataset.fb ?? fb.dataset.fbr);
        if (fb.dataset.fb !== undefined) { const v = fb.dataset.v; return setFeedback(i, f => (f && f.rating === v ? null : { rating: v, reasons: v === 'needs_work' && f ? f.reasons : [], at: Date.now() }), `[data-v="${v}"]`); }
        const r = fb.dataset.r; return setFeedback(i, f => f && { ...f, reasons: f.reasons.includes(r) ? f.reasons.filter(x => x !== r) : [...f.reasons, r], at: Date.now() }, `[data-r="${r}"]`);
      }
      const sg = e.target.closest('[data-suggest]');
      if (sg) { const i = document.getElementById('t-input'); i.value = sg.dataset.suggest; const c = conv(); c.draft = i.value; store(c); i.focus(); return; }
      const b = e.target.closest('[data-check],[data-hint],[data-reveal]'); if (!b) return;
      if (b.dataset.check !== undefined) return runCheck(Number(b.dataset.check), b);
      const el = document.getElementById(b.getAttribute('aria-controls'));
      el.hidden = !el.hidden; b.setAttribute('aria-expanded', String(!el.hidden));
      if (b.dataset.reveal !== undefined) b.textContent = el.hidden ? 'Reveal answer' : 'Hide answer';
      if (b.dataset.hint !== undefined) b.textContent = el.hidden ? 'Hint' : 'Hide hint';
      renderMath(el);
    });
    $('t-new').addEventListener('click', () => {
      if (ctx.busy) return;
      const c = conv(); store({ conversationId: newId(), messages: [], draft: input.value, scope: c.scope, saved: archive(c) });
      paintAll(); input.focus();
    });
    $('t-saved').addEventListener('click', () => { const l = $('t-saved-list'); l.hidden = !l.hidden; $('t-saved').setAttribute('aria-expanded', String(!l.hidden)); paintSaved(); if (!l.hidden) { const f = l.querySelector('button'); if (f) f.focus(); } });
    $('t-saved-list').addEventListener('click', e => {
      const b = e.target.closest('[data-open]'); if (!b || ctx.busy) return;
      const c = conv(), saved = archive(c), pick = saved.find(x => x.conversationId === b.dataset.open); if (!pick) return;
      store({ conversationId: pick.conversationId, messages: pick.messages, scope: pick.scope || 'card', origin: pick.origin || null, draft: '', saved: saved.filter(x => x !== pick) });
      $('t-saved-list').hidden = true; $('t-saved').setAttribute('aria-expanded', 'false'); paintAll(); input.focus();
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
  // The answer comes from GET /api/tutor, which reads the server's provider + knowledge config (no ids or secrets).
  let statusCache = null;
  async function checkStatus(bookId) {
    let failed = false;
    try {
      if (!statusCache) { const r = await fetch(API, { method: 'GET' }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); if (!j || typeof j.books !== 'object') throw new Error('bad status'); statusCache = j; }
    } catch (e) { statusCache = null; failed = true; }
    if (!ctx || ctx.book.id !== bookId) return;
    const n = document.getElementById('t-notice'), st = document.getElementById('t-status'); if (!n || !st) return;
    let msg = '', state, label;
    if (failed) { state = 'error'; label = 'Couldn’t check the tutor (network or server error). Sending may fail.'; }
    else if (!statusCache.configured) return applyUnavailable('not_configured');
    else if (!statusCache.books[bookId]) return applyUnavailable('book_not_available');
    else { state = 'on'; label = 'Tutor connected'; const sr = document.getElementById('t-solve-row'); if (sr) sr.hidden = statusCache.solver !== true; }
    st.dataset.state = state; st.textContent = label;
    n.innerHTML = msg; n.hidden = !msg;
    ctx.unavailable = !!msg;
    document.querySelectorAll('#t-input, #t-send').forEach(x => { x.disabled = !!msg; });
  }

  function applyUnavailable(code) {
    const n = document.getElementById('t-notice'), st = document.getElementById('t-status'); if (!n || !st) return;
    st.dataset.state = 'off'; st.textContent = code === 'not_configured' ? 'Tutor unavailable' : 'Tutor unavailable for this book';
    n.innerHTML = code === 'not_configured' ? '<b>Tutor unavailable.</b> The server has no AI provider set up, so no questions can be answered right now.' : `<b>Tutor unavailable for this book.</b> ${esc(ctx.book.short)}’s textbook hasn’t been connected yet. Questions here are not sent, and other books are never searched instead.`;
    n.hidden = false; ctx.unavailable = true;
    const empty = document.querySelector('#t-log .t-empty'); if (empty) empty.innerHTML = '<p>You can still read and review this book; only the tutor is unavailable here.</p>';
    document.querySelectorAll('#t-input, #t-send').forEach(x => { x.disabled = true; });
  }
  function effectiveScope() {
    const c = conv(); if (c.messages.length && c.origin) return c.origin.scope;
    const s = c.scope || 'card';
    return s === 'card' && !cardAt(ctx.index) ? 'chapter' : s;
  }
  function paintScope() {
    const panel = document.getElementById('tutor'); if (!panel) return;
    const s = effectiveScope(), noCard = !cardAt(ctx.index), c = conv(), pinned = !!(c.messages.length && c.origin);
    panel.querySelectorAll('[data-scope]').forEach(b => {
      b.setAttribute('aria-checked', String(b.dataset.scope === s));
      b.disabled = pinned ? b.dataset.scope !== s : b.dataset.scope === 'card' && noCard;
    });
    panel.querySelector('.t-scope').title = pinned ? 'Scope is fixed for this conversation. Start a new conversation to change it.' : '';
  }
  function getStyle() { const s = (load()._prefs || {}).style; return STYLES.some(x => x[0] === s) ? s : 'default'; }
  function paintStyle() {
    const s = getStyle();
    document.querySelectorAll('#tutor [data-style]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.style === s)));
  }
  function paintCtx() {
    const el = document.getElementById('t-ctx'); if (!el) return;
    const card = cardAt(ctx.index), c = conv(), o = c.messages.length && c.origin;
    if (ctx.global) { // the current page always; plus where an ongoing conversation started
      pageContext();
      el.innerHTML = `<span data-page-ctx>Context: ${esc(pageLabel())}</span><br><span>${esc(ctx.book.short)} · Ch ${ctx.ch.n}: ${esc(ctx.ch.title)}</span>${o ? `<br><span class="t-orig">Conversation started on: ${esc(o.label)} · ${scopeLabel(o.scope)}</span>` : ''}`;
      return;
    }
    if (o) { // a reopened or ongoing conversation shows where it started, not where the reader is now
      el.innerHTML = `<span class="t-orig">Conversation from ${esc(ctx.book.short)} · Ch ${o.chapter}: ${esc(o.chapterTitle || '')}</span><br><span>${esc(o.label)} · ${scopeLabel(o.scope)}</span>`;
      return;
    }
    el.innerHTML = `${esc(ctx.book.short)} · Ch ${ctx.ch.n}: ${esc(ctx.ch.title)}<br><span>${card ? esc(card.label) : 'End of chapter'}</span>`;
  }
  // Problem solver mode: only offered when GET /api/tutor reports solver: true (switched on + rate limiter configured).
  function setSolve(on) {
    if (!ctx || ctx.busy) return;
    const sb = document.getElementById('t-solve'), sr = document.getElementById('t-solve-row'); if (!sr || sr.hidden) on = false;
    ctx.solve = !!on;
    const panel = document.getElementById('tutor'), input = document.getElementById('t-input');
    panel.classList.toggle('solving', ctx.solve);
    if (sb) sb.setAttribute('aria-pressed', String(ctx.solve));
    document.getElementById('t-solve-note').hidden = !ctx.solve;
    input.maxLength = ctx.solve ? 3000 : 2000;
    input.placeholder = ctx.solve ? 'Paste the problem, e.g. “A 0.2 m thick wall with k = 0.8 W/m·K has 50 K across it. Find the heat flux.”' : 'Ask a question about this card, chapter or book, e.g. “Why is the minus sign in Fourier’s law?” or “Work a numeric example with SI units.”';
    input.setAttribute('aria-label', ctx.solve ? 'Your problem' : 'Your question');
    setBusy(false); input.focus();
  }
  const mathText = t => esc(t); // steps may contain \( \) math; KaTeX auto-render handles it after insert
  // Where the solution's textbook support came from, decided by the server from the File Search call itself.
  function retrievalHTML(r) {
    if (!r || typeof r !== 'object') return '';
    if (r.status === 'retrieved' && (r.passages || []).length) return `<details class="t-src sv-ret" data-ret="retrieved"><summary>Source retrieved from the textbook (${r.passages.length} passage${r.passages.length === 1 ? '' : 's'})</summary>${r.passages.map(x => `<div class="t-pass"><div class="t-pass-h">Retrieved passage <span>· ${esc(ctx ? ctx.book.short : '')}${x.chapter ? ` · Ch ${esc(x.chapter)}` : ''}</span></div><p>${esc(x.excerpt)}</p></div>`).join('')}<div class="t-pass-note">Page number unavailable. Retrieved as relevant context; not a sentence-by-sentence citation.</div></details>`;
    if (r.status === 'none') return '<div class="t-src sv-ret none" data-ret="none"><b>No relevant textbook passage found.</b> The search ran but found nothing from this book for this problem, so nothing below is marked “From the textbook”. Check the steps against your notes.</div>';
    if (r.status === 'failed') return '<div class="t-src sv-ret none" data-ret="failed"><b>Textbook search failed.</b> The book couldn’t be searched for this problem, so nothing below is marked “From the textbook”. Try again later if you need the textbook source.</div>';
    return '';
  }
  function solutionHTML(x, r) {
    const row = (h, body) => body ? `<div class="sv-row"><div class="sv-h">${h}</div><div class="sv-b">${body}</div></div>` : '';
    const list = a => (a || []).length ? `<ul>${a.map(t => `<li>${mathText(t)}</li>`).join('')}</ul>` : '';
    const eqs = (x.equations || []).map(e => `<div class="sv-eq">${esc('\\[' + e.tex + '\\]')}<span class="sv-src">${e.source ? 'From the textbook · ' + esc(e.source) : 'Additional explanation (not stated in a retrieved passage)'}</span></div>`).join('');
    const given = (x.givens || []).length ? `<ul>${x.givens.map(g => `<li>${esc('\\(' + g.symbol + '\\)')} = ${esc(g.value)} ${esc(g.unit)}</li>`).join('')}</ul>` : '';
    const steps = (x.steps || []).length ? `<ol>${x.steps.map(t => `<li>${mathText(t)}</li>`).join('')}</ol>` : '';
    const ans = x.result ? `<b class="sv-ans">${esc(x.result.value)} ${esc(x.result.unit)}</b>` : '';
    const book = x.fromTextbook ? `<div class="sv-part"><h4>From the textbook</h4><p>${mathText(x.fromTextbook)}</p></div>` : '';
    const more = x.additionalExplanation ? `<div class="sv-part extra"><h4>Additional explanation</h4><p>${mathText(x.additionalExplanation)}</p></div>` : '';
    return `<div class="sv">${row('Given', given)}${row('Find', x.unknown ? mathText(x.unknown) : '')}${row('Assumptions', list(x.assumptions))}${row('Equation', eqs)}${row('Substitution', steps)}${row('Units', x.unitCheck ? mathText(x.unitCheck) : '')}${row('Answer', ans)}${row('Sanity check', x.sanityCheck ? mathText(x.sanityCheck) : '')}</div>${book}${more}${x.sourceNote ? `<div class="t-src"><div class="t-src-h">Sources</div><p>${mathText(x.sourceNote)}</p></div>` : ''}${retrievalHTML(r)}`;
  }
  function msgHTML(m, idx) {
    if (m.role === 'assistant' && m.solution && typeof m.solution === 'object') return `<div class="t-msg bot solve" data-i="${idx}"><div class="t-who">Problem solver</div><div class="t-body">${solutionHTML(m.solution, m.retrieval)}</div></div>`;
    if (m.role === 'user') return `<div class="t-msg user"><div class="t-who">You${m.where ? ` · ${esc(m.where)}` : ''}</div><div class="t-body">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
    let src = '';
    if ((m.passages || []).length) {
      src = `<details class="t-src"><summary>Sources retrieved from the textbook (${m.passages.length})</summary>${m.passages.map(x => `<div class="t-pass"><div class="t-pass-h">Retrieved passage <span>· ${esc(x.book)}${x.chapter ? ` · Ch ${x.chapter}` : ''}</span></div><p>${esc(x.excerpt)}</p></div>`).join('')}<div class="t-pass-note">Page number unavailable. This passage was retrieved as relevant context; it is not a sentence-by-sentence citation.</div></details>`;
    } else if ((m.sources || []).length) {
      src = `<div class="t-src"><div class="t-src-h">Sources</div><ol>${m.sources.map(s => `<li><span class="t-kind k-${s.kind}">${s.kind === 'book' ? 'Book' : 'Notes'}</span>${esc(s.label)}</li>`).join('')}</ol></div>`;
    } else if (m.retrieval && m.retrieval.status === 'failed') src = '<div class="t-src none" data-ret="failed"><b>Textbook search failed.</b> This answer is supplementary explanation, not taken from the textbook.</div>';
    else if (m.retrieval && m.retrieval.status === 'none') src = '<div class="t-src none" data-ret="none"><b>No relevant textbook passage found.</b> This answer is supplementary explanation; check it against your notes.</div>';
    else if (m.retrieval) src = '<div class="t-src none">No textbook sources for this answer.</div>';
    const canCheck = typeof idx === 'number' && m.retrieval && !/^#{0,4}\s*$/.test(m.content);
    return `<div class="t-msg bot" data-i="${idx}"><div class="t-who">Tutor</div><div class="t-body md">${md(m.content)}</div>${src}${canCheck ? checkHTML(m, idx) : ''}${typeof idx === 'number' && m.retrieval ? fbHTML(m, idx) : ''}</div>`;
  }
  // Answer feedback: stored only on this message in this browser (and in exports). Nothing is sent anywhere.
  const FB_REASONS = [['incorrect', 'Incorrect'], ['unclear', 'Unclear'], ['source', 'Wrong source'], ['units', 'Equation or units issue']];
  function fbHTML(m, idx) {
    const f = m.feedback || {}, r = f.rating;
    const b = (v, l) => `<button type="button" class="t-link t-fb-b" data-fb="${idx}" data-v="${v}" aria-pressed="${r === v}">${l}</button>`;
    const reasons = r === 'needs_work' ? `<div class="t-fb-r" role="group" aria-label="What was wrong? (optional)"><span>What was wrong? (optional)</span>${FB_REASONS.map(([k, l]) => `<button type="button" class="t-chip" data-fbr="${idx}" data-r="${k}" aria-pressed="${(f.reasons || []).includes(k)}">${l}</button>`).join('')}</div>` : '';
    return `<div class="t-fb" role="group" aria-label="Was this answer helpful?"><div class="t-fb-row"><span class="t-fb-q">${r ? 'Feedback saved in this browser' : 'Was this helpful?'}</span>${b('helpful', 'Helpful')}${b('needs_work', 'Needs improvement')}</div>${reasons}</div>`;
  }
  function setFeedback(idx, fn, focusSel) {
    const c = conv(), m = c.messages[idx]; if (!m || m.role !== 'assistant') return;
    const prev = m.feedback; m.feedback = fn(prev ? { ...prev, reasons: [...(prev.reasons || [])] } : null);
    if (!m.feedback) delete m.feedback;
    const okSave = store(c), log = document.getElementById('t-log'), top = log.scrollTop;
    if (okSave) { paintLog(); log.scrollTop = top; }
    const row = log.querySelector(`.t-msg[data-i="${idx}"] .t-fb`); if (!row) return;
    if (!okSave) row.insertAdjacentHTML('beforeend', '<div class="t-err" role="alert"><p>Couldn’t save your feedback: this browser’s storage is full or blocked. Nothing was changed.</p></div>');
    else { const f = row.querySelector(focusSel); if (f) f.focus({ preventScroll: true }); }
  }
  // 'Check my understanding': one question about this answer, with Hint / Reveal answer. Stored on the message.
  function checkHTML(m, idx) {
    const c = m.check;
    if (!c) return `<div class="t-check-row"><button class="t-link t-check-btn" data-check="${idx}">Check my understanding</button></div>`;
    return `<div class="t-check" role="group" aria-label="Check your understanding"><div class="t-check-h">Check your understanding</div>
      <div class="md t-check-q">${md(c.question)}</div>
      <div class="t-check-acts"><button class="t-link" data-hint="${idx}" aria-expanded="false" aria-controls="t-hint-${idx}">Hint</button><button class="t-link" data-reveal="${idx}" aria-expanded="false" aria-controls="t-ans-${idx}">Reveal answer</button></div>
      <div class="md t-check-hint" id="t-hint-${idx}" hidden><b>Hint:</b> ${md(c.hint)}</div>
      <div class="md t-check-ans" id="t-ans-${idx}" hidden><b>Answer:</b> ${md(c.answer)}</div></div>`;
  }
  async function runCheck(idx, btn) {
    const c = conv(), m = c.messages[idx];
    if (!m || m.role !== 'assistant' || ctx.busy) return;
    const card = cardAt(ctx.index);
    btn.disabled = true; btn.textContent = 'Writing a question…';
    const row = btn.parentElement; row.querySelectorAll('.t-err').forEach(x => x.remove());
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), window.__lsTutorTimeoutMs || 45000);
      let res, data;
      try { res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal, body: JSON.stringify({ bookId: ctx.book.id, chapterId: c.origin ? c.origin.chapter : ctx.ch.n, cardId: c.origin ? c.origin.cardId : card ? card.id : null, scope: effectiveScope(), conversationId: c.conversationId, mode: 'check', explanation: m.content.slice(0, 8000) }) }); }
      finally { clearTimeout(t); }
      try { data = await res.json(); } catch (e) { data = null; }
      const ch = data && data.check;
      if (!res.ok || !ch || ['question', 'hint', 'answer'].some(k => typeof ch[k] !== 'string' || !ch[k].trim())) throw new Error((data && data.error && data.error.message) || `The tutor service is unavailable (HTTP ${res.status}).`);
      const fresh = conv(); if (fresh.messages[idx] && fresh.messages[idx].content === m.content) { fresh.messages[idx].check = { question: ch.question, hint: ch.hint, answer: ch.answer }; store(fresh); }
      const log = document.getElementById('t-log'), top = log.scrollTop;
      paintLog(); log.scrollTop = top;
      const q = log.querySelector(`.t-msg[data-i="${idx}"] .t-check`); if (q) { q.scrollIntoView({ block: 'nearest' }); q.querySelector('[data-hint]').focus({ preventScroll: true }); }
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Check my understanding';
      const msg = e.name === 'AbortError' ? 'The request timed out.' : e.message === 'Failed to fetch' ? 'Could not reach the tutor service.' : e.message;
      row.insertAdjacentHTML('beforeend', `<div class="t-err" role="alert"><p>${esc(msg)}</p></div>`);
    }
  }
  function paintAll() { paintScope(); paintStyle(); paintLog(); paintCtx(); paintSaved(); }
  function paintSaved() {
    const l = document.getElementById('t-saved-list'), btn = document.getElementById('t-saved'); if (!l) return;
    const saved = conv().saved || [];
    btn.textContent = saved.length ? `Saved (${saved.length})` : 'Saved'; btn.disabled = !saved.length && l.hidden;
    if (l.hidden) return;
    l.innerHTML = saved.length ? `<div class="t-saved-h">Earlier conversations in this book</div><ul>${saved.map(x => {
      const q = (x.messages.find(m => m.role === 'user') || {}).content || 'Conversation', o = x.origin, when = (x.messages[x.messages.length - 1] || {}).at;
      return `<li><button class="t-saved-item" data-open="${esc(x.conversationId)}"><span class="t-saved-q">${esc(q.slice(0, 90))}</span><span class="t-saved-m">${o ? `Ch ${o.chapter} · ${esc(o.label)} · ${scopeLabel(o.scope)}` : 'Started before origins were saved'}${when ? ` · ${new Date(when).toLocaleDateString()}` : ''} · ${x.messages.length} messages</span></button></li>`;
    }).join('')}</ul>` : '<p class="t-saved-h">No earlier conversations yet.</p>';
  }
  // Suggested questions from the current page's context (generic ones without context). Clicking fills the box;
  // nothing is sent until you press Send.
  const SUGGEST = {
    reader: ['Explain this card in simpler words', 'Work a short numeric example with SI units'],
    quiz: ['Why is the correct answer right?', 'Which idea does this question test?'],
    'formula-notebook': ['When can I use this formula, and when not?', 'What does each symbol mean, with units?'],
    'calculation-workspace': ['What does each quantity in this equation mean?', 'Is my result physically reasonable?'],
    'guided-practice': ['Give me a hint for my current step, not the answer', 'Which assumptions does this example make?'],
    progress: ['What should I review next in this chapter?', 'Quiz me on a weak topic'],
    'study-sheets': ['Quiz me on the items in this sheet', 'How do these items connect?'],
  };
  function suggestHTML() {
    if (!ctx) return '';
    const p = pageInfo(), t = p && p.ctx && p.ctx.pageType;
    const list = SUGGEST[t] || ['Summarize the main ideas of this chapter', 'Explain a key equation of this chapter'];
    return `<div class="t-sugg" aria-label="Suggested questions">${list.map(x => `<button type="button" class="t-chip" data-suggest="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  }
  function paintLog(extra = '') {
    const log = document.getElementById('t-log'); if (!log) return;
    const c = conv();
    log.innerHTML = c.messages.length || extra
      ? c.messages.map((m, i) => msgHTML(m, i)).join('') + extra
      : `<div class="t-empty">${suggestHTML()}<p>Ask anything about what you're studying. Answers search this book's textbook and list the sources they cite.</p><p>Pick a scope and an answer style above, then type your question below.</p></div>`;
    renderMath(log);
    log.scrollTop = log.scrollHeight;
  }

  function solutionSummary(x) { // plain text kept as message content (tutor history, exports)
    return `Worked solution. Find: ${x.unknown || ''}. Answer: ${x.result ? x.result.value + ' ' + x.result.unit : ''}.`.slice(0, 2000);
  }
  async function solve() {
    const input = document.getElementById('t-input');
    const q = input.value.trim(); if (!q) { input.focus(); return; }
    if (q.length < 20) { paintLog('<div class="t-calm" role="status">Add a bit more detail: the numbers, units and what to find (at least 20 characters).</div>'); return; }
    const c = conv(), o = (c.messages.length && c.origin) || originNow();
    ctx.busy = true; setBusy(true); input.value = '';
    paintLog(msgHTML({ role: 'user', content: q, where: 'Problem' }) + '<div class="t-msg bot loading"><div class="t-who">Problem solver</div><div class="t-dots" aria-label="Working on the solution"><i></i><i></i><i></i></div></div>');
    let res, data;
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), window.__lsTutorTimeoutMs || 60000);
      try { res = await fetch('/api/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId: ctx.book.id, problem: q }), signal: ac.signal }); }
      finally { clearTimeout(t); }
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || !data.solution || typeof data.solution !== 'object') {
        const err = data && data.error;
        throw Object.assign(new Error(err && err.message || ''), { code: err && err.code, status: res.status, retryAfter: Number(res.headers.get('Retry-After')) || 0 });
      }
      const fresh = conv();
      if (!fresh.messages.length || !fresh.origin) fresh.origin = o;
      fresh.messages.push({ role: 'user', content: q, where: 'Problem', kind: 'solve', at: Date.now() }, { role: 'assistant', content: solutionSummary(data.solution), solution: data.solution, retrieval: data.retrieval && typeof data.retrieval === 'object' ? { status: data.retrieval.status, passages: (data.retrieval.passages || []).slice(0, 3) } : null, kind: 'solve', at: Date.now() });
      fresh.messages = fresh.messages.slice(-60); fresh.draft = '';
      store(fresh);
      ctx.busy = false; setBusy(false); paintAll();
    } catch (e) {
      ctx.busy = false; setBusy(false);
      input.value = q; const d = conv(); d.draft = q; store(d);
      let h, p;
      if (e.status === 429 || e.code === 'rate_limited') {
        const mins = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : 0;
        h = 'Solver limit reached'; p = `The problem solver has a small limit per minute and per day so it stays free to run. ${mins ? (mins >= 60 ? 'Try again tomorrow' : `Try again in about ${mins} minute${mins === 1 ? '' : 's'}`) : 'Try again a little later'}. You can still ask the tutor questions.`;
      } else if (e.status === 404 || e.status === 503 || e.code === 'not_found' || e.code === 'limiter_unavailable' || e.code === 'not_configured' || e.code === 'book_not_available') {
        h = 'Problem solver unavailable'; p = e.code === 'book_not_available' ? 'This book isn’t connected to the problem solver yet.' : 'The problem solver isn’t available right now. Your problem is kept in the box; the tutor still works.';
      } else {
        h = 'Couldn’t solve that one'; p = e.name === 'AbortError' ? 'The request timed out.' : e.message === 'Failed to fetch' ? 'Could not reach the server. Check your connection.' : (e.message || 'Something went wrong.');
      }
      paintLog(`<div class="t-calm" role="status"><b>${h}</b><p>${esc(p)}</p></div>`);
    }
  }
  async function send() {
    if (!ctx || ctx.busy || ctx.unavailable) return;
    if (ctx.solve) return solve();
    const input = document.getElementById('t-input');
    const q = input.value.trim(); if (!q) { input.focus(); return; }
    const c = conv(), o = (c.messages.length && c.origin) || originNow(), scope = o.scope;
    const where0 = [ctx.global ? pageLabel() : '', scope === 'book' ? 'Whole book' : scope === 'chapter' ? `Ch ${o.chapter}` : o.label].filter(Boolean).join(' · ');
    const style = getStyle();
    const styleLabel = style === 'default' ? '' : STYLES.find(x => x[0] === style)[1];
    const where = [where0, styleLabel].filter(Boolean).join(' · ');
    // Ids only: the server resolves book, chapter and card titles from its own data.
    const payload = {
      bookId: ctx.book.id, chapterId: o.chapter, cardId: o.cardId,
      conversationId: c.conversationId, scope, style, question: q,
      messages: c.messages.slice(-MAX_HISTORY).map(m => ({ role: m.role, content: m.content })),
    };
    const pc = pageContext(); if (pc) payload.pageContext = pc; // current at send time
    ctx.busy = true; setBusy(true);
    input.value = '';
    paintLog(msgHTML({ role: 'user', content: q, where }) + '<div class="t-msg bot loading"><div class="t-who">Tutor</div><div class="t-dots" aria-label="Generating answer"><i></i><i></i><i></i></div></div>');
    let res, data;
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), window.__lsTutorTimeoutMs || 45000);
      try { res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ac.signal }); }
      finally { clearTimeout(t); }
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || typeof data.answer !== 'string') {
        const err = data && data.error;
        throw Object.assign(new Error(err && err.message || `The tutor service is unavailable (HTTP ${res.status}).`), { code: err && err.code, reason: err && err.reason });
      }
      const fresh = conv(); // re-read in case another tab changed it
      if (!fresh.messages.length || !fresh.origin) fresh.origin = o;
      fresh.messages.push({ role: 'user', content: q, where, at: Date.now() }, { role: 'assistant', content: data.answer, sources: data.sources || [], passages: (data.passages || []).slice(0, 3), retrieval: data.retrieval || null, at: Date.now() });
      fresh.messages = fresh.messages.slice(-60);
      fresh.draft = '';
      store(fresh);
      ctx.busy = false; setBusy(false); paintAll();
    } catch (e) {
      ctx.busy = false; setBusy(false);
      // Keep the user's question: put it back in the box (and the saved draft) so nothing is lost.
      input.value = q; const d = conv(); d.draft = q; store(d);
      const net = e.name === 'TypeError' || e.message === 'Failed to fetch' || /NetworkError|Load failed/.test(e.message || '');
      const msg = e.name === 'AbortError' ? 'The request timed out. Your question is kept in the box.' : net ? 'Could not reach the tutor service. Check your connection; your question is kept in the box.' : e.message;
      if (e.code === 'book_not_available' || e.code === 'not_configured') { // the server says this book isn't connected: that's "unavailable", not an error
        paintLog(); return applyUnavailable(e.code);
      }
      paintLog(`<div class="t-err" role="alert"><b>${e.code === 'not_configured' ? 'Tutor not configured' : e.code === 'book_not_available' ? 'Tutor not available for this book yet' : e.code === 'rate_limited' ? (e.reason === 'minute' ? 'Minute limit reached' : e.reason === 'day' ? 'Daily limit reached' : e.reason === 'global' ? 'Tutor’s daily limit reached' : 'Too many requests') : e.code === 'limiter_unavailable' ? 'Tutor temporarily unavailable' : 'Couldn’t get an answer'}</b><p>${esc(msg)}</p><button class="t-retry" id="t-retry">Retry</button></div>`);
      document.getElementById('t-retry').addEventListener('click', send);
    }
  }
  function setBusy(b) {
    const s = document.getElementById('t-send'); if (s) { s.disabled = b || !!(ctx && ctx.unavailable); s.textContent = b ? (ctx && ctx.solve ? 'Solving…' : 'Thinking…') : (ctx && ctx.solve ? 'Solve' : 'Send'); }
    document.querySelectorAll('#t-new, #t-saved, #t-solve').forEach(x => { x.disabled = b; });
  }

  function toggle(force) {
    if (!ctx) return;
    const open = force === undefined ? !ctx.open : force;
    ctx.open = open;
    const panel = document.getElementById('tutor');
    const had = panel.contains(document.activeElement);
    panel.hidden = !open;
    if (ctx.global) document.body.classList.toggle('g-tutor-open', open); else ctx.reader.classList.toggle('with-tutor', open);
    if (open) paintCtx();
    document.querySelectorAll('#tutorBtn, [data-tutor-open]').forEach(b => { b.setAttribute('aria-expanded', String(open)); b.classList.toggle('on', open); });
    const btn = ctx.opener && document.contains(ctx.opener) ? ctx.opener : document.getElementById('tutorBtn');
    if (open) { paintLog(); document.getElementById('t-input').focus(); }
    else if (btn && had) btn.focus({ preventScroll: true }); // return focus to the opener
    else { const f = document.getElementById('feed'); if (f && !f.contains(document.activeElement)) f.focus({ preventScroll: true }); }
  }
  // 'Explain with tutor' from a practice question: a fresh conversation about that question, text filled in, not sent.
  function prepare(text, ch, index) {
    if (!ctx || ctx.busy) return;
    ctx.ch = ch; ctx.index = index;
    const c = conv();
    if (c.messages.length) store({ conversationId: newId(), messages: [], draft: text, scope: 'card', saved: archive(c) });
    else { c.draft = text; c.scope = 'card'; delete c.origin; store(c); }
    toggle(true);
    const input = document.getElementById('t-input'); input.value = text; paintAll(); input.focus(); input.setSelectionRange(text.length, text.length);
  }
  function setIndex(i, ch) { if (!ctx) return; if (ch) ctx.ch = ch; ctx.index = i; paintCtx(); paintScope(); }
  function unmount() { if (ctx && ctx.global) document.body.classList.remove('g-tutor-open'); ctx = null; }
  // Draft text from a page's "Ask tutor" button: filled in, never sent automatically. Keeps the current conversation.
  function draft(text) {
    if (!ctx || ctx.busy) return; toggle(true);
    const input = document.getElementById('t-input'); input.value = text; const c = conv(); c.draft = text; store(c); input.focus(); input.setSelectionRange(text.length, text.length);
  }
  function refresh() { if (ctx) { paintCtx(); paintScope(); const e = document.querySelector('#t-log .t-empty'); if (e && !ctx.busy) paintLog(); } } // the page's context changed (no API call)

  window.Tutor = { mount, toggle, setIndex, prepare, unmount, draft, refresh, setOpener: el => { if (ctx) ctx.opener = el; }, isGlobal: () => !!(ctx && ctx.global), bookId: () => ctx && ctx.book.id, pageContext: () => (ctx ? pageContext() : null), isOpen: () => !!(ctx && ctx.open), _md: md };
})();
