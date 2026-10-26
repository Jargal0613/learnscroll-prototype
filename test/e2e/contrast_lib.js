// Injected into the page: WCAG 2.2 contrast of every visible text element, plus input/selected/focus boundaries.
(() => {
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map(k => top[k] * a + bot[k] * (1 - a)).concat(1); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let bg = [10, 10, 11, 1]; for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg); return bg; };
  const opac = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].join('.'); const p = el.parentElement; return (p && p.classList.length ? p.classList[0] + '>' : '') + s; };
  const out = [];
  const vis = el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden="true"]'); };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, .katex-mathml, script, style')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const ph = /^(INPUT|TEXTAREA)$/.test(el.tagName) && el.placeholder && !el.value;
    if ((!own && !ph) || !vis(el)) continue;
    const s = getComputedStyle(el); const disabled = el.closest(':disabled') !== null && !el.closest('.opt'); // answered quiz options stay readable content
    let fg = parse(ph ? getComputedStyle(el, '::placeholder').color : s.color); const bg = bgOf(el);
    fg = [...fg.slice(0, 3), fg[3] * opac(el)]; const r = ratio(over(fg, bg), bg);
    const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    out.push({ kind: ph ? 'placeholder' : 'text', sel: sel(el), text: (ph ? el.placeholder : el.textContent).trim().slice(0, 40), ratio: +r.toFixed(2), need: large ? 3 : 4.5, disabled });
  }
  // UI component boundaries that identify a control without text: inputs, selected segments/tabs.
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea, select, [aria-checked="true"], [aria-pressed="true"], [aria-current="page"], [aria-selected="true"]')) {
    if (!vis(el)) continue; const s = getComputedStyle(el); const bg = bgOf(el.parentElement || el);
    const cs = ['borderTopColor', 'borderBottomColor', 'borderLeftColor'].map(k => parse(s[k])).filter(c => c && c[3] > 0);
    let best = 0; for (const c of cs) best = Math.max(best, ratio(over(c, bg), bg));
    const m = (s.boxShadow || '').match(/rgba?\([^)]+\)/g) || []; for (const c of m) best = Math.max(best, ratio(over(parse(c), bg), bg));
    const fill = parse(s.backgroundColor); if (fill && fill[3] > 0) best = Math.max(best, ratio(over(fill, bg), bg));
    out.push({ kind: 'boundary', sel: sel(el), text: (el.textContent || el.value || '').trim().slice(0, 30), ratio: +best.toFixed(2), need: 3, disabled: el.disabled });
  }
  return out;
})()
