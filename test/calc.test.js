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
  // Chapters 3-5: values from the textbook's own worked examples where one exists
  ['r-wall', 'R', { L: [0.3, 'm'], k: [0.9, 'W/m·K'], A: [15, 'm²'] }, 0.3 / 13.5, 'K/W'], // Example 3–1: 0.02222 °C/W
  ['r-cyl', 'R', { r1: [1.5, 'mm'], r2: [3.5, 'mm'], L: [5, 'm'], k: [0.15, 'W/m·K'] }, Math.log(3.5 / 1.5) / (2 * Math.PI * 0.75), 'K/W'], // Example 3–9: 0.18 °C/W
  ['r-sph', 'R', { r1: [0.1, 'm'], r2: [0.2, 'm'], k: [1, 'W/m·K'] }, 0.1 / (4 * Math.PI * 0.02), 'K/W'],
  ['rcr-cylinder', 'r', { k: [0.15, 'W/m·K'], h: [12, 'W/m²·K'] }, 0.0125, 'm'], // Example 3–9: 12.5 mm
  ['rcr-sphere', 'r', { k: [0.15, 'W/m·K'], h: [12, 'W/m²·K'] }, 0.025, 'm'],
  ['fin-long', 'Q', { h: [25, 'W/m²·K'], p: [0.0157, 'm'], k: [200, 'W/m·K'], Ac: [1.963e-5, 'm²'], Tb: [100, '°C'], Tinf: [20, '°C'] }, Math.sqrt(25 * 0.0157 * 200 * 1.963e-5) * 80, 'W'],
  ['fin-adiabatic', 'Q', { h: [25, 'W/m²·K'], p: [0.0157, 'm'], k: [200, 'W/m·K'], Ac: [1.963e-5, 'm²'], Tb: [100, '°C'], Tinf: [20, '°C'], L: [5, 'cm'] }, Math.sqrt(25 * 0.0157 * 200 * 1.963e-5) * 80 * Math.tanh(0.05 * Math.sqrt(25 * 0.0157 / (200 * 1.963e-5))), 'W'],
  ['fin-efficiency', 'eta', { h: [25, 'W/m²·K'], p: [0.0157, 'm'], k: [200, 'W/m·K'], Ac: [1.963e-5, 'm²'], L: [5, 'cm'] }, (m => Math.tanh(m) / m)(0.05 * Math.sqrt(25 * 0.0157 / (200 * 1.963e-5))), '–'],
  ['biot', 'bi', { h: [210, 'W/m²·K'], Lc: [0.001 / 6, 'm'], k: [35, 'W/m·K'] }, 0.001, '–'], // Example 4–1: Bi = 0.001
  ['lumped', 't', { T: [99, '°C'], Ti: [0, '°C'], Tinf: [100, '°C'], h: [210, 'W/m²·K'], A: [Math.PI * 1e-6, 'm²'], rho: [8500, 'kg/m³'], V: [Math.PI * 1e-9 / 6, 'm³'], cp: [320, 'J/kg·K'] }, Math.log(100) * 8500 * 320 * (0.001 / 6) / 210, 's'], // Example 4–1: ≈ 10 s
  ['mesh-fourier', 'tau', { alpha: [0.45e-6, 'm²/s'], dt: [100, 's'], dx: [1, 'cm'] }, 0.45, '–'],
];
test('Chapter 3–5 calculators reproduce the textbook examples’ printed answers', () => {
  const r = (id, sv, x) => C.compute(id, sv, inp(x)).si;
  assert.ok(Math.abs(r('plane-wall', 'Q', { k: [0.9, 'W/m·K'], A: [15, 'm²'], T1: [16, '°C'], T2: [2, '°C'], L: [0.3, 'm'] }) - 630) < 0.5, 'Example 3–1: 630 W');
  assert.ok(Math.abs(r('r-cyl', 'R', { r1: [1.5, 'mm'], r2: [3.5, 'mm'], L: [5, 'm'], k: [0.15, 'W/m·K'] }) - 0.18) < 0.005, 'Example 3–9: R_plastic ≈ 0.18 °C/W');
  assert.ok(Math.abs(r('lumped', 't', { T: [99, '°C'], Ti: [0, '°C'], Tinf: [100, '°C'], h: [210, 'W/m²·K'], A: [Math.PI * 1e-6, 'm²'], rho: [8500, 'kg/m³'], V: [Math.PI * 1e-9 / 6, 'm³'], cp: [320, 'J/kg·K'] }) - 10) < 0.5, 'Example 4–1: ≈ 10 s');
});
test('lumped and fin calculators refuse impossible requests with a message', () => {
  const lump = { Ti: [0, '°C'], Tinf: [100, '°C'], h: [210, 'W/m²·K'], A: [1e-6, 'm²'], rho: [8500, 'kg/m³'], V: [1e-9, 'm³'], cp: [320, 'J/kg·K'] };
  for (const T of [100, 120, -5]) { const x = C.compute('lumped', 't', inp({ ...lump, T: [T, '°C'] })); assert.ok(!x.ok && /between/.test(x.error), `T=${T}: ${x.error}`); }
  const fin = { h: [25, 'W/m²·K'], p: [0.0157, 'm'], k: [200, 'W/m·K'], Ac: [1.963e-5, 'm²'], Tb: [100, '°C'], Tinf: [20, '°C'] };
  const y = C.compute('fin-adiabatic', 'L', inp({ ...fin, Q: [1000, 'W'] })); assert.ok(!y.ok && /long-fin limit/.test(y.error), y.error);
  const z = C.compute('r-sph', 'r2', inp({ r1: [0.1, 'm'], k: [1, 'W/m·K'], R: [10, 'K/W'] })); assert.ok(!z.ok && /infinitely thick/.test(z.error), z.error);
});
test('at least 10 curated Heat & Mass Transfer formulas, each with metadata, card, equation number', () => {
  assert.ok(C.F.length >= 10);
  for (const f of C.F) {
    assert.match(f.ref, /^Eqs?\. \(\d–\d+\)(, \(\d–\d+\))*$/); assert.match(f.card, /^c\d+-\d+$/);
    for (const [n, m] of Object.entries(f.vars)) assert.ok(m.sym && m.label && C.UNITS[m.dim], `${f.id}.${n} metadata`);
    // Chapters 1-2 calculators solve for every variable; later ones solve only where a closed form exists
    if (f.ch <= 2) for (const n of Object.keys(f.vars)) assert.ok(f.solve[n], `${f.id} solves for ${n}`);
    for (const n of Object.keys(f.solve)) assert.ok(f.vars[n], `${f.id} solve key ${n} is a variable`);
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
    for (const name of Object.keys(f.solve)) {
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
  const book = require('../studydata.js').mergeBookExt(require('../data/heat-mass-transfer.json'), require('../data/heat-mass-transfer-ext.json'));
  const KEY = { 'heat-flux': '\\frac{\\dot Q}{A}', 'flow-energy': '\\dot m\\,c_p\\,\\Delta T', diffusivity: '\\frac{k}{\\rho c_p}', 'plane-wall': 'kA\\frac{T_1-T_2}{L}', convection: 'hA_s\\,(T_s - T_\\infty)', emission: '\\varepsilon\\,\\sigma A_s T_s^4', 'net-radiation': '(T_s^4 - T_\\text{surr}^4)', combined: 'h_\\text{combined}\\,A_s\\,(T_s - T_\\infty)', 'wall-profile': '(T_2 - T_1)\\frac{x}{L}', cylinder: '\\frac{T_1-T_2}{\\ln(r_2/r_1)}', 'gen-surface': '\\frac{\\dot e_\\text{gen}\\,V}{h\\,A_s}', 'dtmax-cylinder': '{4k}', 'dtmax-wall': '{2k}', 'dtmax-sphere': '{6k}',
    'r-wall': 'R_\\text{wall} = \\frac{L}{kA}', 'r-cyl': '\\frac{\\ln(r_2/r_1)}{2\\pi Lk}', 'r-sph': '\\frac{r_2 - r_1}{4\\pi r_1 r_2 k}', 'rcr-cylinder': 'r_\\text{cr,cylinder} = \\frac{k}{h}', 'rcr-sphere': 'r_\\text{cr,sphere} = \\frac{2k}{h}',
    'fin-long': '\\dot Q_\\text{long} = \\sqrt{hpkA_c}', 'fin-adiabatic': '\\tanh mL', 'fin-efficiency': '\\frac{\\tanh mL}{mL}', biot: '\\frac{hL_c}{k}', lumped: 'e^{-bt}', 'mesh-fourier': '\\frac{\\alpha\\,\\Delta t}{\\Delta x^2}' };
  for (const f of C.F) {
    const m = /^c(\d+)-(\d+)$/.exec(f.card), ch = book.chapters.find(c => c.n === Number(m[1])), card = ch.cards[Number(m[2]) - 1];
    assert.equal(ch.n, f.ch); assert.ok(card && card.eq, `${f.id}: card ${f.card} has an equation`);
    assert.ok(card.eq.includes(KEY[f.id]), `${f.id}: card ${f.card} equation contains ${KEY[f.id]}`);
  }
});
