"""'Needs attention' on the library: up to 5 items, priority order, skips Recently studied, links open the card/mistakes; hidden when empty."""
from common import *
SEED = {'books': {'heat-mass-transfer': {'chapter': 1, 'card': 9, 'done': {}, 'marks': {'c1-3': {'d': True}, 'c2-2': {'d': True}}, 'seen': {'1': 9, '2': 3},
         'notes': {}, 'review': {'c1-6': {'r': 'again', 'at': 1793000000000}, 'c2-5': {'r': 'again', 'at': 1793000100000}},
         'attempts': {'c1-q1': [{'k': 0, 'ok': False, 'at': 1793000000000}]}},
         'koretsky-thermo': {'chapter': 1, 'card': 2, 'done': {}, 'marks': {}, 'seen': {'1': 2}, 'notes': {}, 'review': {}}},
        'last': 'heat-mass-transfer', 'recent': [{'book': 'heat-mass-transfer', 'chapter': 1, 'card': 9, 'at': 1793000200000}]}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        ok(pg.locator('.attention').count() == 0 and 'needs attention' not in pg.inner_text('main').lower(), f'{W} hidden when nothing needs attention')
        pg.evaluate("s => localStorage.setItem('learnscroll-study-v1', JSON.stringify(s))", SEED); pg.reload(); pg.wait_for_selector('.attention')
        items = pg.locator('.attention a'); hrefs = [items.nth(i).get_attribute('href') for i in range(items.count())]
        ok(items.count() == 5, f'at most 5 items ({items.count()})')
        ok(hrefs[0] == '#/mistakes/heat-mass-transfer/1' and hrefs[1] == '#/read/heat-mass-transfer/1/3', f'priority: mistakes, then difficult {hrefs[:2]}')
        ok('#/read/heat-mass-transfer/1/11' not in hrefs, 'chapter shown in Recently studied not repeated as unfinished')
        pg.screenshot(path=f'{OUT}/{W}-library.png')
        pg.click('.attention a >> nth=1'); pg.wait_for_function("document.querySelector('#count') && document.querySelector('#count').innerText.startsWith('3 / ')")
        ok(True, 'difficult item opens the exact card')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('.attention'); pg.click('.attention a >> nth=0'); pg.wait_for_selector('#mx-card')
        ok('Review mistakes' in pg.inner_text('main'), 'mistakes item opens the retry flow')
        pg.close()
    b.close(); finish(errs)
