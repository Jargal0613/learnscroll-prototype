"""Every equation in every book, desktop and phone: KaTeX renders without errors, the rendered TeX is exactly the
source formula (annotation == data), display equations stay inside their own block (scrolling there if wider),
inline math never pushes past the card, smallest glyphs (sub/superscripts, fraction parts) stay legible, and
fractions, subscripts, Greek, integrals and units are all exercised. No diagrams exist in the data (checked)."""
from common import *
import json, glob, os
DATA = os.path.join(os.path.dirname(__file__), '../../data')
books = {}
for f in sorted(glob.glob(DATA + '/*.json')):
    d = json.load(open(f))
    if 'chapters' in d and 'extends' not in d: books[os.path.basename(f)[:-5]] = d
# book extensions (Chapters 3-5 of Heat & Mass Transfer) are merged the same way the app does
for f in sorted(glob.glob(DATA + '/*-ext.json')):
    x = json.load(open(f)); bk = books[x['extends']]
    for e in x['chapters']:
        ch = next(c for c in bk['chapters'] if c['n'] == e['n'])
        if not ch.get('cards') and ch['title'] == e['title']: ch.update(cards=e['cards'], quiz=e.get('quiz', []))
blob = json.dumps(books)
ok(blob.count('<svg') + blob.count('<img') == 0, 'data contains no diagrams/images (nothing to scale; none invented)')
FEATURES = {'fraction': '\\\\frac', 'subscript': '_', 'greek': '\\\\(alpha|beta|Delta|delta|varepsilon|epsilon|sigma|rho|theta|mu|lambda|omega|pi|nu)', 'integral': '\\\\int', 'units': '\\\\(mathrm|text)'}
import re
srcs = [c['eq'] for d in books.values() for ch in d['chapters'] for c in ch.get('cards', []) if c.get('eq')]
for k, rx in FEATURES.items(): ok(any(re.search(rx, s) for s in srcs), f'data exercises {k}: {sum(bool(re.search(rx, s)) for s in srcs)} equations')
CHECK = """(() => {
  const res = { eqs: 0, errors: [], mismatch: [], outside: [], inline: [], tiny: [], wide: 0 };
  for (const e of document.querySelectorAll('#feed .eq')) {
    res.eqs++; const src = e.dataset.eq; const ann = e.querySelector('annotation');
    if (e.querySelector('.katex-error') || !ann) res.errors.push(src.slice(0, 50));
    else if (ann.textContent.trim() !== src.trim()) res.mismatch.push(src.slice(0, 50));
    const body = e.closest('.card-body').getBoundingClientRect(), r = e.getBoundingClientRect();
    if (r.left < body.left - 1 || r.right > body.right + 1) res.outside.push(src.slice(0, 40));
    if (e.scrollWidth > e.clientWidth + 2) { res.wide++; if (!e.classList.contains('eq-more-r') || e.tabIndex !== 0) res.outside.push('no scroll cue ' + src.slice(0, 30)); if (getComputedStyle(e).overflowX !== 'auto') res.outside.push('noscroll ' + src.slice(0, 30)); }
    for (const g of e.querySelectorAll('.katex-html .mord, .katex-html .mop')) { const fs = parseFloat(getComputedStyle(g).fontSize); if (g.textContent.trim() && fs < 9.5) { res.tiny.push(src.slice(0, 30) + ' ' + fs.toFixed(1)); break; } }
  }
  for (const k of document.querySelectorAll('#feed .card-body .katex')) {
    if (k.closest('.eq')) continue; const body = k.closest('.card-body').getBoundingClientRect(), r = k.getBoundingClientRect();
    if (r.right > body.right + 2) res.inline.push(k.textContent.slice(0, 30));
    if (k.querySelector('.katex-error')) res.errors.push('inline ' + k.textContent.slice(0, 30));
  }
  return res; })()"""
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(320, 640), (390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs); tot = {'eqs': 0, 'wide': 0}; bad = []
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        for bid, d in books.items():
            for ch in d['chapters']:
                if not ch.get('cards'): continue
                pg.goto(BASE + f'/#/read/{bid}/{ch["n"]}/1'); pg.wait_for_selector('#feed'); pg.wait_for_timeout(500)
                r = pg.evaluate(CHECK); tot['eqs'] += r['eqs']; tot['wide'] += r['wide']
                for k in ('errors', 'mismatch', 'outside', 'inline', 'tiny'):
                    bad += [f'{bid} ch{ch["n"]} {k}: {x}' for x in r[k]]
                if pg.evaluate("document.documentElement.scrollWidth") > W: bad.append(f'{bid} ch{ch["n"]}: page scrolls horizontally')
        ok(tot['eqs'] == len(srcs), f'{W}: all {len(srcs)} display equations rendered ({tot["eqs"]})')
        ok(not bad, f'{W}: no render errors, altered formulas, clipping or tiny glyphs; {tot["wide"]} wide equations scroll in their own block' + (f' — {bad[:6]}' if bad else ''))
        if W == 320:
            pg.goto(BASE + '/#/read/heat-mass-transfer/2/7'); pg.wait_for_timeout(900)
            e = pg.locator('#feed .eq.eq-more-r').first.element_handle(); cls0 = e.get_attribute('class')
            e.evaluate("n => { n.scrollLeft = n.scrollWidth; n.dispatchEvent(new Event('scroll')); }"); pg.wait_for_timeout(100); cls1 = e.get_attribute('class')
            ok('eq-more-r' in cls0 and 'eq-more-l' in cls1 and 'eq-more-r' not in cls1, f'320: scroll cue fades the side with hidden formula ({cls0} -> {cls1})')
        for bid, n, i in [('heat-mass-transfer', 2, 7), ('koretsky-thermo', 2, 16), ('electric-circuits', 2, 17)]:
            pg.goto(BASE + f'/#/read/{bid}/{n}/{i}'); pg.wait_for_timeout(900); pg.screenshot(path=f'{OUT}/{W}-{bid}-{n}-{i}.png')
        pg.close()
    b.close(); finish(errs)
