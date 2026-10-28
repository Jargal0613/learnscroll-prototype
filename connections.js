// Concept connections: a short, hand-curated list of links between Heat and Mass Transfer cards, each checked
// against the cards' own content. No automatic word matching. Edges point from the card where the link is shown;
// the graph is acyclic (test/connections.test.js checks ids and cycles).
const CONNECTIONS = (() => {
  const P = 'prereq', E = 'equation', A = 'application';
  return { book: 'heat-mass-transfer', links: [
    ['c1-7', 'c1-6', P], ['c1-9', 'c1-8', P], ['c1-10', 'c1-9', P], ['c1-11', 'c1-9', P],
    ['c1-13', 'c1-12', P], ['c1-13', 'c1-16', A], ['c1-14', 'c1-13', P], ['c1-15', 'c1-14', P],
    ['c1-17', 'c1-12', P], ['c1-18', 'c1-17', P], ['c1-20', 'c1-19', P],
    ['c1-21', 'c1-17', E], ['c1-21', 'c1-20', E], ['c1-21', 'c1-25', A],
    ['c2-1', 'c1-13', P], ['c2-5', 'c2-4', P], ['c2-5', 'c1-15', E], ['c2-6', 'c2-5', E], ['c2-7', 'c2-6', E], ['c2-8', 'c2-7', E],
    ['c2-9', 'c2-5', P], ['c2-13', 'c1-11', P], ['c2-13', 'c1-17', E], ['c2-14', 'c1-20', P],
    ['c2-16', 'c2-5', P], ['c2-16', 'c1-16', E], ['c2-18', 'c2-4', P], ['c2-18', 'c1-17', E], ['c2-18', 'c2-20', A], ['c2-19', 'c2-18', P],
    // Chapters 3-5 (each with a one-line reason, grounded in the cards' own content and section/equation numbers)
    ['c3-1', 'c2-16', P, 'The linear temperature profile and constant heat rate come from the steady 1-D solution.'],
    ['c3-2', 'c3-1', P, 'R_wall = L/kA is the plane-wall result written as ΔT divided by a resistance.'],
    ['c3-3', 'c1-17', E, 'R_conv = 1/hA_s is Newton’s law of cooling written as a resistance.'],
    ['c3-3', 'c1-20', E, 'R_rad uses a radiation coefficient built from net radiation exchange.'],
    ['c3-4', 'c3-2', P, 'The network adds the wall and convection resistances in series.'],
    ['c3-5', 'c3-4', P, 'Each extra layer is one more series resistance in the network.'],
    ['c3-6', 'c3-4', P, 'Contact resistance enters the network as one more series term.'],
    ['c3-7', 'c3-4', P, 'Parallel paths extend the series-network rules.'],
    ['c3-8', 'c2-17', E, 'R_cyl follows from the steady radial heat rate through a cylindrical layer.'],
    ['c3-9', 'c3-8', P, 'Insulated pipes chain cylindrical-layer and convection resistances.'],
    ['c3-10', 'c3-9', P, 'The critical radius balances insulation resistance against outer convection resistance.'],
    ['c3-11', 'c2-5', P, 'The fin equation comes from an energy balance on a thin slice, like the 1-D conduction equation.'],
    ['c3-12', 'c3-11', P, 'Long-fin and adiabatic-tip results solve the fin equation with two tip conditions.'],
    ['c3-13', 'c3-12', P, 'The corrected length lets the adiabatic-tip formula include tip convection.'],
    ['c3-14', 'c3-12', E, 'Efficiency divides the adiabatic-tip heat rate by its ideal maximum.'],
    ['c3-15', 'c3-14', E, 'Effectiveness compares with the bare base; efficiency with an ideal isothermal fin.'],
    ['c3-16', 'c1-13', P, 'Shape factors are tabulated solutions of steady conduction with constant k.'],
    ['c4-1', 'c1-9', P, 'Lumped analysis is a first-law balance on the whole body.'],
    ['c4-1', 'c1-17', E, 'The surface heat loss in the lumped balance is Newton’s law of cooling.'],
    ['c4-1', 'c4-2', P, 'The Biot number decides whether the lumped model applies (Bi ≤ 0.1).'],
    ['c4-2', 'c3-2', E, 'Bi compares an internal conduction resistance with the surface convection resistance.'],
    ['c4-3', 'c4-1', P, 'Heat rate and total heat follow from the lumped temperature history.'],
    ['c4-5', 'c2-5', P, 'The dimensionless problem is the 1-D transient conduction equation rescaled.'],
    ['c4-5', 'c1-15', E, 'The Fourier number αt/L² is built from thermal diffusivity.'],
    ['c4-6', 'c4-5', P, 'The one-term solution is written in the dimensionless variables θ, Bi and τ.'],
    ['c4-7', 'c4-6', P, 'Q/Q_max is computed from the one-term centre temperature.'],
    ['c4-9', 'c4-8', P, 'The erfc solution is written with the similarity variable.'],
    ['c4-8', 'c4-10', A, 'Two touching bodies are each treated as a semi-infinite solid.'],
    ['c4-11', 'c4-6', P, 'Product solutions multiply one-dimensional one-term solutions.'],
    ['c5-3', 'c5-2', P, 'Interior-node equations use the difference form of d²T/dx².'],
    ['c5-3', 'c2-5', E, 'The node equation is the finite difference form of the steady 1-D conduction equation.'],
    ['c5-4', 'c5-3', P, 'Boundary nodes use the same energy balance on a half volume element.'],
    ['c5-4', 'c2-13', E, 'The convection boundary node is the discrete form of the convection boundary condition.'],
    ['c5-5', 'c5-4', P, 'The mirror image turns an insulated boundary node into an interior node.'],
    ['c5-6', 'c5-3', P, 'The 2-D node balance adds neighbours in a second direction.'],
    ['c5-7', 'c5-6', P, 'Irregular boundaries are handled with partial volume elements around 2-D nodes.'],
    ['c5-8', 'c4-4', P, 'Numerical marching solves transient conduction where analytical solutions are hard to use.'],
    ['c5-9', 'c5-8', P, 'The mesh Fourier number appears when the explicit method is written per node.'],
    ['c5-9', 'c1-15', E, 'τ = αΔt/Δx² is built from thermal diffusivity.'],
    ['c5-10', 'c5-9', P, 'The stability limit is a bound on the mesh Fourier number.'],
    ['c5-11', 'c5-2', P, 'Discretization error comes from truncating the Taylor series in the difference formulas.'],
  ].map(([from, to, kind, why]) => ({ from, to, kind, ...(why ? { why } : {}) })) };
})();
const Connections = (() => {
  const LABEL = { prereq: 'Prerequisite', equation: 'Related equation', application: 'Application' };
  const pos = id => { const m = /^c(\d+)-(\d+)$/.exec(id); return m ? [Number(m[1]), Number(m[2])] : null; };
  function queued(bookId, id) { const r = (((state.books || {})[bookId] || {}).review || {})[id]; return !!(r && r.r === 'again'); }
  function htmlFor(bookId, cardId) {
    if (bookId !== CONNECTIONS.book || typeof books === 'undefined' || !books[bookId]) return '';
    const ls = CONNECTIONS.links.filter(l => l.from === cardId); if (!ls.length) return '';
    const b = books[bookId];
    const rows = ls.map(l => { const [c, i] = pos(l.to), ch = b.chapters.find(x => x.n === c), card = ch && ch.cards[i - 1]; if (!card) return '';
      const q = queued(bookId, l.to);
      return `<li data-to="${l.to}"><span class="rc-kind k-${l.kind}">${LABEL[l.kind]}</span><a href="#/read/${bookId}/${c}/${i}" class="rc-open">${esc(stripTags(card.h))}</a><span class="f-tag">Ch ${c}</span>${l.why ? `<span class="rc-why">${esc(l.why)}</span>` : ''}<button type="button" class="t-link rc-add" data-book="${bookId}" data-to="${l.to}"${q ? ' disabled' : ''}>${q ? 'In revision plan ✓' : '+ Revise'}</button></li>`; }).join('');
    return rows ? `<details class="rc"><summary>Related concepts (${ls.length})</summary><ul class="rc-list">${rows}</ul></details>` : '';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.rc-add'); if (!b || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    const bs = bookState(b.dataset.book), id = b.dataset.to, before = bs.review[id];
    bs.review[id] = { r: 'again', at: Date.now() };
    if (!save()) { if (before) bs.review[id] = before; else delete bs.review[id]; b.textContent = 'Not saved'; return; }
    document.querySelectorAll(`.rc-add[data-to="${id}"]`).forEach(x => { x.disabled = true; x.textContent = 'In revision plan ✓'; });
  }, true);
  return { htmlFor, LABEL };
})();
if (typeof module !== 'undefined') module.exports = CONNECTIONS;
