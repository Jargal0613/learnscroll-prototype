// Guided problem practice (UI). Textbook worked examples only (practicedata.js), solved step by step:
// knowns → equation → substitution → calculation → units. The student tries first; hints unlock after a try,
// then the step's reference, then (after a calculation attempt) the full solution. Checks run locally
// (practicecore.js). Optional AI hints go through the existing tutor route and count against the solver limits.
const Practice = (() => {
  const P = PRACTICE, PC = PracticeCore, C = CalcCore, BOOK = 'heat-mass-transfer';
  const STEPS = [['knowns', 'Knowns'], ['equation', 'Equation'], ['substitution', 'Substitution'], ['calculation', 'Calculation'], ['units', 'Units check']];
  const ui = {}; // per problem, kept while the tab is open: drafts, messages, AI hint (not stored)
  const byId = Object.fromEntries(P.map(p => [p.id, p]));
  let aiStatus = null; // null unknown, true/false after GET /api/tutor
  const tex = t => { try { return window.katex ? katex.renderToString(t, { displayMode: true, throwOnError: true }) : `<code>${esc(t)}</code>`; } catch (e) { return `<code>${esc(t)}</code>`; } };
  const store = () => state.practice || (state.practice = {});
  const recOf = id => store()[id] || { attempts: [], hints: {}, revealed: [], struggled: [], solved: false, updated: 0 };
  function commit(id, fn) {
    const r = JSON.parse(JSON.stringify(recOf(id))); fn(r);
    r.attempts = r.attempts.slice(-100); r.struggled = PC.struggled(r); r.updated = Date.now();
    store()[id] = r; save();
  }
  const tried = (r, st) => r.attempts.some(a => a.step === st);
  const okStep = (r, st) => r.attempts.some(a => a.step === st && a.ok === true);
  function cardLink(p) {
    const b = books[BOOK], ch = b && b.chapters.find(c => c.n === p.ch), i = Number(p.card.split('-')[1]), card = ch && ch.cards[i - 1];
    return card ? `<a href="#/read/${BOOK}/${p.ch}/${i}">Ch ${p.ch} · ${esc(stripTags(card.h))} →</a>` : '';
  }
  function status(r) { return r.solved ? 'Solved' : r.attempts.length ? 'In progress' : 'Not started'; }
  function renderList() {
    document.title = 'Problem practice · LearnScroll';
    app.innerHTML = `<main class="page cpage ppage"><a class="back" href="#/">← Home</a>
      <div class="book-head"><div><h1>Problem practice</h1><p class="meta-line">${P.length} worked examples from Heat and Mass Transfer, solved one step at a time. Try each step first; hints and the solution open up after you try.</p></div></div>
      <ol class="f-list p-list">${P.map(p => { const r = recOf(p.id); return `<li class="f-item" data-pid="${p.id}"><div class="f-top"><h2><a href="#/practice/${p.id}">${esc(p.title)}</a></h2><span class="f-tag">${esc(p.ref)} · Ch ${p.ch}</span></div><p class="f-tag p-stat">${status(r)}${r.struggled.length ? ` · worth reviewing: ${r.struggled.map(s => STEPS.find(x => x[0] === s)[1].toLowerCase()).join(', ')}` : ''}</p></li>`; }).join('')}</ol>
      <p class="f-tag c-note">Problems are the textbook’s own examples, restated briefly; answers were checked against the textbook. No made-up variants.</p></main>`;
  }
  function msgHTML(m) { return m ? `<p class="p-msg ${m.ok === true ? 'good' : m.ok === false ? 'bad' : ''}" role="status">${esc(m.msg)}</p>` : ''; }
  function hintsHTML(p, r, st) {
    const n = r.hints[st] || 0, hs = p.hints[st];
    const shown = hs.slice(0, n).map((h, i) => `<li>Hint ${i + 1}: ${esc(h)}</li>`).join('');
    const canTry = tried(r, st) || (ui[p.id].draft[st] || '').trim();
    const btn = n < hs.length ? `<button type="button" class="btn ghost small" data-hint="${st}"${canTry ? '' : ' disabled title="Try this step first"'}>${n ? 'Another hint' : 'Hint'}</button>` : (r.revealed.includes(st) ? '' : `<button type="button" class="btn ghost small" data-reveal="${st}">Show this step</button>`);
    return `${shown ? `<ol class="p-hints">${shown}</ol>` : ''}<div class="btns">${btn}${!canTry && n < hs.length ? '<span class="f-tag">Try first, then hints unlock.</span>' : ''}</div>`;
  }
  function refHTML(p, st) {
    if (st === 'knowns') return `<ul class="p-ref">${p.knowns.map(([s, v]) => `<li>\\(${s}\\) = ${esc(v)}</li>`).join('')}<li>Find: \\(${p.find[0]}\\), ${esc(p.find[1])}</li></ul>`;
    if (st === 'equation') return `<div class="p-ref">${p.equations.map(e => `<p>${esc(C.byId[e].title)} (${esc(C.byId[e].ref)})</p>${tex(C.byId[e].tex)}`).join('')}</div>`;
    if (st === 'substitution') return `<div class="p-ref">${tex(p.substitution)}</div>`;
    if (st === 'calculation') return `<p class="p-ref">\\(${p.find[0]}\\) ${esc(p.answer.shown)}</p>`;
    return `<p class="p-ref">${esc(p.units[0])}: ${esc(p.unitsWhy)}</p>`;
  }
  function stepBody(p, r, st) {
    const u = ui[p.id], d = u.draft;
    if (st === 'knowns' || st === 'substitution') {
      const shown = tried(r, st) || r.revealed.includes(st);
      return `<label class="f-tag" for="p-in-${st}">${st === 'knowns' ? 'List the given quantities (with units) and what you must find.' : 'Write the equation with your numbers in SI units.'}</label>
        <textarea id="p-in-${st}" data-draft="${st}" rows="3">${esc(d[st] || '')}</textarea>
        <div class="btns"><button type="button" class="btn small" data-compare="${st}">Compare with the reference</button></div>
        ${shown ? `${refHTML(p, st)}${tried(r, st) && !r.attempts.some(a => a.step === st && a.ok !== null) ? `<div class="btns p-self"><span class="f-tag">Did yours match?</span><button type="button" class="btn ghost small" data-self="${st}:1">Yes</button><button type="button" class="btn ghost small" data-self="${st}:0">I missed something</button></div>` : ''}` : ''}`;
    }
    if (st === 'equation') {
      const pick = u.pick || [];
      return `<fieldset class="p-eqs"><legend class="f-tag">${p.multi ? 'Which equations do you need? (pick all that apply)' : 'Which equation gives the unknown?'}</legend>${p.options.map(o => `<label class="c-pill"><input type="${p.multi ? 'checkbox' : 'radio'}" name="p-eq" value="${o}"${pick.includes(o) ? ' checked' : ''}> ${esc(C.byId[o].title)}</label>`).join('')}</fieldset>
        <div class="btns"><button type="button" class="btn small" data-check="equation">Check</button></div>${r.revealed.includes(st) ? refHTML(p, st) : ''}`;
    }
    if (st === 'calculation') {
      const units = Object.keys(C.UNITS[p.answer.dim]);
      return `<div class="c-row"><label for="p-in-calculation">\\(${p.find[0]}\\) =</label><span class="c-in"><input id="p-in-calculation" data-draft="calculation" inputmode="decimal" autocomplete="off" value="${esc(d.calculation || '')}"><select id="p-unit" aria-label="Unit">${units.map(o => `<option${o === (u.unit || C.SI[p.answer.dim]) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></span></div>
        <div class="btns"><button type="button" class="btn small" data-check="calculation">Check</button></div>${r.revealed.includes(st) ? refHTML(p, st) : ''}`;
    }
    return `<div class="c-row"><label for="p-in-units">Unit of the answer</label><span class="c-in"><input id="p-in-units" data-draft="units" autocomplete="off" placeholder="e.g. W/m·K" value="${esc(d.units || '')}"></span></div>
      <div class="btns"><button type="button" class="btn small" data-check="units">Check</button></div>${r.revealed.includes(st) ? refHTML(p, st) : ''}`;
  }
  function render(id) {
    const p = byId[id]; if (!p) return renderMissing('That practice problem doesn’t exist.', '#/practice', 'All problems');
    const u = ui[id] || (ui[id] = { draft: {}, msg: {}, pick: [], unit: null, ai: null, aiBusy: false, full: false });
    const r = recOf(id), calcTried = r.attempts.some(a => a.step === 'calculation' && a.ok !== null);
    document.title = `${p.title} · Practice · LearnScroll`;
    app.innerHTML = `<main class="page cpage ppage" data-pid="${id}"><a class="back" href="#/practice">← All problems</a>
      <div class="book-head"><div><h1>${esc(p.title)}</h1><p class="meta-line">${esc(p.ref)} · ${cardLink(p)}</p></div></div>
      <p class="p-statement">${esc(p.statement)}</p>
      ${r.solved ? '<p class="p-msg good p-solved" role="status">Solved. Steps you found hard are saved for review.</p>' : ''}
      <ol class="p-steps">${STEPS.map(([st, label], i) => `<li class="p-step${okStep(r, st) ? ' done' : ''}" id="ps-${st}" data-step="${st}"><h2>${i + 1}. ${label}${okStep(r, st) ? ' <span class="f-tag">✓</span>' : ''}</h2>${stepBody(p, r, st)}${msgHTML(u.msg[st])}${hintsHTML(p, r, st)}</li>`).join('')}</ol>
      <section class="p-extra">
        <div class="btns"><button type="button" class="btn ghost" id="p-full"${calcTried ? '' : ' disabled'}>Show full solution</button>${calcTried ? '' : '<span class="f-tag">Unlocks after you try the calculation.</span>'}
        <button type="button" class="btn ghost" id="p-ai" ${aiStatus === true ? '' : 'hidden'}${u.aiBusy ? ' disabled' : ''}>${u.aiBusy ? 'Asking the tutor…' : 'Ask the tutor for a hint'}</button></div>
        <div id="p-ai-out" role="status" aria-live="polite">${u.ai ? `<div class="p-ai ${u.ai.ok ? '' : 'bad'}"><b>${u.ai.ok ? 'Tutor hint (AI)' : esc(u.ai.h)}</b><p>${esc(u.ai.text)}</p></div>` : ''}</div>
        ${u.full ? `<div class="p-full" id="p-solution"><h2>Full solution</h2>${STEPS.map(([st, label]) => `<h3>${label}</h3>${refHTML(p, st)}`).join('')}</div>` : ''}
      </section>
      <p class="f-tag c-note">Checks run in your browser: numbers within ${p.answer.abs !== undefined ? `±${p.answer.abs} K` : `${p.answer.rel * 100}%`} of the textbook answer, in any listed unit.</p></main>`;
    renderMath(app.querySelector('.ppage'));
    wire(p, u);
    if (aiStatus === null) loadStatus();
  }
  async function loadStatus() {
    aiStatus = false;
    try { const r = await fetch('/api/tutor'); const j = r.ok ? await r.json() : null; aiStatus = !!(j && j.solver === true && j.books && j.books[BOOK]); } catch (e) { aiStatus = false; }
    const b = document.getElementById('p-ai'); if (b) b.hidden = !aiStatus;
  }
  function keepDrafts(u) { app.querySelectorAll('[data-draft]').forEach(el => { u.draft[el.dataset.draft] = el.value; }); const s = document.getElementById('p-unit'); if (s) u.unit = s.value; u.pick = [...app.querySelectorAll('input[name="p-eq"]:checked')].map(x => x.value); }
  function rerender(p, focusSel) { const y = window.scrollY; render(p.id); window.scrollTo(0, y); const f = focusSel && app.querySelector(focusSel); if (f) f.focus({ preventScroll: true }); }
  function wire(p, u) {
    app.querySelectorAll('[data-draft]').forEach(el => el.addEventListener('input', () => {
      const had = !!(u.draft[el.dataset.draft] || '').trim(); u.draft[el.dataset.draft] = el.value;
      const hb = app.querySelector(`[data-hint="${el.dataset.draft}"]`); if (hb && !had && el.value.trim()) { hb.disabled = false; hb.removeAttribute('title'); }
    }));
    app.querySelectorAll('[data-compare]').forEach(b => b.addEventListener('click', () => {
      keepDrafts(u); const st = b.dataset.compare;
      if (!(u.draft[st] || '').trim()) { u.msg[st] = { ok: null, msg: 'Write your attempt first, then compare.' }; return rerender(p, `[data-compare="${st}"]`); }
      u.msg[st] = null; commit(p.id, r => r.attempts.push({ step: st, ok: null, at: Date.now() })); rerender(p, `[data-compare="${st}"]`);
    }));
    app.querySelectorAll('[data-self]').forEach(b => b.addEventListener('click', () => {
      keepDrafts(u); const [st, v] = b.dataset.self.split(':');
      commit(p.id, r => r.attempts.push({ step: st, ok: v === '1', at: Date.now() }));
      u.msg[st] = { ok: v === '1', msg: v === '1' ? 'Good.' : 'Noted: this step is saved for review. Look at what you missed in the reference.' }; rerender(p, `#ps-${st} h2`);
    }));
    app.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => {
      keepDrafts(u); const st = b.dataset.check;
      const res = st === 'equation' ? PC.checkEquation(p, u.pick) : st === 'calculation' ? PC.checkCalc(p, u.draft.calculation, u.unit || C.SI[p.answer.dim]) : PC.checkUnits(p, u.draft.units);
      u.msg[st] = res;
      if (res.ok !== null) commit(p.id, r => { const a = { step: st, ok: res.ok, at: Date.now() }; if (st === 'calculation') a.v = String(u.draft.calculation).slice(0, 40) + ' ' + (u.unit || C.SI[p.answer.dim]); else if (st === 'units') a.v = String(u.draft.units).slice(0, 40); else a.v = u.pick.join(','); r.attempts.push(a); if (st === 'calculation' && res.ok) r.solved = true; });
      rerender(p, `[data-check="${st}"]`);
    }));
    app.querySelectorAll('[data-hint]').forEach(b => b.addEventListener('click', () => { keepDrafts(u); const st = b.dataset.hint; commit(p.id, r => { r.hints[st] = Math.min((r.hints[st] || 0) + 1, p.hints[st].length); }); rerender(p, `[data-hint="${st}"], [data-reveal="${st}"]`); }));
    app.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => { keepDrafts(u); const st = b.dataset.reveal; commit(p.id, r => { if (!r.revealed.includes(st)) r.revealed.push(st); }); rerender(p, `#ps-${st} .p-ref`); }));
    const full = document.getElementById('p-full');
    if (full) full.addEventListener('click', () => { keepDrafts(u); u.full = true; commit(p.id, r => { if (!r.solved && !r.revealed.includes('calculation')) r.revealed.push('calculation'); }); rerender(p); const s = document.getElementById('p-solution'); if (s) s.scrollIntoView({ block: 'start' }); });
    const ai = document.getElementById('p-ai');
    if (ai) ai.addEventListener('click', () => askAI(p, u));
  }
  function currentStep(p, r) { return (STEPS.find(([st]) => !okStep(r, st)) || STEPS[4])[0]; }
  async function askAI(p, u) {
    keepDrafts(u); const r = recOf(p.id), st = currentStep(p, r), label = STEPS.find(x => x[0] === st)[1].toLowerCase();
    const work = STEPS.map(([s, l]) => (u.draft[s] || '').trim() ? `${l}: ${u.draft[s].trim().slice(0, 300)}` : '').filter(Boolean).join('\n');
    const question = `I'm practising ${p.ref} (${p.title}) from this textbook and I'm stuck on the ${label} step. ${work ? `My work so far:\n${work}\n` : ''}Give me one short hint for this step only. Do not give the final numerical answer or the full solution.`.slice(0, 1500);
    u.aiBusy = true; u.ai = null; rerender(p, '#p-ai');
    let res, data;
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), window.__lsTutorTimeoutMs || 45000);
      try { res = await fetch('/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal, body: JSON.stringify({ practiceHint: true, bookId: BOOK, chapterId: p.ch, cardId: p.card, scope: 'card', style: 'simple', question }) }); } finally { clearTimeout(t); }
      try { data = await res.json(); } catch (e) { data = null; }
      if (res.ok && data && typeof data.answer === 'string') u.ai = { ok: true, text: data.answer.slice(0, 1500) };
      else if (res.status === 429) { const s = Number(res.headers.get('Retry-After')) || 0, m = Math.ceil(s / 60); u.ai = { ok: false, h: 'Hint limit reached', text: `AI hints share a small per-minute and per-day limit so they stay free. ${m ? (m >= 60 ? 'Try again tomorrow' : `Try again in about ${m} minute${m === 1 ? '' : 's'}`) : 'Try again later'}. Your work is kept, and the built-in hints still work.` }; }
      else u.ai = { ok: false, h: 'Tutor hint unavailable', text: 'The tutor couldn’t give a hint right now. Your work is kept, and the built-in hints still work.' };
    } catch (e) { u.ai = { ok: false, h: 'Tutor hint unavailable', text: 'The tutor couldn’t be reached. Your work is kept, and the built-in hints still work.' }; }
    u.aiBusy = false;
    if (location.hash === `#/practice/${p.id}`) rerender(p, '#p-ai');
  }
  function forCard(cardId) { return P.filter(p => p.card === cardId); }
  function linksFor(bookId, cardId) { return bookId !== BOOK ? '' : forCard(cardId).map(p => `<a class="t-link p-link" href="#/practice/${p.id}">Practise ${esc(p.ref)}</a>`).join(''); }
  return { route: parts => (parts[1] ? render(parts[1]) : renderList()), linksFor, count: () => P.length, countFor: (bookId, n) => (bookId === BOOK ? P.filter(p => p.ch === n).length : 0) };
})();
