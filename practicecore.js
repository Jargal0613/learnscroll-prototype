// Guided practice checks (local, no network): numeric answers with tolerance and unit conversion, unit answers,
// equation choice, and which steps a student struggled with. Shared by the page and the unit tests.
const PracticeCore = (() => {
  const C = typeof CalcCore !== 'undefined' ? CalcCore : require('./calccore.js');
  const normUnit = s => String(s || '').toLowerCase().replace(/°c/g, 'k').replace(/[\s·*.()]/g, '').replace(/\^?2|²/g, '2').replace(/\^?3|³/g, '3').replace(/per/g, '/');
  // { ok, msg } — ok null means "not checkable" (empty / not a number / unknown unit): never counted as wrong
  function checkCalc(p, raw, unit) {
    const s = String(raw ?? '').trim().replace(/\u2212/g, '-').replace(/\s+/g, '');
    if (!s) return { ok: null, msg: 'Enter your numeric answer first.' };
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { ok: null, msg: `“${raw}” isn’t a number. Use digits and a decimal point (e.g. 81.4 or 8.14e4).` };
    const units = C.UNITS[p.answer.dim]; if (!units[unit]) return { ok: null, msg: 'Pick a unit for your answer.' };
    const si = C.toSI(Number(s), p.answer.dim, unit);
    if (!Number.isFinite(si)) return { ok: null, msg: 'That number is too large.' };
    const want = p.answer.value, ok = p.answer.abs !== undefined ? Math.abs(si - want) <= p.answer.abs : Math.abs(si - want) <= p.answer.rel * Math.abs(want);
    if (ok) return { ok: true, msg: `Correct: ${p.answer.shown}.` };
    const ratio = si / want, mag = Number.isFinite(ratio) && ratio > 0 ? Math.round(Math.log10(ratio)) : 0;
    return { ok: false, msg: mag && Math.abs(ratio / 10 ** mag - 1) < 0.05 ? `Not quite: you’re off by a factor of 10${mag > 0 ? '' : '⁻'}${String(Math.abs(mag)).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}. Check unit conversions.` : 'Not quite. Check your substitution and arithmetic, then try again.' };
  }
  function checkUnits(p, raw) {
    if (!String(raw || '').trim()) return { ok: null, msg: 'Type the unit of your result first.' };
    const ok = p.units.map(normUnit).includes(normUnit(raw));
    return ok ? { ok: true, msg: `Yes: ${p.unitsWhy}.` } : { ok: false, msg: 'Not the expected unit. Write the units of each quantity in the equation and cancel them.' };
  }
  function checkEquation(p, picked) {
    const a = [...new Set(picked || [])].sort(), b = [...p.equations].sort();
    if (!a.length) return { ok: null, msg: p.multi ? 'Pick the equations you need.' : 'Pick an equation.' };
    const ok = a.length === b.length && a.every((x, i) => x === b[i]);
    return ok ? { ok: true, msg: p.multi ? 'Right: both are needed.' : 'Right equation.' } : { ok: false, msg: p.multi && a.some(x => b.includes(x)) ? 'Partly: something is missing or extra. Think about every way heat leaves.' : 'Not this one. Think about the mechanism and geometry, then try again.' };
  }
  // A step was a struggle if it needed two or more wrong tries, any hint, or its solution was revealed.
  function struggled(rec) {
    const out = [];
    for (const st of ['knowns', 'equation', 'substitution', 'calculation', 'units']) {
      const wrong = (rec.attempts || []).filter(a => a.step === st && a.ok === false).length;
      if (wrong >= 2 || (rec.hints || {})[st] > 0 || (rec.revealed || []).includes(st)) out.push(st);
    }
    return out;
  }
  return { normUnit, checkCalc, checkUnits, checkEquation, struggled };
})();
if (typeof module !== 'undefined') module.exports = PracticeCore;
