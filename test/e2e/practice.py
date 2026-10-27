"""Guided problem practice: textbook examples only, five steps (knowns, equation, substitution, calculation, units),
try first then progressive hints then the full solution, local checks with tolerances and unit conversion,
attempts and struggled steps saved and exported, AI hints only via the tutor route (mocked here) with the work kept
on a rate limit or failure. Works offline."""
from common import *
import json
B = 'heat-mass-transfer'; SK = 'learnscroll-study-v1'
posts = []
def tutor_route(mode):
    def h(route):
        r = route.request
        if r.method == 'GET': return route.fulfill(status=200, content_type='application/json', body=json.dumps({'books': {B: {'available': True}}, 'solver': mode['solver']}))
        posts.append(json.loads(r.post_data or '{}'))
        if mode['post'] == 429: return route.fulfill(status=429, headers={'Retry-After': '40'}, content_type='application/json', body=json.dumps({'error': {'code': 'rate_limited', 'message': 'Hint limit reached for now.'}}))
        if mode['post'] == 500: return route.fulfill(status=500, content_type='application/json', body='{}')
        return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': 'Think about how much power each sample carries.', 'sources': []}))
    return h
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        mode = {'solver': True, 'post': 429}
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.route('**/api/tutor', tutor_route(mode))
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        ok(pg.locator('.tools-line a[href="#/practice"]').count() == 1, f'{W}: home links to problem practice')
        pg.click('.tools-line a[href="#/practice"]'); pg.wait_for_selector('.p-list')
        items = pg.locator('.p-list .f-item'); ok(items.count() == 6 and all('Example' in t for t in items.locator('.f-tag').first.all_inner_texts()), f'{W}: 6 textbook examples listed')
        ok(pg.locator('.p-stat').first.inner_text() == 'Not started', f'{W}: status before trying')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-list.png', full_page=True)
        # reader card links to its example
        pg.goto(BASE + f'/#/read/{B}/1/13'); pg.wait_for_timeout(600)
        l = pg.locator('.card').nth(12).locator('a.p-link'); ok(l.count() == 1 and 'Example 1–6' in l.inner_text(), f'{W}: reader card c1-13 links to Example 1–6')
        l.click(); pg.wait_for_selector('.p-steps')
        ok(pg.evaluate('location.hash') == '#/practice/ex1-6' and 'Example 1–6' in pg.inner_text('.meta-line'), f'{W}: opens Example 1–6')
        ok(pg.locator('.p-step').count() == 5 and [x.lower() for x in pg.locator('.p-step h2').all_inner_texts()][0].startswith('1. knowns'), f'{W}: five steps')
        # try first: hint disabled until something typed; full solution locked
        ok(pg.locator('[data-hint="knowns"]').is_disabled() and pg.locator('#p-full').is_disabled(), f'{W}: hints and full solution locked before trying')
        ok(pg.locator('#p-ai').is_visible(), f'{W}: AI hint offered when the server reports the solver on')
        pg.fill('#p-in-knowns', 'I = 0.4 A, V = 110 V, D = 5 cm'); ok(not pg.locator('[data-hint="knowns"]').is_disabled(), f'{W}: typing unlocks the first hint')
        pg.click('[data-hint="knowns"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-knowns .p-hints li').count() == 1 and pg.input_value('#p-in-knowns').startswith('I = 0.4'), f'{W}: hint 1 shown, draft kept')
        pg.click('[data-hint="knowns"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-knowns .p-hints li').count() == 2 and pg.locator('[data-reveal="knowns"]').count() == 1, f'{W}: hint 2, then the step can be shown')
        pg.click('[data-compare="knowns"]'); pg.wait_for_timeout(60)
        ok('15 °C' in pg.inner_text('#ps-knowns .p-ref'), f'{W}: compare shows the reference knowns')
        pg.click('[data-self="knowns:1"]'); pg.wait_for_timeout(60)
        # equation: wrong then right
        pg.check('input[name="p-eq"][value="convection"]'); pg.click('[data-check="equation"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-equation .p-msg.bad').count() == 1, f'{W}: wrong equation flagged')
        pg.check('input[name="p-eq"][value="plane-wall"]'); pg.click('[data-check="equation"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-equation.done').count() == 1, f'{W}: right equation accepted')
        # calculation: junk is not counted, wrong value, factor of 10, correct in another unit
        pg.fill('#p-in-calculation', 'abc'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(60)
        m = pg.inner_text('#ps-calculation .p-msg'); ok('isn’t a number' in m and 'NaN' not in m, f'{W}: non-number explained ({m})')
        ok(pg.locator('#p-full').is_disabled(), f'{W}: junk input doesn’t unlock the solution')
        pg.fill('#p-in-calculation', '2.24'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(60)
        ok('factor of 10' in pg.inner_text('#ps-calculation .p-msg'), f'{W}: factor-of-ten hint')
        pg.fill('#p-in-calculation', '30'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-calculation .p-msg.bad').count() == 1 and not pg.locator('#p-full').is_disabled(), f'{W}: wrong value; full solution unlocked after trying')
        pg.fill('#p-in-calculation', '22.3'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-calculation.done').count() == 1 and pg.locator('.p-solved').count() == 1, f'{W}: 22.3 W/m·K accepted (2% tolerance), solved')
        pg.fill('#p-in-units', 'W/(m K)'); pg.click('[data-check="units"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-units.done').count() == 1, f'{W}: unit written as W/(m K) accepted')
        # AI hint: rate limited -> calm message, work kept; failure -> message; ok -> hint
        pg.fill('#p-in-substitution', 'k = 22*0.03/(0.00196*15)')
        pg.click('#p-ai'); pg.wait_for_selector('.p-ai')
        ok('Hint limit reached' in pg.inner_text('.p-ai') and 'about 1 minute' in pg.inner_text('.p-ai') and pg.input_value('#p-in-substitution').startswith('k = 22'), f'{W}: 429 -> limit message, work kept')
        q = posts[-1]; ok(q.get('practiceHint') is True and q.get('cardId') == 'c1-13' and q.get('scope') == 'card' and 'Do not give the final' in q.get('question', ''), f'{W}: hint request goes to the tutor route, flagged, card scope')
        mode['post'] = 500; pg.click('#p-ai'); pg.wait_for_timeout(300)
        ok('unavailable' in pg.inner_text('.p-ai').lower() and pg.input_value('#p-in-substitution').startswith('k = 22'), f'{W}: failure message, work kept')
        mode['post'] = 200; pg.click('#p-ai'); pg.wait_for_timeout(300)
        ok('Tutor hint (AI)' in pg.inner_text('.p-ai') and 'each sample' in pg.inner_text('.p-ai'), f'{W}: AI hint shown')
        pg.click('#p-full'); pg.wait_for_selector('#p-solution')
        ok(pg.locator('#p-solution h3').count() == 5 and '22.4' in pg.inner_text('#p-solution'), f'{W}: full solution has all five steps')
        sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); ok(sw[0] <= sw[1], f'{W}: no sideways scroll {sw}')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-solved.png', full_page=True)
        st = pg.evaluate(f"JSON.parse(localStorage['{SK}'])")['practice']['ex1-6']
        ok(st['solved'] is True and sorted(st['struggled']) == ['calculation', 'knowns'] and st['hints'] == {'knowns': 2} and len(st['attempts']) >= 7, f'{W}: attempts and struggled steps saved ({st["struggled"]})')
        # offline: a fresh problem still checks
        ctx.set_offline(True)
        pg.goto(BASE + '/#/practice/ex2-17'); pg.wait_for_selector('.p-steps')
        pg.fill('#p-in-calculation', '126'); pg.select_option('#p-unit', '°C'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(60)
        ok(pg.locator('#ps-calculation.done').count() == 1, f'{W}: offline: 126 °C accepted for Example 2–17')
        ctx.set_offline(False)
        pg.goto(BASE + '/#/practice'); pg.wait_for_selector('.p-list')
        ok('Solved' in pg.locator('.f-item[data-pid="ex1-6"] .p-stat').inner_text() and 'knowns' in pg.locator('.f-item[data-pid="ex1-6"] .p-stat').inner_text(), f'{W}: list shows status and steps to review')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp')
        with pg.expect_download() as d: pg.click('#exp')
        ex = json.load(open(d.value.path()))
        ok(ex['version'] >= 5 and ex['study']['practice']['ex1-6']['solved'] is True and 'calculation' in ex['study']['practice']['ex1-6']['struggled'], f'{W}: practice exported (format 5)')
        ctx.close()
        # solver off: no AI hint button
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        pg.route('**/api/tutor', tutor_route({'solver': False, 'post': 200}))
        pg.goto(BASE + '/#/practice/ex1-2'); pg.wait_for_selector('.p-steps'); pg.wait_for_timeout(300)
        ok(pg.locator('#p-ai').is_hidden(), f'{W}: no AI hint when the solver is off')
        ctx.close()
    b.close(); finish([e for e in errs if 'ERR_INTERNET_DISCONNECTED' not in e and '429' not in e and '500' not in e])
