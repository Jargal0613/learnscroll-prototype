// "My textbook": B opens their own Heat & Mass Transfer PDF from their device. The file is kept ONLY in this browser
// (IndexedDB) and shown with the browser's built-in PDF viewer; it is never uploaded or sent anywhere, and the repo
// holds no textbook text or images — only the page-number map in hmtpages.js. The page sits beside the existing
// LearnScroll cards for that section. Reading position, sections read and bookmarks (with notes) live in
// study.reading['heat-mass-transfer'] and export/import with the rest of the study data. No tutor or network calls.
const Textbook = (() => {
  const BOOK = 'heat-mass-transfer', DB = 'learnscroll-textbook', STORE = 'files', PREFS = 'ls-textbook-prefs';
  const P = typeof HMT_PAGES !== 'undefined' ? HMT_PAGES : null;
  const DASH = '\u2013';
  // ---- section list: verified start pages; titles are LearnScroll's own (first card heading), never the book's ----
  const keyOfCard = (c, chN) => (c.s === 'Topic' ? `${chN}-topic` : String(c.s).replace(DASH, '-'));
  const label = k => k.replace(/^(\d+)-(\d+)$/, `$1${DASH}$2`).replace(/^(\d+)-topic$/, 'Topic of special interest').replace(/^(\d+)-summary$/, 'Chapter summary');
  function sections() {
    if (!P) return [];
    const book = books[BOOK], out = [];
    for (const [k, page] of Object.entries(P.sections)) {
      const chN = Number(k.split('-')[0]), ch = book && book.chapters.find(c => c.n === chN);
      const cards = ch && ready(ch) ? ch.cards.map((c, i) => ({ c, i })).filter(x => keyOfCard(x.c, chN) === k) : [];
      out.push({ key: k, ch: chN, page, label: label(k), title: cards.length ? stripTags(cards[0].c.h) : '', cards, chTitle: ch ? ch.title : `Chapter ${chN}` });
    }
    return out.sort((a, b) => a.ch - b.ch || a.page - b.page);
  }
  const pageFor = key => (P && P.sections[key]) || null;
  const linkForCard = (c, chN) => { const k = keyOfCard(c, chN), p = pageFor(k); return p ? { key: k, page: p, href: `#/text/${BOOK}/${k}` } : null; };
  // ---- IndexedDB (the PDF never leaves the browser) ----
  const open = () => new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no-idb')); const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); }; }); };
  const getFile = () => tx('readonly', s => s.get(BOOK)).catch(() => null);
  const putFile = rec => tx('readwrite', s => s.put(rec, BOOK));
  const delFile = () => tx('readwrite', s => s.delete(BOOK));
  async function sha256(buf) { if (!crypto.subtle) return ''; const h = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } };
  const setPrefs = p => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) {} };
  const offsetFor = rec => { const p = prefs(); if (rec && rec.sha256 && p.offsets && Number.isInteger(p.offsets[rec.sha256])) return p.offsets[rec.sha256]; return rec && P && rec.sha256 === P.verifiedFile.sha256 ? P.verifiedFile.pdfOffset : (P ? P.verifiedFile.pdfOffset : 0); };
  // ---- reading state (same shape as the reading books) ----
  const rs = () => (state.reading && state.reading[BOOK]) || null;
  function update(fn) { const cur = rs() || { section: null, at: 0 }, next = fn(JSON.parse(JSON.stringify(cur))); if (!next.section) return; state.reading = { ...(state.reading || {}), [BOOK]: next }; save(); }
  let url = null, cleanupFns = [];
  function stop() { cleanupFns.forEach(f => f()); cleanupFns = []; document.body.classList.remove('tb-nav-open'); }

  function sideHTML(all, r, cur) {
    const chs = [...new Set(all.map(s => s.ch))];
    const marks = (r && r.marks) || [];
    return `<nav class="tb-side" id="tb-side" aria-label="Textbook contents"><button class="btn ghost sm tb-close" id="tb-close">Close</button>
      ${marks.length ? `<div class="tb-marks tp-marks"><h2>Bookmarks</h2><ul>${marks.map((m, i) => `<li><a href="#/text/${BOOK}/${m.section}">${esc(label(m.section))} · p. ${pageFor(m.section) || '?'}</a><button class="t-link" data-unmark="${i}">Remove</button><label class="sr" for="tp-note-${i}">Note</label><textarea id="tp-note-${i}" data-note="${i}" rows="2" maxlength="1000" placeholder="Note…">${esc(m.note || '')}</textarea></li>`).join('')}</ul></div>` : ''}
      <ol>${chs.map(n => `<li><div class="tb-ch"><span>${n}</span>${esc(all.find(s => s.ch === n).chTitle)}</div><ol>${all.filter(s => s.ch === n).map(s => `<li><a href="#/text/${BOOK}/${s.key}" class="${r && r.done && r.done[s.key] ? 'st-done' : r && r.section === s.key ? 'st-reading' : ''}"${s.key === cur ? ' aria-current="true"' : ''}><span class="tb-n">${esc(s.label.length < 6 ? s.label : '')}</span><span>${esc(s.label.length < 6 ? (s.title || 'Section ' + s.label) : s.label)} <em class="tp-pg">p. ${s.page}</em></span><i aria-hidden="true"></i></a></li>`).join('')}</ol></li>`).join('')}</ol></nav>`;
  }
  function cardsHTML(s) {
    if (!s.cards.length) return `<p class="tp-none">LearnScroll has no study cards for this part of the book yet.</p>`;
    return s.cards.map(({ c, i }) => `<article class="tp-card"><div class="sec"><span>${esc(c.s)}</span></div><h3>${esc(stripTags(c.h))}</h3><p>${c.t}</p>${c.eq ? `<div class="eq" data-eq="${esc(c.eq)}"></div>` : ''}<a class="t-link" href="#/read/${BOOK}/${s.ch}/${i + 1}" data-card="c${s.ch}-${i + 1}">Open card ${s.ch}.${i + 1} →</a></article>`).join('');
  }
  async function render(key) {
    stop();
    if (!P || !books[BOOK]) return renderMissing('The textbook viewer couldn’t be loaded.', '#/', 'Library');
    const all = sections();
    const r0 = rs();
    if (!key) key = (r0 && pageFor(r0.section) && r0.section) || all[0].key;
    const i = all.findIndex(s => s.key === key);
    if (i < 0) return renderMissing('That section isn’t in the page map.', `#/text/${BOOK}`, 'Back to the textbook');
    const s = all[i], prev = all[i - 1], next = all[i + 1];
    document.title = `${s.label} · My textbook · Heat & Mass`;
    update(x => ({ ...x, section: key, at: Date.now() }));
    const r = rs(), marked = ((r && r.marks) || []).some(m => m.section === key), read = !!(r && r.done && r.done[key]);
    const done = r && r.done ? Object.keys(r.done).filter(k => pageFor(k)).length : 0;
    app.innerHTML = `<main class="page tbpage tbread tppage"><div class="tb-bar"><a class="back" href="#/book/${BOOK}">← Study tools</a><button class="t-link tb-menu" id="tb-menu" aria-controls="tb-side" aria-expanded="false">Sections</button>
        <strong class="tp-title">My textbook · ${esc(s.label)}${s.title ? ' · ' + esc(s.title) : ''}</strong>
        <span class="tb-prog" id="tb-prog">${done} of ${all.length} sections read</span><button class="btn ghost sm" id="tp-read" aria-pressed="${read}">${read ? 'Read ✓' : 'Mark read'}</button><button class="btn ghost sm" id="tb-mark" aria-pressed="${marked}">${marked ? 'Bookmarked' : 'Bookmark'}</button></div>
      <div class="tb-layout tp-layout">${sideHTML(all, r, key)}
        <section class="tp-page" aria-label="Textbook page"><div class="tp-where">Chapter ${s.ch}: ${esc(s.chTitle)} · starts on printed page <b id="tp-pno">${s.page}</b></div><div id="tp-view" class="tp-view"></div>
          <nav class="tb-nav" aria-label="Previous and next section">${prev ? `<a class="btn ghost" id="tb-prev" rel="prev" href="#/text/${BOOK}/${prev.key}">← ${esc(prev.label)}</a>` : '<span class="f-tag">Start of chapter 1</span>'}${next ? `<a class="btn ghost" id="tb-next" rel="next" href="#/text/${BOOK}/${next.key}">${esc(next.label)} →</a>` : '<span class="f-tag">End of chapter 5</span>'}</nav></section>
        <aside class="tp-cards" aria-label="LearnScroll cards for this section"><h2>Your study cards · ${esc(s.label)}</h2>${cardsHTML(s)}</aside></div></main>`;
    renderMath(app.querySelector('.tp-cards'));
    await showFile(s);
    const side = document.getElementById('tb-side'), menu = document.getElementById('tb-menu');
    menu.onclick = () => { const o = !document.body.classList.contains('tb-nav-open'); document.body.classList.toggle('tb-nav-open', o); menu.setAttribute('aria-expanded', String(o)); };
    side.addEventListener('click', e => {
      if (e.target.closest('a, #tb-close')) { document.body.classList.remove('tb-nav-open'); menu.setAttribute('aria-expanded', 'false'); }
      const u = e.target.closest('[data-unmark]'); if (u) { update(x => { x.marks.splice(Number(u.dataset.unmark), 1); if (!x.marks.length) delete x.marks; return x; }); render(key); }
    });
    side.addEventListener('change', e => { const t = e.target.closest('[data-note]'); if (!t) return; update(x => { const m = x.marks[Number(t.dataset.note)]; if (m) { if (t.value.trim()) m.note = t.value.slice(0, 1000); else delete m.note; } return x; }); });
    document.getElementById('tb-mark').onclick = () => { update(x => { const ms = x.marks || [], k = ms.findIndex(m => m.section === key); if (k >= 0) ms.splice(k, 1); else ms.push({ section: key, at: Date.now() }); if (ms.length) x.marks = ms; else delete x.marks; return x; }); render(key); };
    document.getElementById('tp-read').onclick = () => { update(x => { const d = x.done || {}; if (d[key]) delete d[key]; else d[key] = Date.now(); if (Object.keys(d).length) x.done = d; else delete x.done; return x; }); render(key); };
    const onKey = e => { if (e.target.closest('input,textarea,select') || e.altKey || e.ctrlKey || e.metaKey) return; if (e.key === 'Escape') document.body.classList.remove('tb-nav-open'); if (e.key === 'ArrowLeft' && prev) location.hash = `#/text/${BOOK}/${prev.key}`; if (e.key === 'ArrowRight' && next) location.hash = `#/text/${BOOK}/${next.key}`; };
    document.addEventListener('keydown', onKey); cleanupFns.push(() => document.removeEventListener('keydown', onKey));
    window.scrollTo(0, 0);
    cleanup = stop;
  }
  async function showFile(s) {
    let view = document.getElementById('tp-view'); if (!view) return;
    const rec = await getFile();
    if (!view.isConnected) return; // navigated away while reading IndexedDB
    if (!rec || !rec.blob) {
      view.innerHTML = `<div class="tp-open"><h2>Open your copy of the textbook</h2><p>Choose the Heat and Mass Transfer PDF on this device. It stays in this browser only: it is not uploaded, not synced and not included in exported study data.</p>
        <label class="btn" for="tp-file">Choose PDF…</label><input type="file" id="tp-file" accept="application/pdf,.pdf" class="sr"><p class="tp-status" id="tp-status" role="status"></p></div>`;
      document.getElementById('tp-file').onchange = async e => {
        const f = e.target.files && e.target.files[0], st = document.getElementById('tp-status'); if (!f) return;
        if (f.type && f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { st.textContent = 'That isn’t a PDF file.'; return; }
        st.textContent = 'Saving it in this browser…';
        try { const buf = await f.arrayBuffer(); const head = new TextDecoder().decode(new Uint8Array(buf, 0, 5)); if (head !== '%PDF-') { st.textContent = 'That file doesn’t look like a PDF.'; return; }
          await putFile({ blob: new Blob([buf], { type: 'application/pdf' }), name: f.name.slice(0, 200), size: f.size, sha256: await sha256(buf), addedAt: Date.now() }); showFile(s);
        } catch (err) { st.textContent = 'This browser couldn’t store the file (private mode or storage full?). Nothing was uploaded.'; }
      };
      return;
    }
    const off = offsetFor(rec), verified = rec.sha256 === P.verifiedFile.sha256, pdfPage = s.page + off;
    if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(rec.blob); cleanupFns.push(() => { if (url) { URL.revokeObjectURL(url); url = null; } });
    const inline = navigator.pdfViewerEnabled !== false;
    view.innerHTML = `${inline ? `<iframe class="tp-frame" id="tp-frame" title="Textbook, printed page ${s.page}" src="${url}#page=${pdfPage}&view=FitH"></iframe>` : `<div class="tp-open"><p>This browser can’t show PDFs inside the page. Open it in your PDF viewer at page ${pdfPage} of the file (printed page ${s.page}).</p></div>`}
      <div class="tp-file"><a class="btn ghost sm" id="tp-ext" href="${url}#page=${pdfPage}" target="_blank" rel="noopener">Open page in a new tab</a>
        <span class="tp-ver ${verified ? 'ok' : 'warn'}" id="tp-ver">${verified ? 'Verified edition: page numbers match' : 'Different file from the one the page map was checked against — if pages are off, adjust:'}</span>
        <label class="tp-off">PDF page = printed page + <input type="number" id="tp-offset" min="-50" max="200" step="1" value="${off}" aria-label="Page offset"></label>
        <span class="tp-name">${esc(rec.name)} · ${(rec.size / 1048576).toFixed(1)} MB · stored in this browser</span><button class="t-link" id="tp-remove">Remove from this browser</button></div>`;
    document.getElementById('tp-offset').onchange = e => { const v = Math.round(Number(e.target.value)); if (!Number.isFinite(v) || v < -50 || v > 200) return; const p = prefs(); p.offsets = { ...(p.offsets || {}), [rec.sha256 || 'unknown']: v }; setPrefs(p); showFile(s); };
    document.getElementById('tp-remove').onclick = async () => { if (!confirm('Remove the textbook PDF from this browser? Your progress and bookmarks stay.')) return; await delFile(); showFile(s); };
  }
  return { render, sections, linkForCard, pageFor, keyOfCard, BOOK, _db: { getFile, putFile, delFile } };
})();
