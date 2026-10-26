"""Revision plan: deterministic ranking from quiz mistakes, difficult, review-again and stale reviews; repeatedly
missed first; short reason per card; daily target 5/10/15; Postpone / Understood keep history; no duplicates or
unavailable cards; works offline; runs in the existing Review mode; in export."""
from common import *
import json, time
SK, B = 'learnscroll-study-v1', 'heat-mass-transfer'
D = 864e5
def seed(now):
    marks = {f'c1-{i}': {'d': True} for i in range(1, 13)}
    marks['c99-1'] = {'d': True}  # card that does not exist
    return {'schema': 3, 'books': {B: {'chapter': 1, 'card': 0, 'done': {}, 'seen': {}, 'marks': marks, 'notes': {},
        'review': {'c1-20': {'r': 'again', 'at': now - D}, 'c1-21': {'r': 'got', 'at': now - 30 * D}, 'c1-1': {'r': 'again', 'at': now - 2 * D}},
        'attempts': {'c1-q1': [{'k': 0, 'ok': False, 'at': now - 3 * D}, {'k': 2, 'ok': False, 'at': now - D}], 'c1-q2': [{'k': 0, 'ok': False, 'at': now - D}]}}},
        'last': B, 'recent': [], 'sessions': []}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); now = pg.evaluate('Date.now()')
        pg.evaluate("([k, v]) => { localStorage.clear(); localStorage[k] = JSON.stringify(v); }", [SK, seed(now)]); pg.reload(); pg.wait_for_selector('.tools-line')
        pg.click('.tools-line >> text=Revision plan'); pg.wait_for_selector('.rvplan')
        rows = lambda sel='.rv-list': [r.get_attribute('data-rid') for r in pg.locator(f'{sel} li').all()]
        today = [r.get_attribute('data-rid') for r in pg.locator('.rv-list').first.locator('li').all()]
        ok(today[:2] == ['c1-q1', 'c1-q2'] and len(today) == 10, f'{W}: repeatedly missed first, then missed once; default target 10 ({today[:4]})')
        why = [x.inner_text() for x in pg.locator('.rv-why').all()]
        ok(why[0] == 'Missed twice' and why[1] == 'Missed once' and 'Marked review again · Marked difficult' in why[2], f'{W}: short reasons: {why[:3]}')
        allids = rows(); ok(len(allids) == len(set(allids)) and 'c99-1' not in allids and any('Not reviewed recently (30 days)' in w for w in why), f'{W}: no duplicates, no unavailable cards, stale card included')
        pg.reload(); pg.wait_for_selector('.rvplan'); ok(rows() == allids, f'{W}: stable order across reloads')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-plan.png', full_page=True)
        pg.click('[data-target="5"]'); ok(len(pg.locator('.rv-list').first.locator('li').all()) == 5 and json.loads(pg.evaluate(f"localStorage['{SK}']"))['revision']['target'] == 5, f'{W}: daily target 5 saved')
        pg.click('[data-target="15"]'); ok(len(pg.locator('.rv-list').first.locator('li').all()) == 15 - 0 if len(allids) >= 15 else True, f'{W}: daily target 15')
        pg.click('[data-target="10"]')
        # postpone / understood
        pg.click('[data-rv="postpone"][data-id="c1-q2"]')
        st = json.loads(pg.evaluate(f"localStorage['{SK}']")); ok(st['revision']['log'][f'{B}/c1-q2'][0]['a'] == 'postpone' and 'Postponed until tomorrow' in pg.inner_text('main') and 'c1-q2' in rows('.rv-list:last-of-type'), f'{W}: Postpone moves it to tomorrow, logged')
        ok(pg.evaluate("document.activeElement.dataset.rv") == 'postpone', f'{W}: focus stays in the list')
        pg.click('[data-rv="understood"][data-id="c1-q1"]'); ok('c1-q1' not in rows() and st['revision']['log'] is not None, f'{W}: Understood removes it')
        log = json.loads(pg.evaluate(f"localStorage['{SK}']"))['revision']['log']; ok(set(log) == {f'{B}/c1-q2', f'{B}/c1-q1'}, f'{W}: history kept for both')
        # new miss brings it back
        pg.evaluate(f"() => {{ const s = JSON.parse(localStorage['{SK}']); s.books['{B}'].attempts['c1-q1'].push({{k: 1, ok: false, at: Date.now()}}); localStorage['{SK}'] = JSON.stringify(s); }}"); pg.reload(); pg.wait_for_selector('.rvplan')
        ok(rows()[0] == 'c1-q1' and pg.locator('.rv-why').first.inner_text() == 'Missed 3 times', f'{W}: a new miss after Understood brings it back first')
        # runs in Review mode, offline
        ctx.set_offline(True)
        n = len(pg.locator('.rv-list').first.locator('li').all()); pg.click('#rv-start'); pg.wait_for_selector('#rv-card')
        ok(pg.inner_text('#rv-count') == f'1 / {n}' and 'Revision plan' in pg.inner_text('.rv-top'), f'{W}: Start revision opens Review mode with today’s cards (offline)')
        pg.keyboard.press('Space'); pg.keyboard.press('1'); pg.wait_for_timeout(100)
        ok(pg.inner_text('#rv-count') == f'2 / {n}', f'{W}: Review keys work in the plan')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-review.png')
        ctx.set_offline(False)
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp')
        with pg.expect_download() as d: pg.click('#exp')
        ex = json.load(open(d.value.path())); ok(ex['study']['revision']['target'] == 10 and len(ex['study']['revision']['log']) == 2, f'{W}: plan history in export')
        pg.evaluate(f"() => {{ const s = JSON.parse(localStorage['{SK}']); s.books = {{}}; localStorage['{SK}'] = JSON.stringify(s); }}"); pg.goto(BASE + f'/#/revision/{B}'); pg.reload(); pg.wait_for_selector('.rvplan')
        ok('Nothing studied in this book yet' in pg.inner_text('main'), f'{W}: empty state explains')
        ok(pg.evaluate('document.documentElement.scrollWidth') <= W, f'{W}: no sideways scroll')
        ctx.close()
    b.close(); finish([e for e in errs if 'ERR_INTERNET_DISCONNECTED' not in e])  # offline step: CDN font requests are expected to fail
