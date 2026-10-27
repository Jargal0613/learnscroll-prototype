"""My progress: descriptive, local numbers only; "Not enough data" instead of zeros; weak areas link to cards and a
revision session; no score, streaks or rankings; fits a phone."""
from common import *
import json
B = 'heat-mass-transfer'; SK = 'learnscroll-study-v1'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        ok(pg.locator('.tools-line a[href="#/progress"]').count() == 1, f'{W}: home links to My progress')
        pg.click('.tools-line a[href="#/progress"]'); pg.wait_for_selector('.pgpage')
        t = pg.inner_text('main')
        ok(t.count('Not enough data') == 5 and '0%' not in t, f'{W}: empty: "Not enough data" in all 5 sections, no 0%')
        low = t.lower(); ok(not any(w in low for w in ['mastery', 'streak', 'rank', 'score']), f'{W}: no score, streak or ranking words')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-empty.png', full_page=True)
        # seed realistic activity
        now = pg.evaluate('Date.now()'); D = 86400000
        pg.evaluate("""([k, now, D]) => { const s = JSON.parse(localStorage[k] || '{}'); s.books = s.books || {}; const bs = s.books['heat-mass-transfer'] = s.books['heat-mass-transfer'] || {};
          Object.assign(bs, { chapter: 1, card: 0, done: {}, seen: { 1: 9 }, marks: { 'c1-5': { d: true } }, notes: {}, review: { 'c1-4': { r: 'got', at: now - D } },
            attempts: { 'c1-q1': [{ k: 0, ok: false, at: now - D }, { k: 1, ok: true, at: now - D }], 'c1-q2': [{ k: 0, ok: false, at: now }, { k: 0, ok: false, at: now }], 'c1-q3': [{ k: 1, ok: true, at: now }] } });
          localStorage[k] = JSON.stringify(s); }""", [SK, now, D])
        pg.reload(); pg.wait_for_selector('.pgpage')
        ok('10 of' in pg.inner_text('#pg-cards') and 'isn’t the same as understanding' in pg.inner_text('#pg-cards'), f'{W}: cards opened 10, with the opened≠understood note')
        ok('40%' in pg.inner_text('#pg-quiz') and 'of 5 answers' in pg.inner_text('#pg-quiz'), f'{W}: quiz 2 of 5 answers correct = 40% ({pg.inner_text("#pg-quiz")!r})')
        needs = pg.locator('#pg-needs li'); ok(needs.count() == 2 and 'Marked difficult' in pg.inner_text('#pg-needs') and 'Missed' in pg.inner_text('#pg-needs'), f'{W}: 2 concepts need review with reasons')
        ok(pg.locator('#pg-recent .pg-days li').count() == 7 and 'Not enough data' not in pg.inner_text('#pg-recent'), f'{W}: 7-day activity shown')
        sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); ok(sw[0] <= sw[1], f'{W}: no sideways scroll {sw}')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-data.png', full_page=True)
        h1 = pg.inner_text('main'); pg.reload(); pg.wait_for_selector('.pgpage'); ok(pg.inner_text('main') == h1, f'{W}: same numbers after reload (deterministic)')
        pg.locator('#pg-needs li a').first.click(); pg.wait_for_timeout(700)
        ok(pg.evaluate('location.hash').startswith(f'#/read/{B}/1'), f'{W}: weak area opens its card')
        pg.goto(BASE + '/#/progress'); pg.wait_for_selector('#pg-rev'); pg.click('#pg-rev'); pg.wait_for_timeout(500)
        ok(pg.evaluate('location.hash') == f'#/revision/{B}', f'{W}: revision session link')
        ctx.close()
    b.close(); finish(errs)
