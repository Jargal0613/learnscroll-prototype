// Calculation workspace core: curated, closed-form calculators for Heat and Mass Transfer equations.
// Each equation was checked against the textbook (Çengel & Ghajar, Heat and Mass Transfer) by its equation number;
// every rearrangement is written out by hand. No symbolic engine, no eval, nothing from user LaTeX is executed.
// Values are converted to SI, checked against explicit ranges, and a result is shown only when it is a finite number.
const CalcCore = (() => {
  const SIGMA = 5.67e-8; // W/m²·K⁴, the value the textbook and the card use
  // unit tables: SI value = v * factor + offset
  const UNITS = {
    T: { K: [1, 0], '°C': [1, 273.15] },             // absolute temperature
    dT: { K: [1, 0], '°C': [1, 0] },                 // temperature difference (1 °C step = 1 K step)
    L: { m: [1, 0], cm: [0.01, 0], mm: [0.001, 0] },
    A: { 'm²': [1, 0], 'cm²': [1e-4, 0], 'mm²': [1e-6, 0] },
    V: { 'm³': [1, 0], L: [1e-3, 0], 'cm³': [1e-6, 0] },
    P: { W: [1, 0], kW: [1e3, 0] },
    q: { 'W/m²': [1, 0], 'kW/m²': [1e3, 0] },
    k: { 'W/m·K': [1, 0] },
    h: { 'W/m²·K': [1, 0] },
    m: { 'kg/s': [1, 0], 'kg/min': [1 / 60, 0], 'kg/h': [1 / 3600, 0] },
    cp: { 'J/kg·K': [1, 0], 'kJ/kg·K': [1e3, 0] },
    rho: { 'kg/m³': [1, 0] },
    alpha: { 'm²/s': [1, 0], 'mm²/s': [1e-6, 0] },
    e: { 'W/m³': [1, 0], 'kW/m³': [1e3, 0], 'MW/m³': [1e6, 0] },
    eps: { '–': [1, 0] },
    nd: { '–': [1, 0] },                             // dimensionless numbers (Bi, τ, η)
    R: { 'K/W': [1, 0] },
    t: { s: [1, 0], min: [60, 0], h: [3600, 0] },
  };
  const SI = { T: 'K', dT: 'K', L: 'm', A: 'm²', V: 'm³', P: 'W', q: 'W/m²', k: 'W/m·K', h: 'W/m²·K', m: 'kg/s', cp: 'J/kg·K', rho: 'kg/m³', alpha: 'm²/s', e: 'W/m³', eps: '–', nd: '–', R: 'K/W', t: 's' };
  // ranges are in SI. gt = strictly greater than; ge = at least; le = at most
  const POS = { gt: 0 }, ABS = { gt: 0, why: 'an absolute temperature must be above 0 K' };
  const v = (sym, label, dim, range, extra) => ({ sym, label, dim, range: range || null, ...(extra || {}) });

  const F = [
    { id: 'heat-flux', card: 'c1-8', ch: 1, ref: 'Eq. (1–8)', title: 'Heat flux', tex: '\\dot q = \\frac{\\dot Q}{A}',
      vars: { q: v('\\dot q', 'Heat flux', 'q'), Q: v('\\dot Q', 'Heat transfer rate', 'P'), A: v('A', 'Area normal to the heat flow', 'A', POS) },
      solve: {
        q: { tex: '\\dot q = \\frac{\\dot Q}{A}', sub: '\\frac{{Q}}{{A}}', fn: x => x.Q / x.A },
        Q: { tex: '\\dot Q = \\dot q\\,A', sub: '{q} \\times {A}', fn: x => x.q * x.A },
        A: { tex: 'A = \\frac{\\dot Q}{\\dot q}', sub: '\\frac{{Q}}{{q}}', fn: x => x.Q / x.q, zero: x => x.q === 0 && 'q̇ is 0, so the area can’t be found (division by zero).' },
      } },
    { id: 'flow-energy', card: 'c1-10', ch: 1, ref: 'Eq. (1–18)', title: 'Steady-flow energy: Q̇ = ṁ cp ΔT', tex: '\\dot Q = \\dot m\\,c_p\\,\\Delta T',
      vars: { Q: v('\\dot Q', 'Heat transfer rate', 'P'), m: v('\\dot m', 'Mass flow rate', 'm', POS), cp: v('c_p', 'Specific heat', 'cp', POS), dT: v('\\Delta T', 'Temperature change of the fluid', 'dT') },
      solve: {
        Q: { tex: '\\dot Q = \\dot m\\,c_p\\,\\Delta T', sub: '{m} \\times {cp} \\times {dT}', fn: x => x.m * x.cp * x.dT },
        m: { tex: '\\dot m = \\frac{\\dot Q}{c_p\\,\\Delta T}', sub: '\\frac{{Q}}{{cp} \\times {dT}}', fn: x => x.Q / (x.cp * x.dT), zero: x => x.dT === 0 && 'ΔT is 0, so the mass flow rate can’t be found (division by zero).' },
        cp: { tex: 'c_p = \\frac{\\dot Q}{\\dot m\\,\\Delta T}', sub: '\\frac{{Q}}{{m} \\times {dT}}', fn: x => x.Q / (x.m * x.dT), zero: x => x.dT === 0 && 'ΔT is 0, so cp can’t be found (division by zero).' },
        dT: { tex: '\\Delta T = \\frac{\\dot Q}{\\dot m\\,c_p}', sub: '\\frac{{Q}}{{m} \\times {cp}}', fn: x => x.Q / (x.m * x.cp) },
      } },
    { id: 'diffusivity', card: 'c1-15', ch: 1, ref: 'Eq. (1–23)', title: 'Thermal diffusivity', tex: '\\alpha = \\frac{k}{\\rho\\,c_p}',
      vars: { alpha: v('\\alpha', 'Thermal diffusivity', 'alpha', POS), k: v('k', 'Thermal conductivity', 'k', POS), rho: v('\\rho', 'Density', 'rho', POS), cp: v('c_p', 'Specific heat', 'cp', POS) },
      solve: {
        alpha: { tex: '\\alpha = \\frac{k}{\\rho\\,c_p}', sub: '\\frac{{k}}{{rho} \\times {cp}}', fn: x => x.k / (x.rho * x.cp) },
        k: { tex: 'k = \\alpha\\,\\rho\\,c_p', sub: '{alpha} \\times {rho} \\times {cp}', fn: x => x.alpha * x.rho * x.cp },
        rho: { tex: '\\rho = \\frac{k}{\\alpha\\,c_p}', sub: '\\frac{{k}}{{alpha} \\times {cp}}', fn: x => x.k / (x.alpha * x.cp) },
        cp: { tex: 'c_p = \\frac{k}{\\alpha\\,\\rho}', sub: '\\frac{{k}}{{alpha} \\times {rho}}', fn: x => x.k / (x.alpha * x.rho) },
      } },
    { id: 'plane-wall', card: 'c1-16', ch: 1, ref: 'Eq. (1–21)', title: 'Conduction through a plane wall', tex: '\\dot Q = kA\\,\\frac{T_1 - T_2}{L}',
      vars: { Q: v('\\dot Q', 'Heat transfer rate', 'P'), k: v('k', 'Thermal conductivity', 'k', POS), A: v('A', 'Wall area', 'A', POS), T1: v('T_1', 'Temperature of one face', 'T', ABS), T2: v('T_2', 'Temperature of the other face', 'T', ABS), L: v('L', 'Wall thickness', 'L', POS) },
      solve: {
        Q: { tex: '\\dot Q = kA\\,\\frac{T_1 - T_2}{L}', sub: '{k} \\times {A} \\times \\frac{{T1} - {T2}}{{L}}', fn: x => x.k * x.A * (x.T1 - x.T2) / x.L },
        k: { tex: 'k = \\frac{\\dot Q\\,L}{A\\,(T_1 - T_2)}', sub: '\\frac{{Q} \\times {L}}{{A} \\times ({T1} - {T2})}', fn: x => x.Q * x.L / (x.A * (x.T1 - x.T2)), zero: x => x.T1 === x.T2 && 'T₁ equals T₂, so there is no temperature difference to divide by.' },
        A: { tex: 'A = \\frac{\\dot Q\\,L}{k\\,(T_1 - T_2)}', sub: '\\frac{{Q} \\times {L}}{{k} \\times ({T1} - {T2})}', fn: x => x.Q * x.L / (x.k * (x.T1 - x.T2)), zero: x => x.T1 === x.T2 && 'T₁ equals T₂, so there is no temperature difference to divide by.' },
        L: { tex: 'L = \\frac{kA\\,(T_1 - T_2)}{\\dot Q}', sub: '\\frac{{k} \\times {A} \\times ({T1} - {T2})}{{Q}}', fn: x => x.k * x.A * (x.T1 - x.T2) / x.Q, zero: x => x.Q === 0 && 'Q̇ is 0, so the thickness can’t be found (division by zero).' },
        T1: { tex: 'T_1 = T_2 + \\frac{\\dot Q\\,L}{kA}', sub: '{T2} + \\frac{{Q} \\times {L}}{{k} \\times {A}}', fn: x => x.T2 + x.Q * x.L / (x.k * x.A) },
        T2: { tex: 'T_2 = T_1 - \\frac{\\dot Q\\,L}{kA}', sub: '{T1} - \\frac{{Q} \\times {L}}{{k} \\times {A}}', fn: x => x.T1 - x.Q * x.L / (x.k * x.A) },
      } },
    { id: 'convection', card: 'c1-17', ch: 1, ref: 'Eq. (1–24)', title: 'Newton’s law of cooling (convection)', tex: '\\dot Q_\\text{conv} = hA_s\\,(T_s - T_\\infty)',
      vars: { Q: v('\\dot Q_\\text{conv}', 'Convection heat transfer rate', 'P'), h: v('h', 'Convection heat transfer coefficient', 'h', POS), A: v('A_s', 'Surface area', 'A', POS), Ts: v('T_s', 'Surface temperature', 'T', ABS), Tinf: v('T_\\infty', 'Fluid temperature far from the surface', 'T', ABS) },
      solve: {
        Q: { tex: '\\dot Q_\\text{conv} = hA_s\\,(T_s - T_\\infty)', sub: '{h} \\times {A} \\times ({Ts} - {Tinf})', fn: x => x.h * x.A * (x.Ts - x.Tinf) },
        h: { tex: 'h = \\frac{\\dot Q_\\text{conv}}{A_s\\,(T_s - T_\\infty)}', sub: '\\frac{{Q}}{{A} \\times ({Ts} - {Tinf})}', fn: x => x.Q / (x.A * (x.Ts - x.Tinf)), zero: x => x.Ts === x.Tinf && 'Tₛ equals T∞, so there is no temperature difference to divide by.' },
        A: { tex: 'A_s = \\frac{\\dot Q_\\text{conv}}{h\\,(T_s - T_\\infty)}', sub: '\\frac{{Q}}{{h} \\times ({Ts} - {Tinf})}', fn: x => x.Q / (x.h * (x.Ts - x.Tinf)), zero: x => x.Ts === x.Tinf && 'Tₛ equals T∞, so there is no temperature difference to divide by.' },
        Ts: { tex: 'T_s = T_\\infty + \\frac{\\dot Q_\\text{conv}}{hA_s}', sub: '{Tinf} + \\frac{{Q}}{{h} \\times {A}}', fn: x => x.Tinf + x.Q / (x.h * x.A) },
        Tinf: { tex: 'T_\\infty = T_s - \\frac{\\dot Q_\\text{conv}}{hA_s}', sub: '{Ts} - \\frac{{Q}}{{h} \\times {A}}', fn: x => x.Ts - x.Q / (x.h * x.A) },
      } },
    { id: 'emission', card: 'c1-19', ch: 1, ref: 'Eq. (1–26)', title: 'Radiation emitted by a real surface', tex: '\\dot Q_\\text{emit} = \\varepsilon\\,\\sigma A_s T_s^4',
      vars: { Q: v('\\dot Q_\\text{emit}', 'Emitted radiation', 'P', { ge: 0 }), eps: v('\\varepsilon', 'Emissivity', 'eps', { gt: 0, le: 1, why: 'emissivity is between 0 and 1' }), A: v('A_s', 'Surface area', 'A', POS), Ts: v('T_s', 'Surface temperature', 'T', ABS) },
      solve: {
        Q: { tex: '\\dot Q_\\text{emit} = \\varepsilon\\,\\sigma A_s T_s^4', sub: '{eps} \\times 5.67\\times10^{-8} \\times {A} \\times {Ts}^4', fn: x => x.eps * SIGMA * x.A * x.Ts ** 4 },
        eps: { tex: '\\varepsilon = \\frac{\\dot Q_\\text{emit}}{\\sigma A_s T_s^4}', sub: '\\frac{{Q}}{5.67\\times10^{-8} \\times {A} \\times {Ts}^4}', fn: x => x.Q / (SIGMA * x.A * x.Ts ** 4) },
        A: { tex: 'A_s = \\frac{\\dot Q_\\text{emit}}{\\varepsilon\\,\\sigma T_s^4}', sub: '\\frac{{Q}}{{eps} \\times 5.67\\times10^{-8} \\times {Ts}^4}', fn: x => x.Q / (x.eps * SIGMA * x.Ts ** 4) },
        Ts: { tex: 'T_s = \\left(\\frac{\\dot Q_\\text{emit}}{\\varepsilon\\,\\sigma A_s}\\right)^{1/4}', sub: '\\left(\\frac{{Q}}{{eps} \\times 5.67\\times10^{-8} \\times {A}}\\right)^{1/4}', fn: x => (x.Q / (x.eps * SIGMA * x.A)) ** 0.25 },
      } },
    { id: 'net-radiation', card: 'c1-20', ch: 1, ref: 'Eq. (1–28)', title: 'Net radiation exchange with large surroundings', tex: '\\dot Q_\\text{rad} = \\varepsilon\\sigma A_s\\,(T_s^4 - T_\\text{surr}^4)',
      vars: { Q: v('\\dot Q_\\text{rad}', 'Net radiation heat transfer rate', 'P'), eps: v('\\varepsilon', 'Emissivity', 'eps', { gt: 0, le: 1, why: 'emissivity is between 0 and 1' }), A: v('A_s', 'Surface area', 'A', POS), Ts: v('T_s', 'Surface temperature', 'T', ABS), Tsurr: v('T_\\text{surr}', 'Temperature of the surroundings', 'T', ABS) },
      solve: {
        Q: { tex: '\\dot Q_\\text{rad} = \\varepsilon\\sigma A_s\\,(T_s^4 - T_\\text{surr}^4)', sub: '{eps} \\times 5.67\\times10^{-8} \\times {A} \\times ({Ts}^4 - {Tsurr}^4)', fn: x => x.eps * SIGMA * x.A * (x.Ts ** 4 - x.Tsurr ** 4) },
        eps: { tex: '\\varepsilon = \\frac{\\dot Q_\\text{rad}}{\\sigma A_s\\,(T_s^4 - T_\\text{surr}^4)}', sub: '\\frac{{Q}}{5.67\\times10^{-8} \\times {A} \\times ({Ts}^4 - {Tsurr}^4)}', fn: x => x.Q / (SIGMA * x.A * (x.Ts ** 4 - x.Tsurr ** 4)), zero: x => x.Ts === x.Tsurr && 'Tₛ equals T_surr, so there is no net exchange to divide by.' },
        A: { tex: 'A_s = \\frac{\\dot Q_\\text{rad}}{\\varepsilon\\sigma\\,(T_s^4 - T_\\text{surr}^4)}', sub: '\\frac{{Q}}{{eps} \\times 5.67\\times10^{-8} \\times ({Ts}^4 - {Tsurr}^4)}', fn: x => x.Q / (x.eps * SIGMA * (x.Ts ** 4 - x.Tsurr ** 4)), zero: x => x.Ts === x.Tsurr && 'Tₛ equals T_surr, so there is no net exchange to divide by.' },
        Ts: { tex: 'T_s = \\left(\\frac{\\dot Q_\\text{rad}}{\\varepsilon\\sigma A_s} + T_\\text{surr}^4\\right)^{1/4}', sub: '\\left(\\frac{{Q}}{{eps} \\times 5.67\\times10^{-8} \\times {A}} + {Tsurr}^4\\right)^{1/4}', fn: x => (x.Q / (x.eps * SIGMA * x.A) + x.Tsurr ** 4) ** 0.25, zero: x => x.Q / (x.eps * SIGMA * x.A) + x.Tsurr ** 4 < 0 && 'No real surface temperature: the surface would lose more than it could emit at 0 K. Check the sign of Q̇.' },
        Tsurr: { tex: 'T_\\text{surr} = \\left(T_s^4 - \\frac{\\dot Q_\\text{rad}}{\\varepsilon\\sigma A_s}\\right)^{1/4}', sub: '\\left({Ts}^4 - \\frac{{Q}}{{eps} \\times 5.67\\times10^{-8} \\times {A}}\\right)^{1/4}', fn: x => (x.Ts ** 4 - x.Q / (x.eps * SIGMA * x.A)) ** 0.25, zero: x => x.Ts ** 4 - x.Q / (x.eps * SIGMA * x.A) < 0 && 'No real surroundings temperature for these values: Q̇ is larger than the surface emits. Check Q̇ and its sign.' },
      } },
    { id: 'combined', card: 'c1-21', ch: 1, ref: 'Eq. (1–29)', title: 'Combined convection and radiation', tex: '\\dot Q_\\text{total} = h_\\text{combined}\\,A_s\\,(T_s - T_\\infty)',
      vars: { Q: v('\\dot Q_\\text{total}', 'Total heat transfer rate', 'P'), hc: v('h_\\text{combined}', 'Combined heat transfer coefficient', 'h', POS), A: v('A_s', 'Surface area', 'A', POS), Ts: v('T_s', 'Surface temperature', 'T', ABS), Tinf: v('T_\\infty', 'Fluid temperature', 'T', ABS) },
      solve: {
        Q: { tex: '\\dot Q_\\text{total} = h_\\text{combined}\\,A_s\\,(T_s - T_\\infty)', sub: '{hc} \\times {A} \\times ({Ts} - {Tinf})', fn: x => x.hc * x.A * (x.Ts - x.Tinf) },
        hc: { tex: 'h_\\text{combined} = \\frac{\\dot Q_\\text{total}}{A_s\\,(T_s - T_\\infty)}', sub: '\\frac{{Q}}{{A} \\times ({Ts} - {Tinf})}', fn: x => x.Q / (x.A * (x.Ts - x.Tinf)), zero: x => x.Ts === x.Tinf && 'Tₛ equals T∞, so there is no temperature difference to divide by.' },
        A: { tex: 'A_s = \\frac{\\dot Q_\\text{total}}{h_\\text{combined}\\,(T_s - T_\\infty)}', sub: '\\frac{{Q}}{{hc} \\times ({Ts} - {Tinf})}', fn: x => x.Q / (x.hc * (x.Ts - x.Tinf)), zero: x => x.Ts === x.Tinf && 'Tₛ equals T∞, so there is no temperature difference to divide by.' },
        Ts: { tex: 'T_s = T_\\infty + \\frac{\\dot Q_\\text{total}}{h_\\text{combined}\\,A_s}', sub: '{Tinf} + \\frac{{Q}}{{hc} \\times {A}}', fn: x => x.Tinf + x.Q / (x.hc * x.A) },
        Tinf: { tex: 'T_\\infty = T_s - \\frac{\\dot Q_\\text{total}}{h_\\text{combined}\\,A_s}', sub: '{Ts} - \\frac{{Q}}{{hc} \\times {A}}', fn: x => x.Ts - x.Q / (x.hc * x.A) },
      } },
    { id: 'wall-profile', card: 'c2-16', ch: 2, ref: 'Eq. (2–56)', title: 'Temperature in a plane wall (steady, no generation)', tex: 'T(x) = T_1 + (T_2 - T_1)\\,\\frac{x}{L}',
      post: x => x.x > x.L && 'x is larger than the wall thickness L; the profile only holds inside the wall (0 ≤ x ≤ L).',
      vars: { T: v('T(x)', 'Temperature at position x', 'T', ABS), T1: v('T_1', 'Temperature at x = 0', 'T', ABS), T2: v('T_2', 'Temperature at x = L', 'T', ABS), x: v('x', 'Position in the wall', 'L', { ge: 0 }), L: v('L', 'Wall thickness', 'L', POS) },
      solve: {
        T: { tex: 'T(x) = T_1 + (T_2 - T_1)\\,\\frac{x}{L}', sub: '{T1} + ({T2} - {T1}) \\times \\frac{{x}}{{L}}', fn: x => x.T1 + (x.T2 - x.T1) * x.x / x.L },
        T1: { tex: 'T_1 = \\frac{T(x) - T_2\\,x/L}{1 - x/L}', sub: '\\frac{{T} - {T2} \\times {x}/{L}}{1 - {x}/{L}}', fn: x => (x.T - x.T2 * x.x / x.L) / (1 - x.x / x.L), zero: x => x.x === x.L && 'x equals L: at that face T(x) = T₂, so T₁ can’t be found from it.' },
        T2: { tex: 'T_2 = T_1 + (T(x) - T_1)\\,\\frac{L}{x}', sub: '{T1} + ({T} - {T1}) \\times \\frac{{L}}{{x}}', fn: x => x.T1 + (x.T - x.T1) * x.L / x.x, zero: x => x.x === 0 && 'x is 0: at that face T(x) = T₁, so T₂ can’t be found from it.' },
        x: { tex: 'x = L\\,\\frac{T(x) - T_1}{T_2 - T_1}', sub: '{L} \\times \\frac{{T} - {T1}}{{T2} - {T1}}', fn: x => x.L * (x.T - x.T1) / (x.T2 - x.T1), zero: x => x.T2 === x.T1 && 'T₁ equals T₂: the wall is at one temperature, so no single position can be found.' },
        L: { tex: 'L = x\\,\\frac{T_2 - T_1}{T(x) - T_1}', sub: '{x} \\times \\frac{{T2} - {T1}}{{T} - {T1}}', fn: x => x.x * (x.T2 - x.T1) / (x.T - x.T1), zero: x => x.T === x.T1 && 'T(x) equals T₁, so L can’t be found (division by zero).' },
      } },
    { id: 'cylinder', card: 'c2-17', ch: 2, ref: 'Eq. (2–59)', title: 'Conduction through a cylindrical layer', tex: '\\dot Q_\\text{cyl} = 2\\pi L k\\,\\frac{T_1 - T_2}{\\ln(r_2/r_1)}',
      post: x => !(x.r2 > x.r1) && 'The outer radius r₂ must be larger than the inner radius r₁ (check the sign of Q̇ against T₁ − T₂).',
      vars: { Q: v('\\dot Q_\\text{cyl}', 'Heat transfer rate', 'P'), L: v('L', 'Cylinder length', 'L', POS), k: v('k', 'Thermal conductivity', 'k', POS), T1: v('T_1', 'Inner surface temperature', 'T', ABS), T2: v('T_2', 'Outer surface temperature', 'T', ABS), r1: v('r_1', 'Inner radius', 'L', POS), r2: v('r_2', 'Outer radius', 'L', POS) },
      solve: {
        Q: { tex: '\\dot Q_\\text{cyl} = 2\\pi L k\\,\\frac{T_1 - T_2}{\\ln(r_2/r_1)}', sub: '2\\pi \\times {L} \\times {k} \\times \\frac{{T1} - {T2}}{\\ln({r2}/{r1})}', fn: x => 2 * Math.PI * x.L * x.k * (x.T1 - x.T2) / Math.log(x.r2 / x.r1), zero: x => x.r2 === x.r1 && 'r₁ equals r₂: the layer has no thickness (ln 1 = 0).' },
        k: { tex: 'k = \\frac{\\dot Q_\\text{cyl}\\,\\ln(r_2/r_1)}{2\\pi L\\,(T_1 - T_2)}', sub: '\\frac{{Q} \\times \\ln({r2}/{r1})}{2\\pi \\times {L} \\times ({T1} - {T2})}', fn: x => x.Q * Math.log(x.r2 / x.r1) / (2 * Math.PI * x.L * (x.T1 - x.T2)), zero: x => x.T1 === x.T2 && 'T₁ equals T₂, so there is no temperature difference to divide by.' },
        L: { tex: 'L = \\frac{\\dot Q_\\text{cyl}\\,\\ln(r_2/r_1)}{2\\pi k\\,(T_1 - T_2)}', sub: '\\frac{{Q} \\times \\ln({r2}/{r1})}{2\\pi \\times {k} \\times ({T1} - {T2})}', fn: x => x.Q * Math.log(x.r2 / x.r1) / (2 * Math.PI * x.k * (x.T1 - x.T2)), zero: x => x.T1 === x.T2 && 'T₁ equals T₂, so there is no temperature difference to divide by.' },
        T1: { tex: 'T_1 = T_2 + \\frac{\\dot Q_\\text{cyl}\\,\\ln(r_2/r_1)}{2\\pi L k}', sub: '{T2} + \\frac{{Q} \\times \\ln({r2}/{r1})}{2\\pi \\times {L} \\times {k}}', fn: x => x.T2 + x.Q * Math.log(x.r2 / x.r1) / (2 * Math.PI * x.L * x.k) },
        T2: { tex: 'T_2 = T_1 - \\frac{\\dot Q_\\text{cyl}\\,\\ln(r_2/r_1)}{2\\pi L k}', sub: '{T1} - \\frac{{Q} \\times \\ln({r2}/{r1})}{2\\pi \\times {L} \\times {k}}', fn: x => x.T1 - x.Q * Math.log(x.r2 / x.r1) / (2 * Math.PI * x.L * x.k) },
        r2: { tex: 'r_2 = r_1\\,\\exp\\!\\left(\\frac{2\\pi L k\\,(T_1 - T_2)}{\\dot Q_\\text{cyl}}\\right)', sub: '{r1} \\times \\exp\\!\\left(\\frac{2\\pi \\times {L} \\times {k} \\times ({T1} - {T2})}{{Q}}\\right)', fn: x => x.r1 * Math.exp(2 * Math.PI * x.L * x.k * (x.T1 - x.T2) / x.Q), zero: x => x.Q === 0 && 'Q̇ is 0, so the radius can’t be found (division by zero).' },
        r1: { tex: 'r_1 = r_2\\,\\exp\\!\\left(-\\frac{2\\pi L k\\,(T_1 - T_2)}{\\dot Q_\\text{cyl}}\\right)', sub: '{r2} \\times \\exp\\!\\left(-\\frac{2\\pi \\times {L} \\times {k} \\times ({T1} - {T2})}{{Q}}\\right)', fn: x => x.r2 * Math.exp(-2 * Math.PI * x.L * x.k * (x.T1 - x.T2) / x.Q), zero: x => x.Q === 0 && 'Q̇ is 0, so the radius can’t be found (division by zero).' },
      } },
    { id: 'gen-surface', card: 'c2-18', ch: 2, ref: 'Eq. (2–66)', title: 'Surface temperature of a solid with heat generation', tex: 'T_s = T_\\infty + \\frac{\\dot e_\\text{gen}\\,V}{h\\,A_s}',
      vars: { Ts: v('T_s', 'Surface temperature', 'T', ABS), Tinf: v('T_\\infty', 'Surrounding fluid temperature', 'T', ABS), e: v('\\dot e_\\text{gen}', 'Heat generation per unit volume', 'e'), V: v('V', 'Volume of the solid', 'V', POS), h: v('h', 'Convection heat transfer coefficient', 'h', POS), A: v('A_s', 'Surface area', 'A', POS) },
      solve: {
        Ts: { tex: 'T_s = T_\\infty + \\frac{\\dot e_\\text{gen}\\,V}{h\\,A_s}', sub: '{Tinf} + \\frac{{e} \\times {V}}{{h} \\times {A}}', fn: x => x.Tinf + x.e * x.V / (x.h * x.A) },
        Tinf: { tex: 'T_\\infty = T_s - \\frac{\\dot e_\\text{gen}\\,V}{h\\,A_s}', sub: '{Ts} - \\frac{{e} \\times {V}}{{h} \\times {A}}', fn: x => x.Ts - x.e * x.V / (x.h * x.A) },
        e: { tex: '\\dot e_\\text{gen} = \\frac{h\\,A_s\\,(T_s - T_\\infty)}{V}', sub: '\\frac{{h} \\times {A} \\times ({Ts} - {Tinf})}{{V}}', fn: x => x.h * x.A * (x.Ts - x.Tinf) / x.V },
        V: { tex: 'V = \\frac{h\\,A_s\\,(T_s - T_\\infty)}{\\dot e_\\text{gen}}', sub: '\\frac{{h} \\times {A} \\times ({Ts} - {Tinf})}{{e}}', fn: x => x.h * x.A * (x.Ts - x.Tinf) / x.e, zero: x => x.e === 0 && 'ė_gen is 0, so the volume can’t be found (division by zero).' },
        h: { tex: 'h = \\frac{\\dot e_\\text{gen}\\,V}{A_s\\,(T_s - T_\\infty)}', sub: '\\frac{{e} \\times {V}}{{A} \\times ({Ts} - {Tinf})}', fn: x => x.e * x.V / (x.A * (x.Ts - x.Tinf)), zero: x => x.Ts === x.Tinf && 'Tₛ equals T∞, so there is no temperature difference to divide by.' },
        A: { tex: 'A_s = \\frac{\\dot e_\\text{gen}\\,V}{h\\,(T_s - T_\\infty)}', sub: '\\frac{{e} \\times {V}}{{h} \\times ({Ts} - {Tinf})}', fn: x => x.e * x.V / (x.h * (x.Ts - x.Tinf)), zero: x => x.Ts === x.Tinf && 'Tₛ equals T∞, so there is no temperature difference to divide by.' },
      } },
  ];
  // maximum temperature rise with uniform generation: one calculator per geometry (same card, Eqs. 2–71, 2–73, 2–74)
  for (const [id, name, ref, n, sizeSym, sizeLabel] of [['dtmax-cylinder', 'long solid cylinder', 'Eq. (2–71)', 4, 'r_o', 'Outer radius'], ['dtmax-wall', 'plane wall (thickness 2L)', 'Eq. (2–73)', 2, 'L', 'Half-thickness L'], ['dtmax-sphere', 'solid sphere', 'Eq. (2–74)', 6, 'r_o', 'Outer radius']]) {
    F.push({ id, card: 'c2-19', ch: 2, ref, title: `Maximum temperature rise: ${name}`, tex: `\\Delta T_\\text{max} = \\frac{\\dot e_\\text{gen}\\,${sizeSym}^2}{${n}k}`,
      vars: { dT: v('\\Delta T_\\text{max}', 'Centre-to-surface temperature rise', 'dT', { ge: 0 }), e: v('\\dot e_\\text{gen}', 'Heat generation per unit volume', 'e', { ge: 0 }), r: v(sizeSym, sizeLabel, 'L', POS), k: v('k', 'Thermal conductivity', 'k', POS) },
      solve: {
        dT: { tex: `\\Delta T_\\text{max} = \\frac{\\dot e_\\text{gen}\\,${sizeSym}^2}{${n}k}`, sub: `\\frac{{e} \\times {r}^2}{${n} \\times {k}}`, fn: x => x.e * x.r ** 2 / (n * x.k) },
        e: { tex: `\\dot e_\\text{gen} = \\frac{${n}k\\,\\Delta T_\\text{max}}{${sizeSym}^2}`, sub: `\\frac{${n} \\times {k} \\times {dT}}{{r}^2}`, fn: x => n * x.k * x.dT / x.r ** 2 },
        r: { tex: `${sizeSym} = \\sqrt{\\frac{${n}k\\,\\Delta T_\\text{max}}{\\dot e_\\text{gen}}}`, sub: `\\sqrt{\\frac{${n} \\times {k} \\times {dT}}{{e}}}`, fn: x => Math.sqrt(n * x.k * x.dT / x.e), zero: x => x.e === 0 && 'ė_gen is 0, so there is no temperature rise to size from (division by zero).' },
        k: { tex: `k = \\frac{\\dot e_\\text{gen}\\,${sizeSym}^2}{${n}\\,\\Delta T_\\text{max}}`, sub: `\\frac{{e} \\times {r}^2}{${n} \\times {dT}}`, fn: x => x.e * x.r ** 2 / (n * x.dT), zero: x => x.dT === 0 && 'ΔT_max is 0, so k can’t be found (division by zero).' },
      } });
  }
  // ---- Chapters 3-5 (checked against the textbook by equation number; see test/calc.test.js) ----
  const PI = Math.PI;
  F.push(
    { id: 'r-wall', card: 'c3-2', ch: 3, ref: 'Eq. (3–5)', title: 'Thermal resistance of a plane wall', tex: 'R_\\text{wall} = \\frac{L}{kA}',
      vars: { R: v('R_\\text{wall}', 'Conduction resistance', 'R', POS), L: v('L', 'Wall thickness', 'L', POS), k: v('k', 'Thermal conductivity', 'k', POS), A: v('A', 'Wall area', 'A', POS) },
      solve: {
        R: { tex: 'R_\\text{wall} = \\frac{L}{kA}', sub: '\\frac{{L}}{{k} \\times {A}}', fn: x => x.L / (x.k * x.A) },
        L: { tex: 'L = R_\\text{wall}\\,kA', sub: '{R} \\times {k} \\times {A}', fn: x => x.R * x.k * x.A },
        k: { tex: 'k = \\frac{L}{R_\\text{wall}A}', sub: '\\frac{{L}}{{R} \\times {A}}', fn: x => x.L / (x.R * x.A) },
        A: { tex: 'A = \\frac{L}{R_\\text{wall}k}', sub: '\\frac{{L}}{{R} \\times {k}}', fn: x => x.L / (x.R * x.k) },
      } },
    { id: 'r-cyl', short: 'cylinder', card: 'c3-8', ch: 3, ref: 'Eq. (3–39)', title: 'Thermal resistance of a cylindrical layer', tex: 'R_\\text{cyl} = \\frac{\\ln(r_2/r_1)}{2\\pi L k}',
      post: x => !(x.r2 > x.r1) && 'The outer radius r₂ must be larger than the inner radius r₁.',
      vars: { R: v('R_\\text{cyl}', 'Conduction resistance', 'R', POS), r1: v('r_1', 'Inner radius', 'L', POS), r2: v('r_2', 'Outer radius', 'L', POS), L: v('L', 'Length', 'L', POS), k: v('k', 'Thermal conductivity', 'k', POS) },
      solve: {
        R: { tex: 'R_\\text{cyl} = \\frac{\\ln(r_2/r_1)}{2\\pi L k}', sub: '\\frac{\\ln({r2}/{r1})}{2\\pi \\times {L} \\times {k}}', fn: x => Math.log(x.r2 / x.r1) / (2 * PI * x.L * x.k) },
        k: { tex: 'k = \\frac{\\ln(r_2/r_1)}{2\\pi L\\,R_\\text{cyl}}', sub: '\\frac{\\ln({r2}/{r1})}{2\\pi \\times {L} \\times {R}}', fn: x => Math.log(x.r2 / x.r1) / (2 * PI * x.L * x.R) },
        L: { tex: 'L = \\frac{\\ln(r_2/r_1)}{2\\pi k\\,R_\\text{cyl}}', sub: '\\frac{\\ln({r2}/{r1})}{2\\pi \\times {k} \\times {R}}', fn: x => Math.log(x.r2 / x.r1) / (2 * PI * x.k * x.R) },
        r2: { tex: 'r_2 = r_1\\,e^{2\\pi L k R_\\text{cyl}}', sub: '{r1} \\times e^{2\\pi \\times {L} \\times {k} \\times {R}}', fn: x => x.r1 * Math.exp(2 * PI * x.L * x.k * x.R) },
        r1: { tex: 'r_1 = r_2\\,e^{-2\\pi L k R_\\text{cyl}}', sub: '{r2} \\times e^{-2\\pi \\times {L} \\times {k} \\times {R}}', fn: x => x.r2 * Math.exp(-2 * PI * x.L * x.k * x.R) },
      } },
    { id: 'r-sph', short: 'sphere', card: 'c3-8', ch: 3, ref: 'Eq. (3–41)', title: 'Thermal resistance of a spherical shell', tex: 'R_\\text{sph} = \\frac{r_2 - r_1}{4\\pi r_1 r_2 k}',
      post: x => !(x.r2 > x.r1) && 'The outer radius r₂ must be larger than the inner radius r₁.',
      vars: { R: v('R_\\text{sph}', 'Conduction resistance', 'R', POS), r1: v('r_1', 'Inner radius', 'L', POS), r2: v('r_2', 'Outer radius', 'L', POS), k: v('k', 'Thermal conductivity', 'k', POS) },
      solve: {
        R: { tex: 'R_\\text{sph} = \\frac{r_2 - r_1}{4\\pi r_1 r_2 k}', sub: '\\frac{{r2} - {r1}}{4\\pi \\times {r1} \\times {r2} \\times {k}}', fn: x => (x.r2 - x.r1) / (4 * PI * x.r1 * x.r2 * x.k) },
        k: { tex: 'k = \\frac{r_2 - r_1}{4\\pi r_1 r_2 R_\\text{sph}}', sub: '\\frac{{r2} - {r1}}{4\\pi \\times {r1} \\times {r2} \\times {R}}', fn: x => (x.r2 - x.r1) / (4 * PI * x.r1 * x.r2 * x.R) },
        r2: { tex: 'r_2 = \\frac{r_1}{1 - 4\\pi k r_1 R_\\text{sph}}', sub: '\\frac{{r1}}{1 - 4\\pi \\times {k} \\times {r1} \\times {R}}', fn: x => x.r1 / (1 - 4 * PI * x.k * x.r1 * x.R), zero: x => !(1 - 4 * PI * x.k * x.r1 * x.R > 0) && 'No outer radius gives this much resistance: even an infinitely thick shell has R = 1/(4πk r₁).' },
        r1: { tex: 'r_1 = \\frac{r_2}{1 + 4\\pi k r_2 R_\\text{sph}}', sub: '\\frac{{r2}}{1 + 4\\pi \\times {k} \\times {r2} \\times {R}}', fn: x => x.r2 / (1 + 4 * PI * x.k * x.r2 * x.R) },
      } },
  );
  for (const [id, n, ref, geo] of [['rcr-cylinder', 1, 'Eq. (3–50)', 'cylinder'], ['rcr-sphere', 2, 'Eq. (3–51)', 'sphere']]) {
    const c = n === 1 ? '' : '2';
    F.push({ id, card: 'c3-10', ch: 3, ref, title: `Critical radius of insulation: ${geo}`, tex: `r_\\text{cr,${geo}} = \\frac{${c}k}{h}`,
      vars: { r: v(`r_\\text{cr}`, 'Critical outer radius', 'L', POS), k: v('k', 'Conductivity of the insulation', 'k', POS), h: v('h', 'Outer convection coefficient', 'h', POS) },
      solve: {
        r: { tex: `r_\\text{cr} = \\frac{${c}k}{h}`, sub: `\\frac{${n === 1 ? '' : '2 \\times '}{k}}{{h}}`, fn: x => n * x.k / x.h },
        k: { tex: n === 1 ? 'k = h\\,r_\\text{cr}' : 'k = \\frac{h\\,r_\\text{cr}}{2}', sub: n === 1 ? '{h} \\times {r}' : '\\frac{{h} \\times {r}}{2}', fn: x => x.h * x.r / n },
        h: { tex: `h = \\frac{${c}k}{r_\\text{cr}}`, sub: `\\frac{${n === 1 ? '' : '2 \\times '}{k}}{{r}}`, fn: x => n * x.k / x.r },
      } });
  }
  const finVars = { Q: v('\\dot Q_\\text{fin}', 'Heat transfer rate from the fin', 'P'), h: v('h', 'Convection coefficient', 'h', POS), p: v('p', 'Fin perimeter', 'L', POS), k: v('k', 'Fin conductivity', 'k', POS), Ac: v('A_c', 'Fin cross-sectional area', 'A', POS), Tb: v('T_b', 'Fin base temperature', 'T', ABS), Tinf: v('T_\\infty', 'Fluid temperature', 'T', ABS) };
  F.push(
    { id: 'fin-long', short: 'long fin', card: 'c3-12', ch: 3, ref: 'Eq. (3–61)', title: 'Very long fin', tex: '\\dot Q_\\text{long fin} = \\sqrt{hpkA_c}\\,(T_b - T_\\infty)',
      vars: finVars,
      solve: {
        Q: { tex: '\\dot Q = \\sqrt{hpkA_c}\\,(T_b - T_\\infty)', sub: '\\sqrt{{h} \\times {p} \\times {k} \\times {Ac}} \\times ({Tb} - {Tinf})', fn: x => Math.sqrt(x.h * x.p * x.k * x.Ac) * (x.Tb - x.Tinf) },
        Tb: { tex: 'T_b = T_\\infty + \\frac{\\dot Q}{\\sqrt{hpkA_c}}', sub: '{Tinf} + \\frac{{Q}}{\\sqrt{{h} \\times {p} \\times {k} \\times {Ac}}}', fn: x => x.Tinf + x.Q / Math.sqrt(x.h * x.p * x.k * x.Ac) },
        h: { tex: 'h = \\frac{1}{pkA_c}\\left(\\frac{\\dot Q}{T_b - T_\\infty}\\right)^2', sub: '\\frac{1}{{p} \\times {k} \\times {Ac}} \\left(\\frac{{Q}}{{Tb} - {Tinf}}\\right)^2', fn: x => (x.Q / (x.Tb - x.Tinf)) ** 2 / (x.p * x.k * x.Ac), zero: x => x.Tb === x.Tinf && 'T_b equals T∞, so there is no temperature difference to divide by.' },
        k: { tex: 'k = \\frac{1}{hpA_c}\\left(\\frac{\\dot Q}{T_b - T_\\infty}\\right)^2', sub: '\\frac{1}{{h} \\times {p} \\times {Ac}} \\left(\\frac{{Q}}{{Tb} - {Tinf}}\\right)^2', fn: x => (x.Q / (x.Tb - x.Tinf)) ** 2 / (x.h * x.p * x.Ac), zero: x => x.Tb === x.Tinf && 'T_b equals T∞, so there is no temperature difference to divide by.' },
      } },
    { id: 'fin-adiabatic', short: 'adiabatic tip', card: 'c3-12', ch: 3, ref: 'Eq. (3–65)', title: 'Fin with an adiabatic (insulated) tip', tex: '\\dot Q = \\sqrt{hpkA_c}\\,(T_b - T_\\infty)\\tanh mL,\\quad m = \\sqrt{\\frac{hp}{kA_c}}',
      vars: { ...finVars, L: v('L', 'Fin length (use L_c to include tip convection)', 'L', POS) },
      solve: {
        Q: { tex: '\\dot Q = \\sqrt{hpkA_c}\\,(T_b - T_\\infty)\\tanh\\!\\left(L\\sqrt{\\tfrac{hp}{kA_c}}\\right)', sub: '\\sqrt{{h} \\times {p} \\times {k} \\times {Ac}} \\times ({Tb} - {Tinf}) \\times \\tanh\\!\\left({L}\\sqrt{\\tfrac{{h} \\times {p}}{{k} \\times {Ac}}}\\right)', fn: x => Math.sqrt(x.h * x.p * x.k * x.Ac) * (x.Tb - x.Tinf) * Math.tanh(x.L * Math.sqrt(x.h * x.p / (x.k * x.Ac))) },
        Tb: { tex: 'T_b = T_\\infty + \\frac{\\dot Q}{\\sqrt{hpkA_c}\\,\\tanh mL}', sub: '{Tinf} + \\frac{{Q}}{\\sqrt{{h} \\times {p} \\times {k} \\times {Ac}}\\,\\tanh\\!\\left({L}\\sqrt{\\tfrac{{h} \\times {p}}{{k} \\times {Ac}}}\\right)}', fn: x => x.Tinf + x.Q / (Math.sqrt(x.h * x.p * x.k * x.Ac) * Math.tanh(x.L * Math.sqrt(x.h * x.p / (x.k * x.Ac)))) },
        L: { tex: 'L = \\frac{1}{m}\\,\\operatorname{artanh}\\!\\left(\\frac{\\dot Q}{\\sqrt{hpkA_c}\\,(T_b - T_\\infty)}\\right)', sub: '\\sqrt{\\tfrac{{k} \\times {Ac}}{{h} \\times {p}}}\\;\\operatorname{artanh}\\!\\left(\\frac{{Q}}{\\sqrt{{h} \\times {p} \\times {k} \\times {Ac}} \\times ({Tb} - {Tinf})}\\right)', fn: x => { const r = x.Q / (Math.sqrt(x.h * x.p * x.k * x.Ac) * (x.Tb - x.Tinf)); return r > 0 && r < 1 ? Math.atanh(r) / Math.sqrt(x.h * x.p / (x.k * x.Ac)) : NaN; }, zero: x => { const r = x.Q / (Math.sqrt(x.h * x.p * x.k * x.Ac) * (x.Tb - x.Tinf)); return !(r > 0 && r < 1) && 'No fin length gives this heat rate: it must be positive and below the very-long-fin limit √(hpkA_c)(T_b − T∞).'; } },
      } },
    { id: 'fin-efficiency', card: 'c3-14', ch: 3, ref: 'Eq. (3–77)', title: 'Efficiency of a fin with an adiabatic tip', tex: '\\eta_\\text{fin} = \\frac{\\tanh mL}{mL},\\quad m = \\sqrt{\\frac{hp}{kA_c}}',
      vars: { eta: v('\\eta_\\text{fin}', 'Fin efficiency', 'nd', { gt: 0, le: 1 }), h: finVars.h, p: finVars.p, k: finVars.k, Ac: finVars.Ac, L: v('L', 'Fin length (L_c to include tip convection)', 'L', POS) },
      solve: { eta: { tex: '\\eta_\\text{fin} = \\frac{\\tanh mL}{mL},\\ \\ mL = L\\sqrt{\\tfrac{hp}{kA_c}}', sub: '\\frac{\\tanh\\left({L}\\sqrt{\\tfrac{{h} \\times {p}}{{k} \\times {Ac}}}\\right)}{{L}\\sqrt{\\tfrac{{h} \\times {p}}{{k} \\times {Ac}}}}', fn: x => { const mL = x.L * Math.sqrt(x.h * x.p / (x.k * x.Ac)); return Math.tanh(mL) / mL; } } } },
    { id: 'biot', card: 'c4-2', ch: 4, ref: 'Eq. (4–9)', title: 'Biot number', tex: '\\mathrm{Bi} = \\frac{hL_c}{k},\\quad L_c = \\frac{V}{A_s}',
      vars: { bi: v('\\mathrm{Bi}', 'Biot number', 'nd', POS), h: v('h', 'Convection coefficient', 'h', POS), Lc: v('L_c', 'Characteristic length V/A_s', 'L', POS), k: v('k', 'Conductivity of the body', 'k', POS) },
      solve: {
        bi: { tex: '\\mathrm{Bi} = \\frac{hL_c}{k}', sub: '\\frac{{h} \\times {Lc}}{{k}}', fn: x => x.h * x.Lc / x.k },
        h: { tex: 'h = \\frac{\\mathrm{Bi}\\,k}{L_c}', sub: '\\frac{{bi} \\times {k}}{{Lc}}', fn: x => x.bi * x.k / x.Lc },
        Lc: { tex: 'L_c = \\frac{\\mathrm{Bi}\\,k}{h}', sub: '\\frac{{bi} \\times {k}}{{h}}', fn: x => x.bi * x.k / x.h },
        k: { tex: 'k = \\frac{hL_c}{\\mathrm{Bi}}', sub: '\\frac{{h} \\times {Lc}}{{bi}}', fn: x => x.h * x.Lc / x.bi },
      } },
    { id: 'lumped', card: 'c4-1', ch: 4, ref: 'Eqs. (4–4), (4–5)', title: 'Lumped system: temperature after time t', tex: '\\frac{T(t) - T_\\infty}{T_i - T_\\infty} = e^{-bt},\\quad b = \\frac{hA_s}{\\rho V c_p}',
      note: 'Valid only when Bi ≤ 0.1 (check with the Biot number calculator).',
      vars: { T: v('T(t)', 'Body temperature at time t', 'T', ABS), Ti: v('T_i', 'Initial temperature', 'T', ABS), Tinf: v('T_\\infty', 'Fluid temperature', 'T', ABS), t: v('t', 'Time', 't', { ge: 0 }), h: v('h', 'Convection coefficient', 'h', POS), A: v('A_s', 'Surface area', 'A', POS), rho: v('\\rho', 'Density', 'rho', POS), V: v('V', 'Volume', 'V', POS), cp: v('c_p', 'Specific heat', 'cp', POS) },
      solve: {
        T: { tex: 'T(t) = T_\\infty + (T_i - T_\\infty)\\,e^{-\\frac{hA_s}{\\rho V c_p}t}', sub: '{Tinf} + ({Ti} - {Tinf})\\,\\exp\\!\\left(-\\frac{{h} \\times {A}}{{rho} \\times {V} \\times {cp}} \\times {t}\\right)', fn: x => x.Tinf + (x.Ti - x.Tinf) * Math.exp(-x.h * x.A / (x.rho * x.V * x.cp) * x.t) },
        t: { tex: 't = -\\frac{\\rho V c_p}{hA_s}\\,\\ln\\frac{T(t) - T_\\infty}{T_i - T_\\infty}', sub: '-\\frac{{rho} \\times {V} \\times {cp}}{{h} \\times {A}}\\,\\ln\\frac{{T} - {Tinf}}{{Ti} - {Tinf}}', fn: x => -(x.rho * x.V * x.cp) / (x.h * x.A) * Math.log((x.T - x.Tinf) / (x.Ti - x.Tinf)), zero: x => { const r = (x.T - x.Tinf) / (x.Ti - x.Tinf); return (x.Ti === x.Tinf && 'Tᵢ equals T∞: the body is already at the fluid temperature.') || (!(r > 0 && r <= 1) && 'T(t) must lie between Tᵢ and T∞ (a lumped body approaches T∞ but never reaches or passes it).'); } },
        h: { tex: 'h = -\\frac{\\rho V c_p}{A_s\\,t}\\,\\ln\\frac{T(t) - T_\\infty}{T_i - T_\\infty}', sub: '-\\frac{{rho} \\times {V} \\times {cp}}{{A} \\times {t}}\\,\\ln\\frac{{T} - {Tinf}}{{Ti} - {Tinf}}', fn: x => -(x.rho * x.V * x.cp) / (x.A * x.t) * Math.log((x.T - x.Tinf) / (x.Ti - x.Tinf)), zero: x => { const r = (x.T - x.Tinf) / (x.Ti - x.Tinf); return (x.t === 0 && 't is 0, so h can’t be found (division by zero).') || (x.Ti === x.Tinf && 'Tᵢ equals T∞: the body is already at the fluid temperature.') || (!(r > 0 && r < 1) && 'T(t) must lie strictly between Tᵢ and T∞.'); } },
      } },
    { id: 'mesh-fourier', card: 'c5-9', ch: 5, ref: 'Eq. (5–44)', title: 'Mesh Fourier number (explicit stability: τ ≤ 1/2 in 1-D, Eq. 5–52)', tex: '\\tau = \\frac{\\alpha\\,\\Delta t}{\\Delta x^2}',
      vars: { tau: v('\\tau', 'Mesh Fourier number', 'nd', POS), alpha: v('\\alpha', 'Thermal diffusivity', 'alpha', POS), dt: v('\\Delta t', 'Time step', 't', POS), dx: v('\\Delta x', 'Node spacing', 'L', POS) },
      solve: {
        tau: { tex: '\\tau = \\frac{\\alpha\\,\\Delta t}{\\Delta x^2}', sub: '\\frac{{alpha} \\times {dt}}{{dx}^2}', fn: x => x.alpha * x.dt / x.dx ** 2 },
        dt: { tex: '\\Delta t = \\frac{\\tau\\,\\Delta x^2}{\\alpha}', sub: '\\frac{{tau} \\times {dx}^2}{{alpha}}', fn: x => x.tau * x.dx ** 2 / x.alpha },
        dx: { tex: '\\Delta x = \\sqrt{\\frac{\\alpha\\,\\Delta t}{\\tau}}', sub: '\\sqrt{\\frac{{alpha} \\times {dt}}{{tau}}}', fn: x => Math.sqrt(x.alpha * x.dt / x.tau) },
        alpha: { tex: '\\alpha = \\frac{\\tau\\,\\Delta x^2}{\\Delta t}', sub: '\\frac{{tau} \\times {dx}^2}{{dt}}', fn: x => x.tau * x.dx ** 2 / x.dt },
      } },
  );
  const byId = Object.fromEntries(F.map(f => [f.id, f]));
  const forCard = (bookId, cardId) => bookId === 'heat-mass-transfer' ? F.filter(f => f.card === cardId) : [];

  // ---- numbers ----
  function fmt(x, sig = 4) { // plain text
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e6) return String(Number(x.toPrecision(sig)));
    const [m, e] = x.toExponential(sig - 1).split('e'); return `${Number(m)}×10^${Number(e)}`;
  }
  function fmtTex(x, sig = 4) {
    const s = fmt(x, sig).replace(/×10\^(-?\d+)/, '\\times10^{$1}');
    return x < 0 ? `(${s})` : s;
  }
  const toSI = (val, dim, unit) => { const u = (UNITS[dim] || {})[unit]; return u ? val * u[0] + u[1] : null; };
  const fromSI = (val, dim, unit) => { const u = (UNITS[dim] || {})[unit]; return u ? (val - u[1]) / u[0] : null; };
  function rangeMsg(f, name, si) {
    const meta = f.vars[name], r = meta.range; if (!r) return null;
    const bad = (r.gt !== undefined && !(si > r.gt)) || (r.ge !== undefined && !(si >= r.ge)) || (r.le !== undefined && !(si <= r.le));
    if (!bad) return null;
    const lim = [r.gt !== undefined ? `greater than ${r.gt} ${SI[meta.dim] === '–' ? '' : SI[meta.dim]}` : '', r.ge !== undefined ? `at least ${r.ge} ${SI[meta.dim] === '–' ? '' : SI[meta.dim]}` : '', r.le !== undefined ? `at most ${r.le}` : ''].filter(Boolean).join(' and ').replace(/\s+/g, ' ').trim();
    return `${meta.label} must be ${lim}${r.why ? ` (${r.why})` : ''}.`;
  }
  // inputs: { name: { value: string|number, unit } }. Returns { ok, error, field, result, steps }
  function compute(id, solveFor, inputs, outUnit) {
    const f = byId[id]; if (!f) return { ok: false, error: 'This calculator isn’t available.' };
    const s = f.solve[solveFor]; if (!s) return { ok: false, error: 'This calculator can’t solve for that variable.' };
    const si = {}, conv = [];
    for (const name of Object.keys(f.vars)) {
      if (name === solveFor) continue;
      const meta = f.vars[name], inp = inputs[name] || {}, raw = typeof inp.value === 'number' ? String(inp.value) : String(inp.value ?? '').trim().replace(/\u2212/g, '-');
      if (raw === '') return { ok: false, field: name, error: `Enter ${meta.label.toLowerCase()} (${name === 'eps' ? 'ε' : name}).` };
      if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(raw)) return { ok: false, field: name, error: `“${raw}” isn’t a number. Use digits, a decimal point and optionally e for powers of ten (e.g. 5.67e-8).` };
      const val = Number(raw);
      if (!Number.isFinite(val)) return { ok: false, field: name, error: `${meta.label} is too large.` };
      if (!(UNITS[meta.dim] || {})[inp.unit]) return { ok: false, field: name, error: `“${inp.unit || ''}” isn’t a unit this calculator knows for ${meta.label.toLowerCase()}. Choose one of: ${Object.keys(UNITS[meta.dim]).join(', ')}.` };
      const x = toSI(val, meta.dim, inp.unit);
      if (!Number.isFinite(x)) return { ok: false, field: name, error: `${meta.label} is too large.` };
      const rm = rangeMsg(f, name, x); if (rm) return { ok: false, field: name, error: rm };
      si[name] = x;
      if (inp.unit !== SI[meta.dim]) conv.push({ name, from: `${fmt(val, 6)} ${inp.unit}`, to: `${fmt(x, 6)} ${SI[meta.dim]}` });
    }
    const z = s.zero && s.zero(si); if (z) return { ok: false, error: z };
    const target = f.vars[solveFor];
    const out = s.fn(si);
    if (typeof out !== 'number' || !Number.isFinite(out)) return { ok: false, error: 'No real, finite answer for these values (for example a division by zero, a negative number under a root, or a result too large). Check the inputs and their signs.' };
    const rm = rangeMsg(f, solveFor, out); if (rm) return { ok: false, error: `The result is not physical: ${rm.charAt(0).toLowerCase() + rm.slice(1)} Check the inputs and their signs.` };
    const post = f.post && f.post({ ...si, [solveFor]: out }); if (post) return { ok: false, error: post };
    const unit = outUnit && (UNITS[target.dim] || {})[outUnit] ? outUnit : SI[target.dim];
    const shown = fromSI(out, target.dim, unit);
    if (!Number.isFinite(shown)) return { ok: false, error: 'The result can’t be shown in that unit.' };
    const subTex = s.sub.replace(/\{([A-Za-z0-9]+)\}/g, (m, n) => (n in si ? fmtTex(si[n], 6) : m));
    const lhs = s.tex.split('=')[0].trim();
    return { ok: true, value: shown, unit, si: out, siUnit: SI[target.dim], steps: { rearranged: s.tex, conversions: conv, substitution: `${lhs} = ${subTex}`, resultTex: `${lhs} = ${fmtTex(out)}` } };
  }
  return { F, byId, forCard, UNITS, SI, SIGMA, compute, fmt, fmtTex, toSI, fromSI };
})();
if (typeof module !== 'undefined') module.exports = CalcCore;
