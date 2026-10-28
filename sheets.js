// Personal study sheets: an ordered pick of saved formulas, notes, bookmarks and difficult cards, grouped by
// book/chapter for viewing and printing. Stored in study.sheets (local; exported with the study data).
const Sheets = (() => {
  const all = () => state.sheets || (state.sheets = {});
  const KIND = { formula: 'Formula', note: 'My note', bookmark: 'Bookmarked', difficult: 'Difficult', calc: 'Calculation' };
  const key = it => it.t === 'formula' ? `formula:${it.ref}` : it.t === 'calc' ? `calc:${it.calc}:${it.solve}:${it.at}` : `${it.t}:${it.book}/${it.card}`;
  function cardAt(bookId, cardId) {
    const b = books[bookId], m = /^c(\d+)-(q?)(\d+)$/.exec(cardId || ''); if (!b || !m) return null;
    const ch = b.chapters.find(c => c.n === Number(m[1])); if (!ch || !ready(ch)) return null;
    const i = m[2] ? ch.cards.length + Number(m[3]) - 1 : Number(m[3]) - 1;
    return i >= 0 && i < screens(ch) ? { b, ch, i, card: i < ch.cards.length ? ch.cards[i] : null, quiz: i >= ch.cards.length ? ch.quiz[i - ch.cards.length] : null } : null;
  }
  // where an item lives (for grouping); null = no longer available
  function placeOf(it) {
    if (it.t === 'calc') { const f = typeof CalcCore !== 'undefined' && CalcCore.byId[it.calc]; return f && f.vars[it.solve] ? { book: 'heat-mass-transfer', ch: f.ch, calc: f } : null; }
    if (it.t === 'formula') { const f = (state.formulas || {})[it.ref]; if (!f) return null; return f.kind === 'custom' ? { book: '', ch: 0, f } : { book: f.book, ch: f.chapter, f }; }
    const c = cardAt(it.book, it.card); return c ? { book: it.book, ch: c.ch.n, c } : null;
  }
  // everything that could go on a sheet right now (optionally one book / chapter)
  function candidates(bookF, chF) {
    const out = [];
    for (const [ref, f] of Object.entries(state.formulas || {})) if ((!bookF || f.book === bookF) && (!chF || f.chapter === chF)) out.push({ t: 'formula', ref });
    for (const id of BOOK_IDS) {
      const bs = state.books[id]; if (!bs || !books[id] || (bookF && id !== bookF)) continue;
      for (const ch of books[id].chapters.filter(ready)) { if (chF && ch.n !== chF) continue; for (let i = 0; i < screens(ch); i++) {
        const cid = screenId(ch, i), m = (bs.marks || {})[cid] || {};
        if ((bs.notes || {})[cid]) out.push({ t: 'note', book: id, card: cid });
        if (m.b) out.push({ t: 'bookmark', book: id, card: cid });
        if (m.d) out.push({ t: 'difficult', book: id, card: cid });
      } }
    }
    return out;
  }
  const label = it => { const p = placeOf(it); if (!p) return 'No longer available'; if (it.t === 'formula') return p.f.title; if (it.t === 'calc') return `${p.calc.title}: ${p.calc.vars[it.solve].label.toLowerCase()}`; return stripTags(p.c.card ? p.c.card.h : `Practice ${p.c.i - p.c.ch.cards.length + 1}: ${p.c.quiz.q}`); };
  const where = it => { const p = placeOf(it); if (!p) return ''; if (!p.book) return 'Your formula'; return `${books[p.book].short} · Ch ${p.ch}`; };
  // ---- content of one item (shared by the page and the standalone export) ----
  function texHTML(t) { try { return window.katex ? katex.renderToString(t, { displayMode: true, throwOnError: true }) : `<code>${esc(t)}</code>`; } catch (e) { return `<div class="sh-err">This LaTeX can’t be displayed.</div><code>${esc(t)}</code>`; } }
  function itemBody(it) {
    const p = placeOf(it);
    if (!p) return `<p class="sh-gone">This ${it.t === 'formula' ? 'formula was deleted' : it.t === 'calc' ? 'calculator is no longer available' : 'card is no longer available'}. Remove it from the sheet.</p>`;
    if (it.t === 'calc') {
      const f = p.calc, v = f.vars, num = x => esc(CalcCore.fmt(x, 6));
      return `<div class="sh-eq">${texHTML(f.solve[it.solve].tex)}</div><ul class="sh-calc">${Object.entries(it.inputs).filter(([n]) => v[n]).map(([n, [x, u]]) => `<li>${esc(v[n].label)} \\(${v[n].sym}\\) = ${num(x)} ${esc(u)}</li>`).join('')}</ul><p class="sh-calc-r"><b>Result:</b> \\(${v[it.solve].sym}\\) = ${num(it.result[0])} ${esc(it.result[1])}</p><p class="f-tag">Calculated in LearnScroll with ${esc(f.ref)} (${esc(books['heat-mass-transfer'] ? books['heat-mass-transfer'].short : 'Heat and Mass Transfer')}).</p>`;
    }
    if (it.t === 'formula') {
      const f = p.f;
      return `<div class="sh-eq">${texHTML(f.tex)}</div>${f.notes ? `<div class="sh-mine"><span class="sh-lab">My note</span>${esc(f.notes).replace(/\n/g, '<br>')}</div>` : ''}`;
    }
    const c = p.c, bs = state.books[it.book] || {}, note = (bs.notes || {})[it.card];
    const src = c.card ? `<div class="sh-card"><span class="sh-lab">From the LearnScroll card</span><p>${c.card.t}</p>${c.card.eq ? `<div class="sh-eq">${texHTML(c.card.eq)}</div>` : ''}</div>`
      : `<div class="sh-card"><span class="sh-lab">Practice question</span><p>${c.quiz.q}</p><p><b>Answer:</b> ${c.quiz.options[c.quiz.answer]}</p></div>`;
    return src + (it.t === 'note' && note ? `<div class="sh-mine"><span class="sh-lab">My note</span>${esc(note.text).replace(/\n/g, '<br>')}</div>` : '');
  }
  // groups in order of first appearance; items keep the sheet order inside each group
  function groups(sheet) {
    const out = [], byKey = new Map();
    for (const it of sheet.items) {
      const p = placeOf(it), k = p ? `${p.book}/${p.ch}` : 'gone';
      if (!byKey.has(k)) { const g = { k, title: !p ? 'No longer available' : !p.book ? 'Your formulas' : `${books[p.book].short} · Ch ${p.ch}: ${(books[p.book].chapters.find(c => c.n === p.ch) || {}).title || ''}`, items: [] }; byKey.set(k, g); out.push(g); }
      byKey.get(k).items.push(it);
    }
    return out;
  }
  function sheetHTML(sheet) {
    return groups(sheet).map(g => `<section class="sh-group"><h2>${esc(g.title)}</h2>${g.items.map(it => `<article class="sh-item k-${it.t}"><div class="sh-h"><h3>${esc(label(it))}</h3><span class="sh-kind">${KIND[it.t]}</span></div>${itemBody(it)}</article>`).join('')}</section>`).join('');
  }
  // ---- pages ----
  let ui = {};
  function renderList() {
    document.title = 'Study sheets · LearnScroll';
    window.lsPageCtx = () => ({ label: '', ctx: { schemaVersion: 1, pageType: 'study-sheets', bookId: 'heat-mass-transfer', pageState: { items: Object.keys(all()).length } } });
    const ids = Object.keys(all()).sort((a, b) => all()[b].updated - all()[a].updated);
    app.innerHTML = `<main class="page shpage"><a class="back" href="#/">← Library</a>
      <div class="book-head"><div><h1>Study sheets</h1><p class="meta-line">Your own pick of saved formulas, notes, bookmarks and difficult cards, ready to print.</p></div></div>
      <div class="f-bar"><button class="btn ghost sm" id="sh-new">New study sheet</button></div>
      ${ids.length ? `<ol class="f-list">${ids.map(id => { const s = all()[id]; return `<li class="f-item"><div class="f-top"><h2><a href="#/sheets/${id}">${esc(s.title)}</a></h2><span class="f-tag">${plural(s.items.length, 'item')}</span></div></li>`; }).join('')}</ol>`
        : `<div class="marked-empty"><p>No study sheets yet.</p><p>Save formulas, notes, bookmarks or difficult cards while you read, then make a sheet from them.</p></div>`}</main>`;
    document.getElementById('sh-new').onclick = () => create();
  }
  function create(bookF, chF, viaUrl) {
    const now = Date.now(), id = `s-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const title = bookF ? `${books[bookF].short}${chF ? ` · Ch ${chF}` : ''} sheet` : 'My study sheet';
    all()[id] = { title, items: [], at: now, updated: now };
    if (!save()) { delete all()[id]; return alert('Couldn’t create the sheet: browser storage is full or disabled.'); }
    ui = { book: bookF || '', ch: chF || 0 };
    if (viaUrl) location.replace(`#/sheets/${id}`); else go(`#/sheets/${id}`); // a #/sheets/new link is replaced, so Back never re-creates a sheet
  }
  function commit(id, mut, focusSel) {
    const s = all()[id], before = JSON.stringify(s); mut(s); s.updated = Date.now();
    if (!save()) { all()[id] = JSON.parse(before); render(id); const m = document.getElementById('sh-msg'); if (m) m.textContent = 'Not saved: browser storage is full or disabled. Nothing changed.'; return; }
    render(id); if (focusSel) { const el = document.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
  }
  function render(id) {
    const s = all()[id]; if (!s) return renderMissing('That study sheet doesn’t exist (it may have been deleted).', '#/sheets', 'All study sheets');
    document.title = `${s.title} · LearnScroll`;
    window.lsPageCtx = () => { const sh = all()[id]; if (!sh) return null; const b = ui.book && books[ui.book] ? ui.book : 'heat-mass-transfer';
      return { label: sh.title.slice(0, 60), ctx: { schemaVersion: 1, pageType: 'study-sheets', bookId: b, chapterId: ui.ch || null, itemId: id, excerpt: sh.items.slice(0, 12).map(it => { try { return label(it); } catch (e) { return it.t; } }).join(' | '),
        pageState: { sheetTitle: sh.title, items: sh.items.length } } }; };
    const inSheet = new Set(s.items.map(key));
    const cands = candidates(ui.book || '', ui.ch || 0), bookOpts = BOOK_IDS.filter(b => books[b]);
    const chOpts = ui.book ? books[ui.book].chapters.filter(ready) : [];
    app.innerHTML = `<main class="page shpage"><a class="back" href="#/sheets">← Study sheets</a>
      <div class="sh-head"><label class="sr" for="sh-title">Sheet title</label><input id="sh-title" class="sh-title" maxlength="200" value="${esc(s.title)}">
        <span class="sh-tools"><button class="btn ghost sm" id="sh-print">Print / Save as PDF</button><button class="btn ghost sm" id="sh-html">Download HTML</button><button class="t-link" id="sh-del">Delete sheet</button></span></div>
      <div class="f-msg" id="sh-msg" role="status"></div>
      <div class="sh-cols">
        <section class="sh-pick" aria-labelledby="sh-pick-h"><h2 id="sh-pick-h">Add to this sheet</h2>
          <div class="f-bar"><label class="sr" for="sh-book">Book</label><select id="sh-book"><option value="">All books</option>${bookOpts.map(b => `<option value="${b}"${ui.book === b ? ' selected' : ''}>${esc(books[b].short)}</option>`).join('')}</select>
          ${ui.book ? `<label class="sr" for="sh-ch">Chapter</label><select id="sh-ch"><option value="0">All chapters</option>${chOpts.map(c => `<option value="${c.n}"${ui.ch === c.n ? ' selected' : ''}>Ch ${c.n}</option>`).join('')}</select>` : ''}</div>
          ${cands.length ? `<ul class="sh-cands">${cands.map(it => { const k = key(it), on = inSheet.has(k); return `<li><label><input type="checkbox" data-add="${esc(JSON.stringify(it))}"${on ? ' checked' : ''}> <span class="sh-kind">${KIND[it.t]}</span> ${esc(label(it))} <span class="f-tag">${esc(where(it))}</span></label></li>`; }).join('')}</ul>`
            : `<p class="f-tag">Nothing saved${ui.book ? ' here' : ''} yet. Save formulas, add notes, or bookmark or mark cards difficult in the reader.</p>`}
        </section>
        <section class="sh-order" aria-labelledby="sh-order-h"><h2 id="sh-order-h">On the sheet (${s.items.length})</h2>
          ${s.items.length ? `<ol class="sh-items">${s.items.map((it, i) => `<li><span class="sh-kind">${KIND[it.t]}</span><span class="sh-name">${esc(label(it))} <span class="f-tag">${esc(where(it))}</span></span><span class="sh-btns"><button class="t-link" data-up="${i}" aria-label="Move ${esc(label(it))} up"${i ? '' : ' disabled'}>↑</button><button class="t-link" data-down="${i}" aria-label="Move ${esc(label(it))} down"${i < s.items.length - 1 ? '' : ' disabled'}>↓</button><button class="t-link" data-rm="${i}" aria-label="Remove ${esc(label(it))}">Remove</button></span></li>`).join('')}</ol>` : '<p class="f-tag">Tick items on the left to add them.</p>'}
        </section></div>
      <h2 class="sh-prev-h">Preview</h2>
      <div class="sheet" id="sheet"><h1 class="sh-print-title">${esc(s.title)}</h1>${s.items.length ? sheetHTML(s) : '<p class="f-tag">The sheet is empty.</p>'}</div></main>`;
    renderMath(document.getElementById('sheet'));
    const t = document.getElementById('sh-title');
    t.addEventListener('change', () => { const v = t.value.trim(); if (!v) { t.value = s.title; return; } commit(id, x => { x.title = v; }, '#sh-title'); });
    document.getElementById('sh-book').onchange = e => { ui = { book: e.target.value, ch: 0 }; render(id); document.getElementById('sh-book').focus(); };
    const chs = document.getElementById('sh-ch'); if (chs) chs.onchange = e => { ui.ch = Number(e.target.value); render(id); document.getElementById('sh-ch').focus(); };
    document.getElementById('sh-print').onclick = () => window.print();
    document.getElementById('sh-html').onclick = () => exportHTML(s);
    const del = document.getElementById('sh-del');
    del.onclick = () => { if (del.dataset.armed) { const old = all()[id]; delete all()[id]; if (!save()) { all()[id] = old; document.getElementById('sh-msg').textContent = 'Couldn’t delete: browser storage unavailable.'; return; } go('#/sheets'); } else { del.dataset.armed = '1'; del.textContent = 'Press again to delete this sheet'; del.classList.add('danger'); } };
    app.querySelector('.sh-cols').addEventListener('change', e => {
      const cb = e.target.closest('[data-add]'); if (!cb) return; const it = JSON.parse(cb.dataset.add), k = key(it);
      commit(id, x => { if (cb.checked) { if (!x.items.some(y => key(y) === k)) x.items.push(it); } else x.items = x.items.filter(y => key(y) !== k); }, `[data-add="${CSS.escape(cb.dataset.add)}"]`);
    });
    app.querySelector('.sh-cols').addEventListener('click', e => {
      const b = e.target.closest('[data-up],[data-down],[data-rm]'); if (!b) return;
      const i = Number(b.dataset.up ?? b.dataset.down ?? b.dataset.rm);
      if (b.dataset.rm !== undefined) return commit(id, x => { x.items.splice(i, 1); }, `[data-rm="${Math.min(i, s.items.length - 2)}"]`);
      const j = b.dataset.up !== undefined ? i - 1 : i + 1;
      commit(id, x => { [x.items[i], x.items[j]] = [x.items[j], x.items[i]]; }, `[data-${b.dataset.up !== undefined ? 'up' : 'down'}="${j}"]`);
    });
  }
  // Standalone file: equations are pre-rendered with KaTeX here; the file links KaTeX's CSS/fonts from jsDelivr.
  function exportHTML(s) {
    const box = document.createElement('div'); box.innerHTML = sheetHTML(s); renderMath(box);
    const css = `body{font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 20px}h1{font-size:24px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}h3{font-size:15px;margin:0}.sh-item{margin:12px 0;padding:10px 12px;border:1px solid #ddd;border-radius:6px;break-inside:avoid}.sh-h{display:flex;justify-content:space-between;gap:12px}.sh-kind,.sh-lab{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666}.sh-lab{display:block}.sh-mine{margin-top:8px;padding:6px 10px;border-left:3px solid #2e7d32;background:#f3f8f3}.sh-card p{margin:4px 0}.sh-eq{overflow-x:auto}.katex-display{margin:.6em 0}@media print{.sh-eq{overflow:visible}.katex-display>.katex{white-space:normal}}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>${css}</style></head><body><h1>${esc(s.title)}</h1><p class="sh-lab">LearnScroll study sheet · ${new Date().toLocaleDateString()} · equations pre-rendered; their fonts load from cdn.jsdelivr.net</p>${box.innerHTML}</body></html>`;
    download(`${s.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'study-sheet'}.html`, html, 'text/html');
  }
  // Calculation workspace hook: append a result to a sheet (validated like everything else in studydata).
  function addCalc(sheetId, item) {
    let id = sheetId, created = false;
    if (!id || !all()[id]) { const now = Date.now(); id = `s-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`; all()[id] = { title: 'Calculations', items: [], at: now, updated: now }; created = true; }
    const s = all()[id], before = JSON.stringify(s), undo = () => { if (created) delete all()[id]; else all()[id] = JSON.parse(before); };
    try { StudyData.validSheet({ ...s, items: [...s.items, item] }, id, BOOK_IDS); } catch (e) { undo(); return { ok: false, error: e.message }; }
    s.items.push(item); s.updated = Date.now();
    if (!save()) { undo(); return { ok: false, error: 'Not saved: browser storage is full or disabled.' }; }
    return { ok: true, id, title: s.title };
  }
  const list = () => Object.keys(all()).sort((a, b) => all()[b].updated - all()[a].updated).map(id => ({ id, title: all()[id].title }));
  return { addCalc, list, route: parts => { if (parts[1] === 'new') return create(parts[2] && books[parts[2]] ? parts[2] : '', Number(parts[3]) || 0, true); if (parts[1]) return render(parts[1]); renderList(); }, count: () => Object.keys(all()).length };
})();
