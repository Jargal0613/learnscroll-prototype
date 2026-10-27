// Prints the real /api/solve handler output for the three retrieval states (fake provider + in-memory limiter;
// no network). Used by test/e2e/solver_sources.py so the UI is tested against genuine server output.
const handler = require('../../api/solve');
const LONG = 'Fourier law states that the rate of heat conduction through a plane layer is proportional to the temperature difference across the layer and the heat transfer area.';
const sol = { givens: [{ symbol: 'k', value: '0.8', unit: 'W/m·K' }], unknown: 'q', assumptions: ['Steady'], equations: [{ tex: "q'' = k\\Delta T/L", source: 'Section 1-6' }], steps: ["\\(q'' = 0.8 \\times 50/0.2 = 200\\) W/m²"], result: { value: '200', unit: 'W/m²' }, unitCheck: 'W/m²', sanityCheck: 'Reasonable.', fromTextbook: 'Fourier law for plane walls.', additionalExplanation: '', sourceNote: 'Heat and Mass Transfer, Ch 1' };
const outs = { retrieved: { searched: true, results: 1, passages: [{ fileId: 'f', score: 0.9, text: LONG }] }, none: { searched: true, results: 0, passages: [] }, failed: { searched: true, searchFailed: true, results: 0, passages: [] } };
const kb = { forBook: () => ({ vectorStoreId: 'vs', fileId: 'f' }) };
(async () => {
  const res = {};
  for (const [k, o] of Object.entries(outs)) {
    const m = new Map(); const store = { incr: async key => { m.set(key, (m.get(key) || 0) + 1); return m.get(key); } };
    res[k] = await new Promise(resolve => handler({ method: 'POST', headers: { 'x-real-ip': k }, body: { bookId: 'heat-mass-transfer', problem: 'A 0.2 m wall with k = 0.8 W/m K has 50 K across it. Find q.' } },
      { setHeader() {}, end(s) { resolve(JSON.parse(s)); } }, { env: { SOLVER_ENABLED: '1' }, store, knowledge: kb, provider: { async respond() { return { text: JSON.stringify(sol), usage: null, ...o }; } } }));
  }
  process.stdout.write(JSON.stringify(res));
})();
