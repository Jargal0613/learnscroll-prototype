"""'Needs attention' on the library: up to 5 items ranked difficult > review again (incl. missed quiz) > unfinished, one per card,
short reason each, links open the exact card, skips Recently studied, calm empty state, stable order across reloads; desktop + phone."""
from common import *
SEED = {'books': {'heat-mass-transfer': {'chapter': 1, 'card': 9, 'done': {}, 'marks': {'c1-3': {'d': True}, 'c2-2': {'d': True}}, 'seen': {'1': 9, '2': 3},
         'notes': {}, 'review': {'c1-6': {'r': 'again', 'at': 1793000000000}, 'c2-5': {'r': 'again', 'at': 1793000100000}},
         'attempts': {'c1-q1': [{'k': 0, 'ok': False, 'at': 1793000000000}]}},
         'koretsky-thermo': {'chapter': 1, 'card': 2, 'done': {}, 'marks': {}, 'seen': {'1': 2}, 'notes': {}, 'review': {}}},
        'last': 'heat-mass-transfer', 'recent': [{'book': 'heat-mass-transfer', 'chapter': 1, 'card': 9, 'at': 1793000200000}]}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        ok(pg.locator('.attention').count() == 0 and 'needs attention' not in pg.inner_text('main').lower(), f'{W} hidden for a brand-new profile')
        pg.evaluate("s => localStorage.setItem('learnscroll-study-v1', JSON.stringify(s))", {'books': {'heat-mass-transfer': {'chapter': 1, 'card': 0, 'done': {'1': True}, 'marks': {}, 'seen': {'1': 30}, 'notes': {}, 'review': {}}}, 'last': None, 'recent': []}); pg.reload(); pg.wait_for_selector('#q')
        ok('Nothing needs attention right now' in pg.inner_text('main') and pg.locator('.attention').count() == 0, f'{W} calm empty state once there is study data')
        pg.evaluate("s => localStorage.setItem('learnscroll-study-v1', JSON.stringify(s))", SEED); pg.reload(); pg.wait_for_selector('.attention')
        items = pg.locator('.attention a'); hrefs = [items.nth(i).get_attribute('href') for i in range(items.count())]
        kinds = [items.nth(i).locator('.att-k').inner_text().lower() for i in range(items.count())]
        ok(items.count() == 5, f'{W} at most 5 items ({items.count()})')
        ok(kinds == ['difficult', 'difficult', 'review again', 'review again', 'review again'], f'{W} ranked difficult > review again ({kinds})')
        ok(len(set(hrefs)) == 5 and all(h.startswith('#/read/') for h in hrefs), f'{W} no duplicates, every item links to a card')
        reasons = [items.nth(i).locator('.att-why').inner_text() for i in range(items.count())]
        ok(all(0 < len(r) <= 60 for r in reasons) and reasons[0] == 'You marked it difficult', f'{W} short reason each: {reasons}')
        ok('#/read/heat-mass-transfer/1/11' not in hrefs, f'{W} chapter shown in Recently studied not repeated as unfinished')
        pg.reload(); pg.wait_for_selector('.attention'); ok([items.nth(i).get_attribute('href') for i in range(items.count())] == hrefs, f'{W} stable order after reload')
        if W < 700: ok(pg.evaluate("document.documentElement.scrollWidth") <= W, f'{W} no horizontal scroll')
        pg.screenshot(path=f'{OUT}/{W}-library.png', full_page=True)
        pg.click('.attention a >> nth=0'); pg.wait_for_function("document.querySelector('#count') && document.querySelector('#count').innerText.startsWith('3 / ')")
        ok(True, f'{W} difficult item opens the exact card')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('.attention'); qh = [h for h in hrefs if h.endswith('/1/26')]
        ok(qh, f'{W} missed quiz question listed as a card link ({hrefs})')
        pg.close()
    b.close(); finish(errs)
