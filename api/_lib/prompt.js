// Builds a grounded chat prompt. Source text goes to the model only; the client gets metadata only.
const MAX_SOURCE_CHARS = 1500;

// One instruction per answer style (validated enum, see validate.js). 'default' adds nothing.
const STYLE_SUFFIX = ' All rules above still apply (headings, citations, symbol definitions).';
const STYLE_INSTRUCTIONS = {
  default: '',
  simple: 'ANSWER STYLE: Explain simply. Lead with the core idea in one or two plain-language sentences, use an everyday analogy if it helps, avoid jargon (define any technical term you must use), and keep math to the one or two essential relations.',
  math: 'ANSWER STYLE: Walk through the math. Start from the governing equation, state the assumptions, then derive or apply it step by step with numbered steps, keeping every intermediate result with its units, and finish with what the result means physically.',
  example: 'ANSWER STYLE: Give an example. Build one concrete, realistic worked example with stated numbers (SI units): given data, what is asked, the solution steps with units, and a one-line sanity check of the answer.',
};
// Equation consistency rule shared by both prompts.
const EQUATION_RULE = '- Equations: keep one consistent notation throughout the answer (same symbol always means the same quantity). Right after every equation, define each symbol it uses with its SI units (e.g. "where \\(k\\) is thermal conductivity, \\(\\mathrm{W/(m\\cdot K)}\\)"), then state the assumptions and limits of validity. For calculations, show intermediate steps with units.';
const styleLine = s => (STYLE_INSTRUCTIONS[s] ? STYLE_INSTRUCTIONS[s] + STYLE_SUFFIX : '');
function contextLines({ titles, chapter, scope }) {
  return [
    `Book: "${titles.book}".`,
    `${titles.chapter}.`,
    titles.card ? `Current card: ${titles.card}.` : 'Current card: none (end of chapter).',
    `Question scope: ${scope === 'card' ? 'this card' : scope === 'chapter' ? `chapter ${chapter.n}` : 'the whole book'}.`,
  ];
}

function buildPrompt({ book, chapter, card, scope, question, messages }, sources, { bookIndexAvailable }) {
  const system = [
    `You are LearnScroll's tutor for "${book.title}" (${book.author}, ${book.edition}). The student is an undergraduate engineering/science student.`,
    'Rules:',
    '- Ground answers in the numbered SOURCES below and cite them inline as [S1], [S2]. Only cite source numbers that exist.',
    '- Clearly separate what the sources support from general background knowledge: put background under a line starting "Background (not from the book):".',
    '- If the sources do not support a confident answer, say so plainly.',
    '- Never invent quotations, page numbers, equation numbers, formulas or references. Do not quote more than one short sentence from any source; explain in your own words.',
    '- Explain step by step.',
    EQUATION_RULE,
    '- Write math in LaTeX using \\( ... \\) inline and \\[ ... \\] for display. Use short paragraphs, **bold** and "-" lists; no tables or HTML.',
    '- Be concise: usually under 350 words.',
    styleLine(arguments[0].style),
    bookIndexAvailable ? '' : '- Note: textbook pages are not available right now; sources are LearnScroll study notes (summaries), not the textbook itself. Say so if it matters.',
  ].filter(Boolean).join('\n');

  const ctx = contextLines(arguments[0]);
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
    '- Structure every subject answer in two parts with these exact headings:',
    '  "### From the textbook" = only what the retrieved passages support, paraphrased in your own words (no quotation marks).',
    '  "### Additional explanation" = your own worked steps, numbers, intuition or general knowledge that goes beyond the retrieved text.',
    '  Omit a part only if it would be empty. If the retrieved text does not support an answer, say so under "From the textbook".',
    '- Never invent quotations, page numbers, section numbers, equation numbers, formulas or references. Do not state page numbers at all; the app shows sources separately.',
    '- Do not quote the book; explain in your own words.',
    '- Explain step by step.',
    EQUATION_RULE,
    '- Write math in LaTeX using \\( ... \\) inline and \\[ ... \\] for display (never bare $; use \\cdot, not \\cdotp, and write units like \\mathrm{W/(m\\cdot K)}). Use short paragraphs, **bold** and "-" lists; no tables or HTML.',
    '- If the question is unrelated to this book or to studying it, briefly say you can only help with this textbook and suggest a related topic (no headings). Do not search for it.',
    '- Be concise: usually under 350 words.',
    styleLine(arguments[0].style),
  ].filter(Boolean).join('\n');
  const ctx = contextLines(arguments[0]);
  if (card) ctx.push(card.kind === 'quiz'
    ? `Current LearnScroll practice question: ${card.q} Options: ${card.options.join(' | ')}. Answer: ${card.options[card.answer]}. Explanation: ${card.why}`
    : `Current LearnScroll study note (a summary written for this app, not the textbook) [${card.s}] ${card.h}: ${card.t}${card.eq ? ` Equation: ${card.eq}` : ''}${card.def ? ` Definition: ${card.def}` : ''}${card.ex ? ` Example: ${card.ex}` : ''}`);
  const input = [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: `${ctx.join('\n')}\n\nQUESTION: ${question}` }];
  return { instructions, input };
}
module.exports = { buildPrompt, buildFileSearchPrompt, STYLE_INSTRUCTIONS, MAX_SOURCE_CHARS };
