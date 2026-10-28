// Calculation workspace (UI). Uses CalcCore (calccore.js): curated Heat and Mass Transfer calculators only, never
// custom LaTeX. Runs entirely in the browser. A result can be added to a study sheet.
const Calc = (() => {
  const C = CalcCore, BOOK = 'heat-mass-transfer';
  const state0 = () => ({ solve: null, vals: {}, units: {}, out: '', res: null, msg: '' });
  const ui = {}; // per calculator, kept while the tab is open
  const sym = s => `\\(${s}\\)`;
  function cardLink(f) {
    const b = books[BOOK], ch = b && b.chapters.find(c => c.n === f.ch), i = Number(f.card.split('-')[1]);
    const card = ch && ch.cards[i - 1];
    return card ? `<a href="#/read/${BOOK}/${f.ch}/${i}">${esc(b.short)} · Ch ${f.ch} · ${esc(stripTags(card.h))} →</a>` : '';
  }
  function tex(t) { try { return window.katex ? katex.renderToString(t, { displayMode: true, throwOnError: true }) : `<code>${esc(t)}</code>`; } catch (e) { return `<code>${esc(t)}</code>`; } }
  // links shown in the reader and notebook for a card that has calculators
  function linksFor(bookId, cardId) {
    const fs = C.forCard(bookId, cardId); if (!fs.length) return '';
    return fs.map(f => `<a class="t-link c-calc" href="#/calc/${f.id}">${fs.length > 1 ? `Calculate: ${esc(f.short || f.title.replace(/^Maximum temperature rise: /, ''))}` : 'Calculate'}</a>`).join('');
  }
  function renderList() {
    document.title = 'Calculation workspace · LearnScroll';
    window.lsPageCtx = () => ({ label: 'All calculators', ctx: { schemaVersion: 1, pageType: 'calculation-workspace', bookId: BOOK, pageState: {} } });
    app.innerHTML = `<main class="page cpage"><a class="back" href="#/formulas">← Formula notebook</a>
      <div class="book-head"><div><h1>Calculation workspace</h1><p class="meta-line">${C.F.length} checked Heat and Mass Transfer equations. Pick one, choose what to solve for, enter values with units.</p></div></div>
      <ol class="f-list c-list">${C.F.map(f => `<li class="f-item"><div class="f-top"><h2><a href="#/calc/${f.id}">${esc(f.title)}</a></h2><span class="f-tag">${esc(f.ref)} · Ch ${f.ch}</span></div><div class="c-eq">${tex(f.tex)}</div></li>`).join('')}</ol>
      <p class="f-tag c-note">Only these curated equations can be calculated. Your own formulas in the notebook are for reference; their LaTeX is never evaluated.</p></main>`;
  }
  function render(id) {
    const f = C.byId[id]; if (!f) return renderMissing('That calculator doesn’t exist.', '#/calc', 'All calculators');
    const u = ui[id] || (ui[id] = state0());
    const names = Object.keys(f.vars), solvable = names.filter(n => f.solve[n]);
    if (!u.solve || !f.solve[u.solve]) u.solve = solvable[0];
    for (const n of names) if (!u.units[n]) u.units[n] = C.SI[f.vars[n].dim];
    const target = f.vars[u.solve];
    if (!C.UNITS[target.dim][u.out]) u.out = C.SI[target.dim];
    document.title = `${f.title} · Calculator · LearnScroll`;
    const unitSel = (n, idAttr, cur) => { const opts = Object.keys(C.UNITS[f.vars[n].dim]); return opts.length === 1 ? `<span class="c-unit1" id="${idAttr}">${esc(opts[0])}</span>` : `<select id="${idAttr}" data-unit="${n}" aria-label="Unit for ${esc(f.vars[n].label)}">${opts.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; };
    const range = n => { const r = f.vars[n].range; if (!r) return ''; const si = C.SI[f.vars[n].dim], uu = si === '–' ? '' : ` ${si}`; return [r.gt !== undefined ? `> ${r.gt}${uu}` : '', r.ge !== undefined ? `≥ ${r.ge}${uu}` : '', r.le !== undefined ? `≤ ${r.le}` : ''].filter(Boolean).join(', '); };
    const res = u.res;
    app.innerHTML = `<main class="page cpage"><a class="back" href="#/calc">← All calculators</a>
      <div class="book-head"><div><h1>${esc(f.title)}</h1><p class="meta-line">${esc(f.ref)} · ${cardLink(f)}</p></div></div>
      <div class="c-eq">${tex(f.tex)}</div>${f.note ? `<p class="f-tag c-cond">${esc(f.note)}</p>` : ''}
      <form class="c-form" id="c-form" novalidate>
        <fieldset class="c-solve"><legend>Solve for</legend>${solvable.map(n => `<label class="c-pill"><input type="radio" name="c-solve" value="${n}"${n === u.solve ? ' checked' : ''}> ${sym(f.vars[n].sym)} <span>${esc(f.vars[n].label)}</span></label>`).join('')}</fieldset>
        <div class="c-inputs">${names.filter(n => n !== u.solve).map(n => `<div class="c-row${res && res.field === n ? ' bad' : ''}"><label for="c-v-${n}"><span class="c-sym">${sym(f.vars[n].sym)}</span> ${esc(f.vars[n].label)}${range(n) ? ` <span class="f-tag">(${esc(range(n))})</span>` : ''}</label>
          <span class="c-in"><input id="c-v-${n}" data-val="${n}" inputmode="decimal" autocomplete="off" value="${esc(u.vals[n] ?? '')}"${res && res.field === n ? ' aria-invalid="true" aria-describedby="c-msg"' : ''}>${unitSel(n, `c-u-${n}`, u.units[n])}</span></div>`).join('')}</div>
        <div class="c-row c-outrow"><label for="c-out">Show ${sym(target.sym)} in</label><span class="c-in">${unitSel(u.solve, 'c-out', u.out)}</span></div>
        <div class="btns"><button class="btn" type="submit" id="c-go">Calculate</button><button class="btn ghost" type="button" id="c-clear">Clear</button></div>
      </form>
      <div class="c-msg" id="c-msg" role="status" aria-live="polite">${res && !res.ok ? `<b>Can’t calculate yet.</b> ${esc(res.error)}` : ''}</div>
      ${res && res.ok ? resultHTML(f, u) : ''}
      <p class="f-tag c-note">Checked against ${esc(f.ref)} in ${esc(books[BOOK] ? books[BOOK].title : 'the textbook')}. Values are converted to SI before substituting; σ = 5.67×10⁻⁸ W/m²·K⁴ where it appears. Runs in your browser.</p></main>`;
    window.lsPageCtx = () => { const r = u.res; return { label: f.title, ctx: { schemaVersion: 1, pageType: 'calculation-workspace', bookId: BOOK, chapterId: f.ch, itemId: f.id, sourceRefs: [f.ref], pageState: {
      calculator: f.title, solveFor: `${f.vars[u.solve].label} (${u.solve})`, inputs: names.filter(n => n !== u.solve).map(n => { const el = app.querySelector(`[data-val="${n}"]`); return [n, el ? el.value : u.vals[n]]; }).map(([n, v]) => `${n}=${String(v ?? '').slice(0, 20) || '?'} ${u.units[n] || ''}`).join('; '),
      ...(r && r.ok ? { result: `${C.fmt(r.value, 4)} ${r.unit}` } : {}), ...(r && !r.ok ? { error: r.error } : {}) } } }; };
    renderMath(app.querySelector('.cpage'));
    wire(f, u);
  }
  function resultHTML(f, u) {
    const r = u.res, t = f.vars[u.solve], st = r.steps;
    const sheets = Sheets.list();
    return `<section class="c-result" id="c-result" aria-labelledby="c-res-h"><h2 id="c-res-h">Result</h2>
      <p class="c-ans">${sym(t.sym)} = <b>${esc(C.fmt(r.value, 4))} ${esc(r.unit)}</b>${r.unit !== r.siUnit ? ` <span class="f-tag">(${esc(C.fmt(r.si, 4))} ${esc(r.siUnit)})</span>` : ''}</p>
      <ol class="c-steps">
        <li><span class="c-lab">Rearrange for ${sym(t.sym)}</span>${tex(st.rearranged)}</li>
        ${st.conversions.length ? `<li><span class="c-lab">Convert to SI</span><ul>${st.conversions.map(c => `<li>${sym(f.vars[c.name].sym)}: ${esc(c.from)} = ${esc(c.to)}</li>`).join('')}</ul></li>` : ''}
        <li><span class="c-lab">Substitute (SI units)</span>${tex(st.substitution)}</li>
        <li><span class="c-lab">Calculate</span>${tex(st.resultTex)}<span class="f-tag">in ${esc(r.siUnit)}</span></li>
      </ol>
      <div class="c-add"><label for="c-sheet">Add to study sheet</label><select id="c-sheet"><option value="">New sheet “Calculations”</option>${sheets.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select><button class="btn ghost sm" type="button" id="c-addbtn">Add result</button><span class="f-tag" id="c-addmsg" role="status"></span></div>
    </section>`;
  }
  function readForm(f, u) {
    for (const el of app.querySelectorAll('[data-val]')) u.vals[el.dataset.val] = el.value;
    for (const el of app.querySelectorAll('select[data-unit]')) { if (el.id === 'c-out') u.out = el.value; else u.units[el.dataset.unit] = el.value; }
  }
  function wire(f, u) {
    const form = document.getElementById('c-form');
    form.addEventListener('change', e => {
      if (e.target.name === 'c-solve') { readForm(f, u); u.solve = e.target.value; u.res = null; render(f.id); const r = app.querySelector(`input[name="c-solve"][value="${u.solve}"]`); if (r) r.focus(); return; }
      if (e.target.matches('select')) { readForm(f, u); }
    });
    form.addEventListener('submit', e => {
      e.preventDefault(); readForm(f, u);
      const inputs = {}; for (const n of Object.keys(f.vars)) if (n !== u.solve) inputs[n] = { value: u.vals[n] ?? '', unit: u.units[n] };
      u.res = C.compute(f.id, u.solve, inputs, u.out);
      render(f.id);
      const focus = u.res.ok ? document.getElementById('c-result') : u.res.field ? document.getElementById(`c-v-${u.res.field}`) : document.getElementById('c-msg');
      if (focus) { if (u.res.ok) focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: false }); }
    });
    document.getElementById('c-clear').onclick = () => { ui[f.id] = { ...state0(), solve: u.solve }; render(f.id); };
    const add = document.getElementById('c-addbtn');
    if (add) add.onclick = () => {
      const r = u.res; if (!r || !r.ok) return;
      const inputs = {}; for (const n of Object.keys(f.vars)) if (n !== u.solve) inputs[n] = [Number(String(u.vals[n]).trim().replace(/\u2212/g, '-')), u.units[n]];
      const out = Sheets.addCalc(document.getElementById('c-sheet').value, { t: 'calc', calc: f.id, solve: u.solve, inputs, result: [Number(r.value.toPrecision(10)), r.unit], at: Date.now() });
      const m = document.getElementById('c-addmsg');
      if (out.ok) { m.innerHTML = `Added to <a href="#/sheets/${out.id}">${esc(out.title)}</a>.`; } else m.textContent = out.error;
    };
  }
  return { route: parts => (parts[1] ? render(parts[1]) : renderList()), linksFor };
})();
