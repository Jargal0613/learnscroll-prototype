// Formula notebook: equations saved from cards plus the student's own formulas. Stored in study.formulas (schema 3),
// exported/imported with the rest of the study data. Symbol meanings come only from the card's own text; nothing
// is invented or stored separately.
const Formulas = (() => {
  const all = () => state.formulas || (state.formulas = {});
  const cardFid = (bookId, cardId) => `f-${bookId}-${cardId}`;
  const norm = t => String(t).replace(/\s+/g, '');
  function cardOf(f) { // live lookup of the source card; null if that book/card no longer exists
    const b = books[f.book]; if (!b) return null;
    const ch = b.chapters.find(c => c.n === f.chapter); if (!ch || !ready(ch)) return null;
    const m = /^c\d+-(\d+)$/.exec(f.card); const i = m ? Number(m[1]) - 1 : -1;
    return i >= 0 && i < ch.cards.length ? { b, ch, i, c: ch.cards[i] } : null;
  }
  function tex(t) {
    if (!window.katex) return `<div class="f-err" role="note">The equation renderer didn’t load, so the LaTeX is shown as text.</div><code class="f-src">${esc(t)}</code>`;
    try { return `<div class="f-eq">${katex.renderToString(t, { displayMode: true, throwOnError: true })}</div>`; }
    catch (e) { return `<div class="f-err" role="note">This LaTeX can’t be displayed: ${esc(String(e.message || e).replace(/^KaTeX parse error:\s*/, ''))}</div><code class="f-src">${esc(t)}</code>`; }
  }
  // ---- reader: one "Save formula" control under each card equation ----
  const saveBtn = (id, extra = '') => `<div class="eq-act"><button class="t-link f-save" data-fsave="${id}">Save formula</button>${extra}</div>`;
  function paint(root, book) {
    root.querySelectorAll('.f-save').forEach(b => {
      const on = !!all()[cardFid(book.id, b.dataset.fsave)];
      b.textContent = on ? 'In formula notebook ↗' : 'Save formula';
      b.title = on ? 'Already saved. Open it in the formula notebook' : 'Save this equation to your formula notebook';
      b.classList.toggle('on', on);
    });
  }
  function fromCard(book, ch, cardId, btn) {
    const fid = cardFid(book.id, cardId);
    if (all()[fid]) return go(`#/formulas/${fid}`); // already saved: never a second copy
    const i = Number(cardId.split('-')[1]) - 1, c = ch.cards[i]; if (!c || !c.eq) return;
    const now = Date.now(), h = stripTags(c.h);
    all()[fid] = { kind: 'card', title: h, tex: c.eq, book: book.id, chapter: ch.n, card: cardId, heading: h, at: now, updated: now };
    if (!save()) { delete all()[fid]; btn.textContent = 'Not saved: browser storage unavailable'; return; }
    paint(btn.closest('.feed') || document, book);
    btn.focus({ preventScroll: true });
  }
  // ---- notebook page ----
  let ui = { q: '', book: '', edit: null, del: null, dupOk: null, focus: null, msg: '' };
  function list() {
    const order = id => { const f = all()[id]; if (f.kind === 'custom') return [1e9, f.at]; const bi = BOOK_IDS.indexOf(f.book); const n = Number((/-(\d+)$/.exec(f.card) || [0, 0])[1]); return [bi * 1e6 + f.chapter * 1e3 + n, 0]; };
    return Object.keys(all()).sort((a, b) => { const x = order(a), y = order(b); return x[0] - y[0] || x[1] - y[1] || (a < b ? -1 : 1); });
  }
  function matches(id) {
    const f = all()[id];
    if (ui.book && (ui.book === 'custom' ? f.kind !== 'custom' : f.book !== ui.book)) return false;
    const words = ui.q.toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
    const src = f.kind === 'card' ? cardOf(f) : null;
    const hay = [f.title, f.tex, f.notes, f.heading, src && stripTags(src.c.t), src && src.ch.title, src && src.b.short].filter(Boolean).join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  }
  function itemHTML(id) {
    const f = all()[id], src = f.kind === 'card' ? cardOf(f) : null;
    const where = f.kind === 'custom' ? '<span class="f-tag">Your formula</span>' : src
      ? `<a class="f-src-link" href="#/read/${f.book}/${f.chapter}/${src.i + 1}">${esc(src.b.short)} · Ch ${f.chapter} · ${esc(stripTags(src.c.h))} →</a>`
      : `<span class="f-tag">Source card no longer available (${esc(f.book)} · Ch ${f.chapter})</span>`;
    if (ui.edit === id) return `<li class="f-item editing" id="${id}">${editorHTML(f)}</li>`;
    return `<li class="f-item${ui.focus === id ? ' hl' : ''}" id="${id}"><div class="f-top"><h2>${esc(f.title)}</h2><span class="f-acts">${ui.del === id
      ? `<span class="f-confirm">Delete this formula?</span><button class="t-link danger" data-fdel-yes="${id}">Delete</button><button class="t-link" data-fdel-no>Keep</button>`
      : `<button class="t-link" data-fedit="${id}">Edit</button><button class="t-link" data-fdel="${id}">Delete</button>`}</span></div>
      <div class="f-where">${where}</div>${tex(f.tex)}${f.kind === 'card' && src && Calc.linksFor(f.book, f.card) ? `<div class="f-calc">${Calc.linksFor(f.book, f.card)}</div>` : ''}
      ${src ? `<div class="f-card"><span class="f-lab">Card text (symbols and units as the card states them)</span><p>${src.c.t}</p></div>` : ''}
      ${f.notes ? `<div class="f-notes"><span class="f-lab">Your notes</span><p>${esc(f.notes).replace(/\n/g, '<br>')}</p></div>` : ''}</li>`;
  }
  function editorHTML(f) {
    const custom = !f || f.kind === 'custom';
    return `<form class="f-form" id="f-form" novalidate><h2>${f ? 'Edit formula' : 'New formula'}</h2>
      <label>Title<input id="f-title" maxlength="200" value="${esc(f ? f.title : '')}" required></label>
      ${custom ? `<label>LaTeX<textarea id="f-tex" rows="3" maxlength="2000" spellcheck="false" placeholder="e.g. q = h\\,(T_s - T_\\infty)" required>${esc(f ? f.tex : '')}</textarea></label>` : `<p class="f-lock">The equation comes from the card and can’t be edited here.</p>`}
      <div class="f-prev" id="f-prev" aria-live="polite">${f || custom ? (f ? tex(f.tex) : '') : ''}</div>
      <label>Notes (optional)<textarea id="f-notes" rows="3" maxlength="4000">${esc((f && f.notes) || '')}</textarea></label>
      <div class="f-msg" id="f-msg" role="alert">${esc(ui.msg)}</div>
      <div class="btns"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" id="f-cancel">Cancel</button></div></form>`;
  }
  function render(focusId) {
    document.title = 'Formula notebook · LearnScroll';
    if (focusId && all()[focusId]) ui.focus = focusId;
    const ids = list(), shown = ids.filter(matches);
    const bookOpts = BOOK_IDS.filter(id => books[id] && ids.some(x => all()[x].book === id));
    app.innerHTML = `<main class="page fpage"><a class="back" href="#/">← Library</a>
      <div class="book-head"><div><h1>Formula notebook</h1><p class="meta-line">${plural(ids.length, 'formula')} · saved in this browser</p></div></div>
      <div class="f-bar"><label class="sr" for="f-q">Search formulas</label><input id="f-q" type="search" placeholder="Search by title, symbol or concept" value="${esc(ui.q)}" autocomplete="off">
        <label class="sr" for="f-book">Book</label><select id="f-book"><option value="">All books</option>${bookOpts.map(id => `<option value="${id}"${ui.book === id ? ' selected' : ''}>${esc(books[id].short)}</option>`).join('')}<option value="custom"${ui.book === 'custom' ? ' selected' : ''}>Your formulas</option></select>
        <button class="btn ghost sm" id="f-new">New formula</button><a class="t-link c-ws" href="#/calc">Calculation workspace →</a></div>
      ${ui.edit === 'new' ? `<div class="f-item editing">${editorHTML(null)}</div>` : ''}
      ${!ids.length ? `<div class="marked-empty"><p>No formulas saved yet.</p><p>In the reader, use <b>Save formula</b> under a card’s equation, or add your own with <b>New formula</b>.</p></div>`
        : !shown.length ? `<div class="marked-empty"><p>No formulas match${ui.q ? ` “${esc(ui.q)}”` : ''}${ui.book ? ' in this book' : ''}.</p></div>`
        : `<ol class="f-list">${shown.map(itemHTML).join('')}</ol>`}</main>`;
    wire(); renderMath(app.querySelector('.f-list') || app);
    const target = ui.edit ? document.getElementById('f-title') : ui.focus && document.getElementById(ui.focus);
    if (target) { target.scrollIntoView({ block: 'center' }); if (ui.edit) target.focus(); }
  }
  function wire() {
    const q = document.getElementById('f-q');
    q.addEventListener('input', () => { ui.q = q.value; const pos = q.selectionStart; render(); const n = document.getElementById('f-q'); n.focus(); n.setSelectionRange(pos, pos); });
    document.getElementById('f-book').addEventListener('change', e => { ui.book = e.target.value; render(); document.getElementById('f-book').focus(); });
    document.getElementById('f-new').addEventListener('click', () => { ui = { ...ui, edit: 'new', del: null, msg: '', dupOk: null }; render(); });
    app.querySelector('.fpage').addEventListener('click', e => {
      const t = e.target.closest('[data-fedit],[data-fdel],[data-fdel-yes],[data-fdel-no]'); if (!t) return;
      if (t.dataset.fedit) { ui = { ...ui, edit: t.dataset.fedit, del: null, msg: '', dupOk: null }; return render(); }
      if (t.dataset.fdel) { ui.del = t.dataset.fdel; render(); return document.querySelector('[data-fdel-no]').focus(); }
      if (t.dataset.fdelYes) { const id = t.dataset.fdelYes, old = all()[id]; delete all()[id]; if (!save()) { all()[id] = old; alertMsg('Couldn’t delete: browser storage unavailable. Nothing changed.'); return; } ui.del = null; render(); return document.getElementById('f-new').focus(); }
      if (t.dataset.fdelNo !== undefined) { const id = ui.del; ui.del = null; render(); const b = document.querySelector(`[data-fdel="${id}"]`); if (b) b.focus(); }
    });
    const form = document.getElementById('f-form'); if (!form) return;
    const texEl = document.getElementById('f-tex'), prev = document.getElementById('f-prev');
    if (texEl) texEl.addEventListener('input', () => { prev.innerHTML = texEl.value.trim() ? tex(texEl.value) : ''; ui.dupOk = null; });
    document.getElementById('f-cancel').addEventListener('click', () => { const id = ui.edit; ui.edit = null; ui.msg = ''; render(); const b = id && document.querySelector(`[data-fedit="${id}"]`); (b || document.getElementById('f-new')).focus(); });
    form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); document.getElementById('f-cancel').click(); } });
    form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  }
  function alertMsg(m) { const el = document.getElementById('f-msg'); if (el) el.textContent = m; else { ui.msg = m; render(); } }
  function submit() {
    const id = ui.edit === 'new' ? null : ui.edit, old = id ? all()[id] : null;
    const title = document.getElementById('f-title').value.trim(), notes = document.getElementById('f-notes').value.replace(/\s+$/, '');
    const texv = old && old.kind === 'card' ? old.tex : document.getElementById('f-tex').value.trim();
    if (!title) return alertMsg('Add a title.');
    if (!texv) return alertMsg('Add the formula in LaTeX.');
    if (texv.length > 2000) return alertMsg('The LaTeX is too long (max 2000 characters).');
    // Duplicates: a formula whose LaTeX matches one already saved needs a second Save, so copies are never made by accident.
    const dup = Object.entries(all()).find(([k, f]) => k !== id && norm(f.tex) === norm(texv));
    if (dup && (!old || norm(old.tex) !== norm(texv)) && ui.dupOk !== norm(texv)) { ui.dupOk = norm(texv); return alertMsg(`“${dup[1].title}” already has the same LaTeX. Press Save again to keep both.`); }
    const now = Date.now(), nid = id || `fc-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const next = old ? { ...old, title, tex: texv, updated: now } : { kind: 'custom', title, tex: texv, at: now, updated: now };
    if (notes.trim()) next.notes = notes; else delete next.notes;
    all()[nid] = next;
    if (!save()) { if (old) all()[nid] = old; else delete all()[nid]; return alertMsg('Not saved: browser storage is full or disabled. Your text is still in the form.'); }
    ui = { ...ui, edit: null, msg: '', dupOk: null, focus: nid }; render();
    const b = document.querySelector(`[data-fedit="${nid}"]`); if (b) b.focus({ preventScroll: true });
  }
  function count() { return Object.keys(all()).length; }
  return { saveBtn, paint, fromCard, render: id => { ui.edit = null; ui.del = null; ui.msg = ''; ui.focus = null; render(id); }, count, cardFid };
})();
