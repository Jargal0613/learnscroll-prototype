"""Concept connections: a compact "Related concepts" list on selected reader cards (curated links only), labelled
Prerequisite / Related equation / Application; each opens the card or adds it to the revision plan."""
from common import *
B = 'heat-mass-transfer'; SK = 'learnscroll-study-v1'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        pg.goto(BASE + f'/#/read/{B}/1/21'); pg.wait_for_timeout(700)
        card = pg.locator('.card').nth(20); rc = card.locator('details.rc')
        ok(rc.count() == 1 and not rc.evaluate('d => d.open'), f'{W}: card 1-21 has a collapsed Related concepts list')
        ok(pg.locator('.card').nth(0).locator('details.rc').count() == 0, f'{W}: cards without curated links show nothing')
        rc.locator('summary').click(); pg.wait_for_timeout(100)
        kinds = [k.lower() for k in rc.locator('.rc-kind').all_inner_texts()]
        ok(kinds == ['related equation', 'related equation', 'application'], f'{W}: labels {kinds}')
        ok('Thermal comfort' in rc.inner_text() and 'Convection' in rc.inner_text(), f'{W}: target card titles shown')
        if W != 1728: card.screenshot(path=f'{OUT}/{W}-card.png')
        add = rc.locator('li[data-to="c1-25"] .rc-add'); add.click(); pg.wait_for_timeout(100)
        rv = pg.evaluate(f"JSON.parse(localStorage['{SK}']).books['{B}'].review['c1-25']")
        ok(rv and rv['r'] == 'again' and add.is_disabled() and 'In revision plan' in add.inner_text(), f'{W}: + Revise queues c1-25 ({rv})')
        rc.locator('li[data-to="c1-17"] a.rc-open').click(); pg.wait_for_timeout(800)
        top = pg.evaluate("(() => { const cs = [...document.querySelectorAll('.card')]; return cs.findIndex(c => { const r = c.getBoundingClientRect(); return r.top > -40 && r.top < innerHeight / 2; }); })()")
        ok(top == 16 and pg.evaluate('location.hash').startswith(f'#/read/{B}/1'), f'{W}: link opens card 1-17 (card in view: {top + 1})')
        sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); ok(sw[0] <= sw[1], f'{W}: no sideways scroll {sw}')
        pg.goto(BASE + f'/#/revision/{B}'); pg.wait_for_timeout(500)
        ok('Thermal comfort' in pg.inner_text('main'), f'{W}: queued card is in the revision plan')
        ctx.close()
    b.close(); finish(errs)
