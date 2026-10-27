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
  ].map(([from, to, kind]) => ({ from, to, kind })) };
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
      return `<li data-to="${l.to}"><span class="rc-kind k-${l.kind}">${LABEL[l.kind]}</span><a href="#/read/${bookId}/${c}/${i}" class="rc-open">${esc(stripTags(card.h))}</a><span class="f-tag">Ch ${c}</span><button type="button" class="t-link rc-add" data-book="${bookId}" data-to="${l.to}"${q ? ' disabled' : ''}>${q ? 'In revision plan ✓' : '+ Revise'}</button></li>`; }).join('');
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
