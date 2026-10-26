"""Session book picker: one row at desktop sizes, compact labels with full titles, select fallback when narrow."""
from common import *
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(900, 800), (640, 800)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/session'); pg.wait_for_selector('#sessGo')
        g = pg.evaluate("""() => { const s = document.getElementById('bookSeg'), sel = document.getElementById('bookSel');
          const bs = [...s.querySelectorAll('button')];
          const vis = e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
          return { seg: vis(s), sel: vis(sel), rows: new Set(bs.map(x => Math.round(x.getBoundingClientRect().top))).size,
                   right: Math.max(vis(s) ? s.getBoundingClientRect().right : 0, vis(sel) ? sel.getBoundingClientRect().right : 0), vw: document.documentElement.clientWidth,
                   labels: bs.map(x => x.getAttribute('aria-label')), checked: bs.filter(x => x.getAttribute('aria-checked') === 'true').length,
                   page: document.documentElement.scrollWidth <= innerWidth } }""")
        if W >= 1440:
            ok(g['seg'] and not g['sel'] and g['rows'] == 1, f'{W}: buttons in one row {g["rows"]}')
            ok(all(len(l) > 10 for l in g['labels']) and 'Heat and Mass Transfer: Fundamentals and Applications' in g['labels'], 'full titles in aria-label/title')
            ok(g['checked'] == 1, 'exactly one selected')
            pg.click('[data-book="koretsky-thermo"]'); ok(pg.get_attribute('[data-book="koretsky-thermo"]', 'aria-checked') == 'true', 'selection changes')
        else:
            ok(g['seg'] != g['sel'], f'{W}: exactly one picker visible (seg={g["seg"]}, select={g["sel"]})')
            if g['sel']:
                pg.select_option('#bookSel', 'university-physics'); pg.wait_for_timeout(200)
                ok(pg.input_value('#bookSel') == 'university-physics' and 'University Physics' not in '' , 'select fallback works')
        ok(g['right'] <= g['vw'] and g['page'], f'{W}: picker within viewport ({g["right"]:.0f} <= {g["vw"]})')
        pg.screenshot(path=f'{OUT}/{W}-picker.png')
        pg.close()
    b.close(); finish(errs)
