// My progress: descriptive numbers only, computed locally and deterministically from saved study data.
// No mastery score, no streaks, no rankings. Opening a card is counted as "opened", never as "understood".
const Progress = (() => {
  const SD = typeof StudyData !== 'undefined' ? StudyData : require('./studydata.js');
  const DAY = 86400000, MIN_QUIZ = 5;
  function compute(study, book, now = Date.now()) {
    const bs = (study.books || {})[book.id] || {}, seen = bs.seen || {}, done = bs.done || {}, att = bs.attempts || {}, rev = bs.review || {};
    const chapters = [], times = [];
    let opened = 0, total = 0, qTried = 0, qLatestOk = 0, tries = 0, triesOk = 0;
    for (const ch of book.chapters) {
      if (!Array.isArray(ch.cards) || !ch.cards.length) continue;
      const n = ch.cards.length, o = done[ch.n] ? n : seen[ch.n] !== undefined ? Math.min(seen[ch.n] + 1, n) : 0;
      let cq = 0, cok = 0;
      (ch.quiz || []).forEach((_, k) => { const a = att[`c${ch.n}-q${k + 1}`]; if (!a || !a.length) return; cq++; if (a[a.length - 1].ok) cok++; tries += a.length; triesOk += a.filter(x => x.ok).length; a.forEach(x => times.push(x.at)); });
      opened += o; total += n; qTried += cq; qLatestOk += cok;
      chapters.push({ n: ch.n, title: ch.title, opened: o, cards: n, quizzes: (ch.quiz || []).length, quizTried: cq, quizLatestOk: cok });
    }
    for (const r of Object.values(rev)) if (r && r.at) times.push(r.at);
    for (const v of Object.values(bs.notes || {})) if (v && v.at) times.push(v.at);
    const practice = Object.entries(study.practice || {}).map(([id, r]) => { (r.attempts || []).forEach(a => times.push(a.at)); return { id, solved: !!r.solved, struggled: r.struggled || [], tried: (r.attempts || []).length > 0 }; }).filter(x => x.tried);
    const plan = SD.revisionPlan(study, book, { now });
    const needs = [...plan.today, ...plan.later, ...plan.postponed];
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const days = []; for (let d = 6; d >= 0; d--) { const from = start.getTime() - d * DAY, to = from + DAY; days.push({ from, count: times.filter(t => t >= from && t < to).length }); }
    return {
      cards: { opened, total, reviewedGot: Object.values(rev).filter(r => r && r.r === 'got').length },
      quiz: tries >= MIN_QUIZ ? { questions: qTried, latestOk: qLatestOk, tries, triesOk, pct: Math.round(100 * triesOk / tries) } : null,
      quizTries: tries,
      needs: needs.map(x => ({ id: x.id, chapter: x.chapter, card: x.card, reason: x.reason })),
      practice: { tried: practice.length, solved: practice.filter(x => x.solved).length, struggled: practice.filter(x => x.struggled.length) },
      recent: days, recentTotal: days.reduce((s, d) => s + d.count, 0), chapters,
    };
  }
  function render(bookId) {
    const book = (bookId && books[bookId]) || Object.values(books)[0];
    if (!book) return renderMissing('No book is loaded yet.', '#/', 'Home');
    document.title = `My progress · ${book.short}`;
    const m = compute(state, book), nd = '<span class="pg-nd">Not enough data</span>';
    const cardName = x => { const ch = book.chapters.find(c => c.n === x.chapter); return x.card < ch.cards.length ? stripTags(ch.cards[x.card].h) : `Practice question ${x.card - ch.cards.length + 1}`; };
    const day = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
    app.innerHTML = `<main class="page cpage pgpage"><a class="back" href="#/">← Home</a>
      <div class="book-head"><div><h1>My progress</h1><p class="meta-line">${esc(book.title)} · from this browser’s saved data only</p></div></div>
      <div class="pg-grid">
        <section class="pg-box" id="pg-cards"><h2>Cards opened</h2>${m.cards.opened ? `<p class="pg-num">${m.cards.opened} <span>of ${m.cards.total}</span></p><p class="f-tag">Opening a card isn’t the same as understanding it.${m.cards.reviewedGot ? ` You marked ${m.cards.reviewedGot} as “got it” in review.` : ''}</p>` : nd}</section>
        <section class="pg-box" id="pg-quiz"><h2>Quiz answers</h2>${m.quiz ? `<p class="pg-num">${m.quiz.pct}% <span>correct of ${m.quiz.tries} answers</span></p><p class="f-tag">${m.quiz.latestOk} of ${m.quiz.questions} questions right on your latest try.</p>` : `${nd}<p class="f-tag">${m.quizTries ? `${m.quizTries} answer${m.quizTries === 1 ? '' : 's'} so far; shown from ${MIN_QUIZ}.` : 'Answer some practice questions in the reader.'}</p>`}</section>
        <section class="pg-box" id="pg-practice"><h2>Problem practice</h2>${m.practice.tried ? `<p class="pg-num">${m.practice.solved} <span>solved of ${m.practice.tried} tried</span></p>` : `${nd}<p class="f-tag"><a href="#/practice">Try a worked example</a></p>`}</section>
      </div>
      <section class="pg-sec" id="pg-needs"><h2>Needs review</h2>${m.needs.length || m.practice.struggled.length ? `<ul class="pg-list">${m.needs.slice(0, 8).map(x => `<li><a href="#/read/${book.id}/${x.chapter}/${x.card + 1}">${esc(cardName(x))}</a> <span class="f-tag">Ch ${x.chapter} · ${esc(x.reason)}</span></li>`).join('')}${m.practice.struggled.map(x => `<li><a href="#/practice/${x.id}">${esc(typeof PRACTICE !== 'undefined' && PRACTICE.find(p => p.id === x.id) ? PRACTICE.find(p => p.id === x.id).ref : x.id)}</a> <span class="f-tag">Problem steps: ${esc(x.struggled.join(', '))}</span></li>`).join('')}</ul>${m.needs.length > 8 ? `<p class="f-tag">and ${m.needs.length - 8} more</p>` : ''}${m.needs.length ? `<div class="btns"><a class="btn" id="pg-rev" href="#/revision/${book.id}">Start a revision session</a></div>` : ''}` : `${nd}<p class="f-tag">Cards you miss in quizzes, mark difficult or mark “review again” show up here.</p>`}</section>
      <section class="pg-sec" id="pg-recent"><h2>Recent activity <span class="f-tag">last 7 days</span></h2>${m.recentTotal ? `<ol class="pg-days">${m.recent.map(d => `<li><span>${esc(day(d.from))}</span><i style="--w:${Math.min(100, d.count * 10)}%"></i><b>${d.count || '–'}</b></li>`).join('')}</ol><p class="f-tag">Counts quiz answers, review marks, notes and practice checks.</p>` : nd}</section>
      <section class="pg-sec" id="pg-chapters"><h2>By chapter</h2><table class="pg-table"><thead><tr><th>Chapter</th><th>Cards opened</th><th>Questions answered</th></tr></thead><tbody>${m.chapters.map(c => `<tr><td><a href="#/read/${book.id}/${c.n}">${c.n}. ${esc(c.title)}</a></td><td>${c.opened ? `${c.opened}/${c.cards}` : '–'}</td><td>${c.quizTried ? `${c.quizTried}/${c.quizzes} <span class="f-tag">(${c.quizLatestOk} right)</span>` : '–'}</td></tr>`).join('')}</tbody></table></section>
    </main>`;
  }
  return { compute, render, MIN_QUIZ };
})();
if (typeof module !== 'undefined') module.exports = Progress;
