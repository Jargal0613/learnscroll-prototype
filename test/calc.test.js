// Calculation workspace: reference values (hand-checked) for every curated formula, round trips through every
// rearrangement, unit conversion, and the error cases. A result is either a finite number or a message, never NaN.
const test = require('node:test'), assert = require('node:assert');
const C = require('../calccore.js');
const near = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const inp = o => Object.fromEntries(Object.entries(o).map(([k, [value, unit]]) => [k, { value: String(value), unit }]));
// [id, solveFor, inputs, expected value, expected unit]
const REF = [
  ['heat-flux', 'q', { Q: [24, 'W'], A: [3, 'm²'] }, 8, 'W/m²'],
  ['flow-energy', 'Q', { m: [0.5, 'kg/s'], cp: [4.18, 'kJ/kg·K'], dT: [20, 'K'] }, 41800, 'W'],
  ['diffusivity', 'alpha', { k: [0.6, 'W/m·K'], rho: [1000, 'kg/m³'], cp: [4180, 'J/kg·K'] }, 0.6 / 4180000, 'm²/s'],
  ['plane-wall', 'Q', { k: [0.9, 'W/m·K'], A: [15, 'm²'], T1: [16, '°C'], T2: [2, '°C'], L: [0.2, 'm'] }, 945, 'W'],
  ['convection', 'h', { Q: [1200, 'W'], A: [2, 'm²'], Ts: [80, '°C'], Tinf: [20, '°C'] }, 10, 'W/m²·K'],
  ['emission', 'Q', { eps: [1, '–'], A: [1, 'm²'], Ts: [300, 'K'] }, 5.67e-8 * 300 ** 4, 'W'],
  ['net-radiation', 'Q', { eps: [0.7, '–'], A: [1.5, 'm²'], Ts: [305, 'K'], Tsurr: [285, 'K'] }, 0.7 * 5.67e-8 * 1.5 * 2056150000, 'W'],
  ['combined', 'Q', { hc: [20, 'W/m²·K'], A: [0.5, 'm²'], Ts: [60, '°C'], Tinf: [20, '°C'] }, 400, 'W'],
  ['wall-profile', 'T', { T1: [100, '°C'], T2: [20, '°C'], x: [5, 'cm'], L: [0.2, 'm'] }, 353.15, 'K'],
  ['cylinder', 'Q', { L: [1, 'm'], k: [15, 'W/m·K'], T1: [120, '°C'], T2: [100, '°C'], r1: [5, 'cm'], r2: [6, 'cm'] }, 2 * Math.PI * 15 * 20 / Math.log(1.2), 'W'],
  ['gen-surface', 'Ts', { Tinf: [20, '°C'], e: [0.5, 'MW/m³'], V: [0.1, 'L'], h: [50, 'W/m²·K'], A: [100, 'cm²'] }, 393.15, 'K'],
  ['dtmax-cylinder', 'dT', { e: [1e6, 'W/m³'], r: [1, 'cm'], k: [20, 'W/m·K'] }, 1.25, 'K'],
  ['dtmax-wall', 'dT', { e: [1e6, 'W/m³'], r: [1, 'cm'], k: [20, 'W/m·K'] }, 2.5, 'K'],
  ['dtmax-sphere', 'dT', { e: [1e6, 'W/m³'], r: [1, 'cm'], k: [20, 'W/m·K'] }, 1e6 * 1e-4 / 120, 'K'],
];
test('at least 10 curated Heat & Mass Transfer formulas, each with metadata, card, equation number', () => {
  assert.ok(C.F.length >= 10);
  for (const f of C.F) {
    assert.match(f.ref, /^Eq\. \(\d–\d+\)$/); assert.match(f.card, /^c\d+-\d+$/);
    for (const [n, m] of Object.entries(f.vars)) { assert.ok(m.sym && m.label && C.UNITS[m.dim], `${f.id}.${n} metadata`); assert.ok(f.solve[n], `${f.id} solves for ${n}`); }
    assert.ok(REF.some(r => r[0] === f.id), `${f.id} has a reference test`);
  }
});
for (const [id, solveFor, inputs, want, unit] of REF) {
  test(`reference: ${id} solves ${solveFor}`, () => {
    const r = C.compute(id, solveFor, inp(inputs)); assert.ok(r.ok, r.error);
    assert.equal(r.siUnit, unit); assert.ok(near(r.si, want, 1e-9), `${r.si} vs ${want}`);
    assert.ok(r.steps.rearranged && r.steps.substitution.includes('=') && !Object.keys(C.byId[id].vars).some(n => r.steps.substitution.includes(`{${n}}`)), 'substitution filled');
  });
  test(`round trip: ${id} every rearrangement gives the inputs back`, () => {
    const f = C.byId[id], r = C.compute(id, solveFor, inp(inputs)); assert.ok(r.ok);
    const all = { ...Object.fromEntries(Object.entries(inputs).map(([k, [v, u]]) => [k, C.toSI(v, f.vars[k].dim, u)])), [solveFor]: r.si };
    for (const name of Object.keys(f.vars)) {
      const given = Object.fromEntries(Object.keys(f.vars).filter(k => k !== name).map(k => [k, { value: String(all[k]), unit: C.SI[f.vars[k].dim] }]));
      const back = C.compute(id, name, given); assert.ok(back.ok, `${id} -> ${name}: ${back.error}`);
      assert.ok(near(back.si, all[name], 1e-6), `${id} -> ${name}: ${back.si} vs ${all[name]}`);
    }
  });
}
test('unit conversion: °C, cm, kW, kJ, kg/h and output units', () => {
  const r = C.compute('convection', 'Q', inp({ h: [10, 'W/m²·K'], A: [20000, 'cm²'], Ts: [80, '°C'], Tinf: [293.15, 'K'] }), 'kW');
  assert.ok(r.ok); assert.ok(near(r.value, 1.2)); assert.equal(r.unit, 'kW'); assert.equal(r.steps.conversions.length, 2);
  const t = C.compute('convection', 'Ts', inp({ Q: [1.2, 'kW'], h: [10, 'W/m²·K'], A: [2, 'm²'], Tinf: [20, '°C'] }), '°C');
  assert.ok(near(t.value, 80)); assert.equal(t.unit, '°C');
  const m = C.compute('flow-energy', 'm', inp({ Q: [41.8, 'kW'], cp: [4.18, 'kJ/kg·K'], dT: [20, '°C'] }), 'kg/h'); assert.ok(near(m.value, 1800));
});
test('missing input, not a number, unknown unit', () => {
  let r = C.compute('convection', 'h', inp({ Q: [1200, 'W'], A: [2, 'm²'], Ts: [80, '°C'] })); assert.equal(r.ok, false); assert.equal(r.field, 'Tinf'); assert.match(r.error, /^Enter /);
  r = C.compute('convection', 'h', { ...inp({ Q: [1200, 'W'], A: [2, 'm²'], Ts: [80, '°C'] }), Tinf: { value: '2O', unit: '°C' } }); assert.equal(r.field, 'Tinf'); assert.match(r.error, /isn’t a number/);
  r = C.compute('convection', 'h', { ...inp({ Q: [1200, 'W'], A: [2, 'm²'], Ts: [80, '°C'] }), Tinf: { value: '20', unit: '°F' } }); assert.equal(r.field, 'Tinf'); assert.match(r.error, /isn’t a unit/);
  r = C.compute('nope', 'h', {}); assert.equal(r.ok, false); r = C.compute('convection', 'zz', {}); assert.match(r.error, /can’t solve/);
});
test('division by zero, out-of-range inputs and unphysical results are explained', () => {
  let r = C.compute('convection', 'h', inp({ Q: [1200, 'W'], A: [2, 'm²'], Ts: [20, '°C'], Tinf: [20, '°C'] })); assert.match(r.error, /no temperature difference/);
  r = C.compute('heat-flux', 'A', inp({ Q: [5, 'W'], q: [0, 'W/m²'] })); assert.match(r.error, /division by zero/);
  r = C.compute('emission', 'Q', inp({ eps: [1.2, '–'], A: [1, 'm²'], Ts: [300, 'K'] })); assert.equal(r.field, 'eps'); assert.match(r.error, /between 0 and 1/);
  r = C.compute('convection', 'Q', inp({ h: [10, 'W/m²·K'], A: [2, 'm²'], Ts: [-300, '°C'], Tinf: [20, '°C'] })); assert.match(r.error, /above 0 K/);
  r = C.compute('emission', 'eps', inp({ Q: [1000, 'W'], A: [1, 'm²'], Ts: [300, 'K'] })); assert.match(r.error, /not physical/);
  r = C.compute('net-radiation', 'Tsurr', inp({ Q: [1e6, 'W'], eps: [0.5, '–'], A: [1, 'm²'], Ts: [300, 'K'] })); assert.match(r.error, /No real surroundings/);
  r = C.compute('cylinder', 'r2', inp({ Q: [-100, 'W'], L: [1, 'm'], k: [15, 'W/m·K'], T1: [120, '°C'], T2: [100, '°C'], r1: [5, 'cm'] })); assert.match(r.error, /outer radius/);
  r = C.compute('wall-profile', 'x', inp({ T: [0, '°C'], T1: [100, '°C'], T2: [20, '°C'], L: [0.2, 'm'] })); assert.match(r.error, /larger than the wall thickness/);
});
test('never NaN: random and hostile inputs give a finite result or a message', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vals = ['0', '-0', '1e308', '-5', '0.0001', '1e-300', '3', '400', '-273.15', ''];
  for (const f of C.F) for (const sv of Object.keys(f.vars)) for (let i = 0; i < 60; i++) {
    const given = {}; for (const [n, m] of Object.entries(f.vars)) if (n !== sv) { const units = Object.keys(C.UNITS[m.dim]); given[n] = { value: vals[Math.floor(rnd() * vals.length)], unit: units[Math.floor(rnd() * units.length)] }; }
    const r = C.compute(f.id, sv, given);
    if (r.ok) { assert.ok(Number.isFinite(r.value) && Number.isFinite(r.si), `${f.id}/${sv}`); assert.ok(!/NaN|Infinity/.test(JSON.stringify(r.steps)), `${f.id}/${sv} steps`); }
    else assert.ok(typeof r.error === 'string' && r.error.length > 5 && !/NaN/.test(r.error));
  }
});
test('every calculator points at a real Heat & Mass Transfer card whose equation it implements', () => {
  const book = require('../data/heat-mass-transfer.json');
  const KEY = { 'heat-flux': '\\frac{\\dot Q}{A}', 'flow-energy': '\\dot m\\,c_p\\,\\Delta T', diffusivity: '\\frac{k}{\\rho c_p}', 'plane-wall': 'kA\\frac{T_1-T_2}{L}', convection: 'hA_s\\,(T_s - T_\\infty)', emission: '\\varepsilon\\,\\sigma A_s T_s^4', 'net-radiation': '(T_s^4 - T_\\text{surr}^4)', combined: 'h_\\text{combined}\\,A_s\\,(T_s - T_\\infty)', 'wall-profile': '(T_2 - T_1)\\frac{x}{L}', cylinder: '\\frac{T_1-T_2}{\\ln(r_2/r_1)}', 'gen-surface': '\\frac{\\dot e_\\text{gen}\\,V}{h\\,A_s}', 'dtmax-cylinder': '{4k}', 'dtmax-wall': '{2k}', 'dtmax-sphere': '{6k}' };
  for (const f of C.F) {
    const m = /^c(\d+)-(\d+)$/.exec(f.card), ch = book.chapters.find(c => c.n === Number(m[1])), card = ch.cards[Number(m[2]) - 1];
    assert.equal(ch.n, f.ch); assert.ok(card && card.eq, `${f.id}: card ${f.card} has an equation`);
    assert.ok(card.eq.includes(KEY[f.id]), `${f.id}: card ${f.card} equation contains ${KEY[f.id]}`);
  }
});
