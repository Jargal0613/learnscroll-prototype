from common import *
import json, time
SK, XK = 'learnscroll-study-v1', 'learnscroll-session-v1'
SEED = {'books': {'heat-mass-transfer': {'chapter': 1, 'card': 10, 'done': {}, 'marks': {'c1-5': {'d': True}}, 'seen': {'1': 10}, 'notes': {}, 'review': {'c2-3': {'r': 'again', 'at': 1793000000000}, 'c1-2': {'r': 'got', 'at': 1793000000000}}}}, 'last': 'heat-mass-transfer', 'recent': []}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs); pg.clock.install()
        pg.goto(BASE + '/#/'); pg.evaluate("s => { localStorage.clear(); localStorage.setItem('learnscroll-study-v1', JSON.stringify(s)); }", SEED); pg.reload(); pg.wait_for_selector('#sessStart')
        pg.click('#sessStart'); pg.wait_for_selector('#sessGo')
        pg.click('[data-book="heat-mass-transfer"]'); pg.click('[data-min="10"]')
        q = pg.inner_text('.sess-q'); ok(q.startswith('1 difficult card · 1 review-again card'), f'{W} queue counts: {q}')
        pg.screenshot(path=f'{OUT}/{W}-setup.png')
        pg.click('#sessGo'); pg.wait_for_selector('#left'); pg.wait_for_timeout(1200)
        ids = pg.evaluate(f"JSON.parse(localStorage['{XK}']).ids")
        ok(ids[:3] == ['c1-5', 'c2-3', 'c1-12'], f'order difficult -> again -> unstudied: {ids[:3]}')
        ok('c1-2' not in ids and 'c1-11' not in ids, 'studied/got-it cards not queued')
        ok(pg.inner_text('#count').startswith('1 / '), 'card count shown'); ok('left' in pg.inner_text('#left'), 'time remaining shown: ' + pg.inner_text('#left'))
        ok(pg.locator('#line').evaluate("e => parseFloat(e.style.width) > 0"), 'progress bar')
        pg.screenshot(path=f'{OUT}/{W}-session-card1.png')
        pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(900)
        pg.click('#tutorBtn'); pg.wait_for_timeout(300); ctx = pg.inner_text('#t-ctx'); ok('Ch 2' in ctx, 'tutor follows the session card chapter: ' + ctx.replace('\n', ' | ')); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.keyboard.press('b'); pg.wait_for_timeout(100)
        ok(pg.evaluate(f"JSON.parse(localStorage['{SK}']).books['heat-mass-transfer'].marks['c2-3'].b") is True, 'marking works in session')
        pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(900)
        ok(pg.evaluate(f"JSON.parse(localStorage['{SK}']).books['heat-mass-transfer'].seen['1']") == 11, 'unstudied card viewed in order advances progress')
        pg.reload(); pg.wait_for_selector('#left'); pg.wait_for_timeout(1000)
        ok(pg.inner_text('#count').startswith('3 / '), 'refresh resumes the session at the same card')
        pg.clock.run_for(11 * 60 * 1000); pg.wait_for_selector('#sessMsg:not([hidden])')
        ok("up" in pg.inner_text('#sessMsg') and pg.inner_text('#left') == 'Time’s up', 'gentle end when time is up (no forced stop)')
        pg.screenshot(path=f'{OUT}/{W}-time-up.png')
        pg.click('#sessDone'); pg.wait_for_selector('#sessSum')
        sm = pg.inner_text('#sessSum'); ok('Cards seen\n3' in sm.replace('\t', '\n') and 'Cards marked\n1' in sm.replace('\t', '\n'), 'summary: ' + sm.replace('\n', ' | '))
        ok(len(pg.evaluate(f"JSON.parse(localStorage['{SK}']).sessions")) == 1 and pg.evaluate(f"localStorage['{XK}']") is None, 'summary saved, session cleared')
        pg.screenshot(path=f'{OUT}/{W}-summary.png')
        # end early via Esc
        pg.click('#sessGo'); pg.wait_for_selector('#left'); pg.wait_for_timeout(800); pg.keyboard.press('Escape'); pg.wait_for_selector('#sessSum')
        ok(len(pg.evaluate(f"JSON.parse(localStorage['{SK}']).sessions")) == 2, 'end early with Esc saves a summary')
        pg.goto(BASE + '/#/'); pg.wait_for_timeout(400); ok('last:' in pg.inner_text('main').lower(), 'library shows last session'); pg.screenshot(path=f'{OUT}/{W}-library.png')
        pg.close()
    b.close(); finish(errs)
