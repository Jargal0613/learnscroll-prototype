// Plain-text book rendering (browser and Node). The stored text is never changed; this only decides how to show
// it. Every character of the source ends up in the output (escaped), except the "See:" label itself, which becomes
// a "See also" heading. URLs are links only when they parse as http(s); anything else stays plain text.
(function (root) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // One reference candidate -> { ok, url, host } or { ok: false, reason }
  function parseRef(raw) {
    const s = String(raw).trim();
    if (!s) return { ok: false, reason: 'empty' };
    if (/\s/.test(s)) return { ok: false, reason: 'not a single URL' };
    let u; try { u = new URL(s); } catch (e) { return { ok: false, reason: 'malformed URL' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: `unsafe scheme ${u.protocol}` };
    if (!u.hostname || !u.hostname.includes('.')) return { ok: false, reason: 'no host' };
    return { ok: true, url: s, host: u.hostname.replace(/^www\./, '') }; // destination kept exactly as written
  }
  const SEE = /^\s{0,8}See:\s*(.*)$/;
  // Blocks: heading lines, paragraphs (with intentional line breaks), lists, preformatted code, See-also groups.
  function blocks(text) {
    const out = [];
    for (const chunk of String(text).split(/\n[ \t]*\n/)) {
      const lines = chunk.split('\n').filter(l => l.trim() !== '');
      if (!lines.length) continue;
      if (SEE.test(lines[0])) { // "See:" then URL lines, or "See: URL" lines (several may follow each other)
        const refs = [];
        for (const l of lines) { const m = SEE.exec(l), v = m ? m[1] : l; if (m && !v.trim()) continue; refs.push({ raw: v.trim(), ...parseRef(v) }); }
        out.push({ type: 'see', refs }); continue;
      }
      if (lines.every(l => /^\s{4,}\S/.test(l)) || lines.every(l => /^\s*(```|\t)/.test(l))) { out.push({ type: 'code', text: lines.join('\n') }); continue; }
      if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l)) && lines.length > 1 || /^\s+[-*•]\s/.test(lines[0]) && lines.every(l => /^\s*[-*•]\s/.test(l))) { out.push({ type: 'list', items: lines.map(l => l.trim()) }); continue; }
      if (lines.length === 1 && /^(CHAPTER|SECTION)\s/.test(lines[0])) { out.push({ type: lines[0].startsWith('CHAPTER') ? 'kicker' : 'title', text: lines[0] }); continue; }
      if (lines.length === 2 && /^CHAPTER\s/.test(lines[0]) && /^SECTION\s/.test(lines[1])) { out.push({ type: 'kicker', text: lines[0] }, { type: 'title', text: lines[1] }); continue; }
      const t = lines[0].trim();
      if (lines.length === 1 && t.length <= 90 && !/[.:;,?!"”)]$/.test(t) && (/^\d+(\.\d+)*\.?\s+\S/.test(t) || t.split(/\s+/).length <= 10)) { out.push({ type: 'h', text: t }); continue; }
      out.push({ type: 'p', lines });
    }
    return out;
  }
  // Inline: bare http(s) URLs in running text become links too (same safety rules).
  function inline(s) {
    return esc(s).replace(/https?:\/\/[^\s<>"']+/g, m => { const tail = /[.,;:!?)\]]+$/.exec(m), url = tail ? m.slice(0, -tail[0].length) : m, r = parseRef(url.replace(/&amp;/g, '&'));
      return r.ok ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${url}</a>${tail ? tail[0] : ''}` : m; });
  }
  function html(text) {
    return blocks(text).map(b => {
      if (b.type === 'see') return `<aside class="tb-see" aria-label="See also"><div class="tb-see-h">See also</div><ul>${b.refs.map(r => r.ok
        ? `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span class="tb-host">${esc(r.host)}</span><span class="tb-url">${esc(r.url)}</span></a></li>`
        : `<li class="tb-bad">${esc(r.raw)}</li>`).join('')}</ul></aside>`;
      if (b.type === 'code') return `<pre class="tb-code"><code>${esc(b.text)}</code></pre>`;
      if (b.type === 'list') return `<ul class="tb-list">${b.items.map(i => `<li>${inline(i.replace(/^([-*•])\s+/, ''))}</li>`).join('')}</ul>`;
      if (b.type === 'kicker') return `<div class="tb-kicker">${esc(b.text)}</div>`;
      if (b.type === 'title') return `<h1 class="tb-h1">${esc(b.text)}</h1>`;
      if (b.type === 'h') return `<h3>${inline(b.text)}</h3>`;
      return `<p>${b.lines.map(inline).join('<br>')}</p>`;
    }).join('\n');
  }
  const refsOf = text => blocks(text).filter(b => b.type === 'see').flatMap(b => b.refs);
  const api = { parseRef, blocks, html, refsOf, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BookText = api;
})(typeof window !== 'undefined' ? window : globalThis);
