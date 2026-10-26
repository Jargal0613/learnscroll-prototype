// Builds a grounded chat prompt. Source text goes to the model only; the client gets metadata only.
const MAX_SOURCE_CHARS = 1500;

function buildPrompt({ book, chapter, card, scope, question, messages }, sources, { bookIndexAvailable }) {
  const system = [
    `You are LearnScroll's tutor for "${book.title}" (${book.author}, ${book.edition}). The student is an undergraduate engineering/science student.`,
    'Rules:',
    '- Ground answers in the numbered SOURCES below and cite them inline as [S1], [S2]. Only cite source numbers that exist.',
    '- Clearly separate what the sources support from general background knowledge: put background under a line starting "Background (not from the book):".',
    '- If the sources do not support a confident answer, say so plainly.',
    '- Never invent quotations, page numbers, equation numbers, formulas or references. Do not quote more than one short sentence from any source; explain in your own words.',
    '- Explain step by step. For equations, explain what each symbol means, its units, the assumptions and the limits of validity. For calculations, show intermediate steps with units.',
    '- Write math in LaTeX using \\( ... \\) inline and \\[ ... \\] for display. Use short paragraphs, **bold** and "-" lists; no tables or HTML.',
    '- Be concise: usually under 350 words.',
    bookIndexAvailable ? '' : '- Note: textbook pages are not available right now; sources are LearnScroll study notes (summaries), not the textbook itself. Say so if it matters.',
  ].filter(Boolean).join('\n');

  const ctx = [`Current location: Chapter ${chapter.n}, "${chapter.title}". Question scope: ${scope === 'card' ? 'this card' : scope === 'chapter' ? 'this chapter' : 'the whole book'}.`];
  if (card) ctx.push(card.kind === 'quiz'
    ? `Current card (practice question): ${card.q} Options: ${card.options.join(' | ')}. Answer: ${card.options[card.answer]}. Explanation: ${card.why}`
    : `Current card [${card.s}] ${card.h}: ${card.t}${card.eq ? ` Equation: ${card.eq}` : ''}${card.def ? ` Definition: ${card.def}` : ''}${card.ex ? ` Example: ${card.ex}` : ''}`);
  const src = sources.length
    ? sources.map(s => `[${s.ref}] ${s.label}\n${s.text.slice(0, MAX_SOURCE_CHARS)}`).join('\n\n')
    : '(no matching sources were found)';
  const user = `${ctx.join('\n')}\n\nSOURCES:\n${src}\n\nQUESTION: ${question}`;
  return [{ role: 'system', content: system }, ...messages, { role: 'user', content: user }];
}

// File Search variant: the model retrieves textbook passages itself; we send rules, location and the card note.
function buildFileSearchPrompt({ book, chapter, card, scope, question, messages }) {
  const instructions = [
    `You are LearnScroll's tutor for "${book.title}" (${book.author}, ${book.edition}). The student is an undergraduate engineering student.`,
    'Rules:',
    '- Always search the textbook with the file_search tool before answering a subject question, and base the answer on what you find.',
    '- Clearly separate textbook-supported content from general background knowledge: put background under a line starting "Background (not from the book):".',
    '- If the retrieved text does not support a confident answer, say so plainly.',
    '- Never invent quotations, page numbers, section numbers, equation numbers, formulas or references. Do not state page numbers at all; the app shows sources separately.',
    '- Do not reproduce long passages: quote at most one short sentence; otherwise explain in your own words.',
    '- Explain step by step. For equations, explain each symbol, its units, the assumptions and limits of validity. For calculations, show intermediate steps with units.',
    '- Write math in LaTeX using \\( ... \\) inline and \\[ ... \\] for display (never bare $). Use short paragraphs, **bold** and "-" lists; no tables or HTML.',
    '- If the question is unrelated to this book or to studying it, briefly say you can only help with this textbook and suggest a related topic. Do not search for it.',
    '- Be concise: usually under 350 words.',
  ].join('\n');
  const ctx = [`Current location: Chapter ${chapter.n}, "${chapter.title}". Question scope: ${scope === 'card' ? 'this card' : scope === 'chapter' ? `chapter ${chapter.n}` : 'the whole book'}.`];
  if (card) ctx.push(card.kind === 'quiz'
    ? `Current LearnScroll practice question: ${card.q} Options: ${card.options.join(' | ')}. Answer: ${card.options[card.answer]}. Explanation: ${card.why}`
    : `Current LearnScroll study note (a summary written for this app, not the textbook) [${card.s}] ${card.h}: ${card.t}${card.eq ? ` Equation: ${card.eq}` : ''}${card.def ? ` Definition: ${card.def}` : ''}${card.ex ? ` Example: ${card.ex}` : ''}`);
  const input = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: `${ctx.join('\n')}\n\nQUESTION: ${question}` }];
  return { instructions, input };
}
module.exports = { buildPrompt, buildFileSearchPrompt, MAX_SOURCE_CHARS };
