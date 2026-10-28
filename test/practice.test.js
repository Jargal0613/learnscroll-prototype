// Guided practice: data integrity against the textbook-checked values, and the local checks.
const test = require('node:test'), assert = require('node:assert');
const P = require('../practicedata.js'), PC = require('../practicecore.js'), C = require('../calccore.js'), SD = require('../studydata.js');
const book = SD.mergeBookExt(require('../data/heat-mass-transfer.json'), require('../data/heat-mass-transfer-ext.json'));
test('problems: textbook examples only, real cards, valid equations, ids match the stored-data pattern', () => {
  const ids = new Set();
  for (const p of P) {
    assert.match(p.ref, /^Example \d–\d{1,2}$/); assert.equal(p.id, 'ex' + p.ref.slice(8).replace('–', '-')); assert.ok(SD.PRACTICE_RE.test(p.id)); assert.ok(!ids.has(p.id)); ids.add(p.id);
    const m = /^c(\d+)-(\d+)$/.exec(p.card), ch = book.chapters.find(c => c.n === Number(m[1])); assert.ok(ch && ch.cards[Number(m[2]) - 1], `${p.id} card`); assert.equal(ch.n, p.ch);
    for (const e of [...p.equations, ...p.options]) assert.ok(C.byId[e], `${p.id} ${e}`);
    assert.ok(p.equations.every(e => p.options.includes(e)));
    for (const st of SD.PSTEPS) assert.ok(p.hints[st] && p.hints[st].length >= 2, `${p.id} hints ${st}`);
    assert.ok(p.statement.length < 600, 'short paraphrase, not book text');
  }
});
// The textbook's printed answers (checked against the book): each must also come out of our own calculators.
test('answers agree with the calculators', () => {
  const r = (id, sv, inp) => C.compute(id, sv, Object.fromEntries(Object.entries(inp).map(([k, [v, u]]) => [k, { value: String(v), unit: u }])));
  const by = Object.fromEntries(P.map(p => [p.id, p.answer.value]));
  assert.ok(Math.abs(r('flow-energy', 'Q', { m: [7900 * 0.01 * 2 * 0.005, 'kg/s'], cp: [515, 'J/kg·K'], dT: [200, 'K'] }).si - by['ex1-2']) / by['ex1-2'] < 0.01);
  assert.ok(Math.abs(r('plane-wall', 'k', { Q: [22, 'W'], A: [Math.PI * 0.05 ** 2 / 4, 'm²'], T1: [15, 'K'], T2: [0.0001, 'K'], L: [0.03, 'm'] }).si - by['ex1-6']) / by['ex1-6'] < 0.01);
  assert.ok(Math.abs(r('convection', 'h', { Q: [90, 'W'], A: [Math.PI * 0.003 * 2, 'm²'], Ts: [152, '°C'], Tinf: [15, '°C'] }).si - by['ex1-8']) / by['ex1-8'] < 0.01);
  const conv = r('convection', 'Q', { h: [6, 'W/m²·K'], A: [1.6, 'm²'], Ts: [29, '°C'], Tinf: [20, '°C'] }).si, rad = r('net-radiation', 'Q', { eps: [0.95, '–'], A: [1.6, 'm²'], Ts: [29, '°C'], Tsurr: [20, '°C'] }).si;
  assert.ok(Math.abs(conv - 86.4) < 0.01); assert.ok(Math.abs(conv + rad - by['ex1-10']) / by['ex1-10'] < 0.01);
  assert.ok(Math.abs(r('cylinder', 'Q', { L: [20, 'm'], k: [20, 'W/m·K'], T1: [150, '°C'], T2: [60, '°C'], r1: [6, 'cm'], r2: [8, 'cm'] }).si - by['ex2-15']) / by['ex2-15'] < 0.01);
  const e = 2000 / (Math.PI * 0.002 ** 2 * 0.5); const rise = r('dtmax-cylinder', 'dT', { e: [e, 'W/m³'], r: [0.002, 'm'], k: [15, 'W/m·K'] }).si;
  assert.ok(Math.abs(105 + 273.15 + rise - by['ex2-17']) <= 1);
});
test('numeric check: tolerance, unit conversion, factor-of-ten hint, never counts junk as wrong', () => {
  const p = P.find(x => x.id === 'ex1-2');
  assert.equal(PC.checkCalc(p, '81.4', 'kW').ok, true); assert.equal(PC.checkCalc(p, '81370', 'W').ok, true); assert.equal(PC.checkCalc(p, '80', 'kW').ok, true, 'within 2%');
  assert.equal(PC.checkCalc(p, '75', 'kW').ok, false); assert.match(PC.checkCalc(p, '8.14', 'kW').msg, /factor of 10/);
  for (const junk of ['', 'abc', '1,5', 'NaN', 'Infinity']) assert.equal(PC.checkCalc(p, junk, 'kW').ok, null, junk);
  assert.equal(PC.checkCalc(p, '81.4', 'parsec').ok, null);
  const t = P.find(x => x.id === 'ex2-17');
  assert.equal(PC.checkCalc(t, '126', '°C').ok, true); assert.equal(PC.checkCalc(t, '399.4', 'K').ok, true); assert.equal(PC.checkCalc(t, '128', '°C').ok, false, 'temperatures use an absolute tolerance');
});
test('unit and equation checks; struggled steps', () => {
  const p = P.find(x => x.id === 'ex1-6');
  for (const u of ['W/m·K', 'W/(m K)', 'w/mk', 'W/m·°C']) assert.equal(PC.checkUnits(p, u).ok, true, u);
  assert.equal(PC.checkUnits(p, 'W/m²·K').ok, false); assert.equal(PC.checkUnits(p, '  ').ok, null);
  const q = P.find(x => x.id === 'ex1-10');
  assert.equal(PC.checkEquation(q, ['net-radiation', 'convection']).ok, true); assert.equal(PC.checkEquation(q, ['convection']).ok, false); assert.match(PC.checkEquation(q, ['convection']).msg, /Partly/);
  assert.deepEqual(PC.struggled({ attempts: [{ step: 'calculation', ok: false }, { step: 'calculation', ok: false }, { step: 'equation', ok: false }], hints: { units: 1 }, revealed: ['substitution'] }), ['substitution', 'calculation', 'units']);
});

test('Chapter 3–4 examples: answers agree with the calculators and the textbook', () => {
  const r = (id, sv, inp) => C.compute(id, sv, Object.fromEntries(Object.entries(inp).map(([k, [v, u]]) => [k, { value: String(v), unit: u }])));
  const by = Object.fromEntries(P.map(p => [p.id, p]));
  assert.ok(Math.abs(r('plane-wall', 'Q', { k: [0.9, 'W/m·K'], A: [15, 'm²'], T1: [16, '°C'], T2: [2, '°C'], L: [0.3, 'm'] }).si - by['ex3-1'].answer.value) < 1);
  const Rp = r('r-cyl', 'R', { r1: [1.5, 'mm'], r2: [3.5, 'mm'], L: [5, 'm'], k: [0.15, 'W/m·K'] }).si, Rc = 1 / (12 * 2 * Math.PI * 0.0035 * 5);
  assert.ok(Math.abs(303.15 + 80 * (Rp + Rc) - by['ex3-9'].answer.value) <= 1, 'Example 3–9: about 105 °C');
  assert.ok(PC.checkCalc(by['ex3-9'], '105', '°C').ok && !PC.checkCalc(by['ex3-9'], '110', '°C').ok);
  const t = r('lumped', 't', { T: [99, '°C'], Ti: [0, '°C'], Tinf: [100, '°C'], h: [210, 'W/m²·K'], A: [Math.PI * 1e-6, 'm²'], rho: [8500, 'kg/m³'], V: [Math.PI * 1e-9 / 6, 'm³'], cp: [320, 'J/kg·K'] }).si;
  assert.ok(Math.abs(t - 10) / 10 < by['ex4-1'].answer.rel, `Example 4–1: ${t}`);
  assert.ok(PC.checkCalc(by['ex4-1'], '10', 's').ok && PC.checkCalc(by['ex4-1'], '0.166', 'min').ok && !PC.checkCalc(by['ex4-1'], '1', 's').ok);
  assert.ok(PC.checkUnits(by['ex4-1'], 's').ok && PC.checkUnits(by['ex3-1'], 'W').ok);
});
