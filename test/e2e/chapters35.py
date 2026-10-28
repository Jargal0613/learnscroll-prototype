"""Heat & Mass Transfer Chapters 3-5: reachable from the chapter list with verified titles, a description and real
counts; cards show section/equation references and KaTeX without page overflow; quizzes give feedback with a
source; formulas save to the notebook and a study sheet; calculators, guided practice, connections, revision and
progress all work with the new chapters; Chapters 1-2 keep their saved progress."""
from common import *
import json, os
B = 'heat-mass-transfer'; SK = 'learnscroll-study-v1'
X = json.load(open(os.path.join(os.path.dirname(__file__), '../../data/heat-mass-transfer-ext.json')))
TITLES = {3: 'Steady Heat Conduction', 4: 'Transient Heat Conduction', 5: 'Numerical Methods in Heat Conduction'}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        posts = []; pg.route('**/api/**', lambda r: (posts.append(r.request.url), r.fallback()) if r.request.method == 'POST' else r.fallback())
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q'); pg.wait_for_load_state('networkidle')
        # existing Chapter 1 progress must survive
        pg.evaluate("""k => { const s = JSON.parse(localStorage[k] || '{}'); s.books = s.books || {}; s.books['heat-mass-transfer'] = { chapter: 1, card: 4, done: {}, seen: { 1: 4 }, marks: { 'c1-5': { b: true } } }; localStorage[k] = JSON.stringify(s); }""", SK)
        pg.goto(BASE + f'/#/book/{B}'); pg.reload(); pg.wait_for_selector('.chapters')
        for n in (3, 4, 5):
            row = pg.locator(f'a.chap[href="#/read/{B}/{n}"]'); ch = X['chapters'][n - 3]
            t = row.inner_text() if row.count() else ''
            ok(row.count() == 1 and TITLES[n] in t and ch['desc'][:30] in t, f'{W}: chapter {n} “{TITLES[n]}” listed with its description')
            nf = sum(1 for c in ch['cards'] if c.get('eq'))
            ok(f"{len(ch['cards'])} cards" in t and f'{nf} formulas' in t and f"{len(ch['quiz'])} questions" in t, f'{W}: ch {n} counts from data ({t.splitlines()[-1] if t else ""})')
        ok('Card 5/' in pg.locator(f'a.chap[href="#/read/{B}/1"]').inner_text(), f'{W}: Chapter 1 progress kept')
        ok(pg.locator('.chap.soon').count() == 12, f'{W}: chapters 6–17 still “Coming soon”')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-chapters.png', full_page=True)
        # reader: Chapter 3 card 8 (cylinder/sphere resistances), equation + ref, KaTeX, no page overflow
        pg.goto(BASE + f'/#/read/{B}/3/8'); pg.wait_for_timeout(900)
        card = pg.locator('.card').nth(7)
        ok('eqs. 3–39, 3–41' in card.locator('.sec').inner_text().lower() and card.locator('.eq .katex').count() >= 1, f'{W}: card shows its equation numbers and KaTeX formula')
        ok(pg.locator('.katex-error').count() == 0, f'{W}: no KaTeX errors in Chapter 3')
        sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); ok(sw[0] <= sw[1], f'{W}: no sideways page scroll {sw}')
        ok(card.locator('a.c-calc').count() == 2, f'{W}: two Calculate links (cylinder and sphere resistance)')
        if W != 1728: card.screenshot(path=f'{OUT}/{W}-card-3-8.png')
        for n in (4, 5):
            pg.goto(BASE + f'/#/read/{B}/{n}/1'); pg.wait_for_timeout(700); ok(pg.locator('.katex-error').count() == 0 and pg.locator('.card .eq .katex').count() >= 5, f'{W}: Chapter {n} formulas render')
        # quiz in Chapter 4
        nc = len(X['chapters'][1]['cards']); q = X['chapters'][1]['quiz'][0]
        pg.goto(BASE + f'/#/read/{B}/4/{nc + 1}'); pg.wait_for_timeout(800)
        qc = pg.locator('.card.quiz').first
        ok('based on sec. 4–1' in qc.inner_text().lower(), f'{W}: quiz shows its source section')
        qc.locator('.opt').nth(q['answer']).click(); pg.wait_for_timeout(200)
        ok(qc.locator('.feedback').inner_text().startswith('Correct.'), f'{W}: answer key works')
        # save the R_wall formula (c3-2) and add it to a study sheet
        pg.goto(BASE + f'/#/read/{B}/3/2'); pg.wait_for_timeout(800)
        pg.locator('.card').nth(1).locator('.f-save').click(); pg.wait_for_timeout(200)
        f = pg.evaluate(f"Object.values(JSON.parse(localStorage['{SK}']).formulas || {{}})")
        ok(any(x.get('card') == 'c3-2' and x.get('chapter') == 3 for x in f), f'{W}: Chapter 3 formula saved to the notebook')
        pg.goto(BASE + '/#/formulas'); pg.wait_for_timeout(500)
        ok('Thermal resistance of a wall' in pg.inner_text('main') and pg.locator('.f-calc a.c-calc').count() >= 1, f'{W}: notebook lists it with a Calculate link')
        pg.goto(BASE + '/#/calc/r-wall'); pg.wait_for_selector('#c-form')
        pg.fill('#c-v-L', '0.3'); pg.fill('#c-v-k', '0.9'); pg.fill('#c-v-A', '15'); pg.click('#c-go'); pg.wait_for_timeout(100)
        ok('0.02222 K/W' in pg.inner_text('.c-ans'), f'{W}: R_wall = 0.02222 K/W (Example 3–1) ({pg.inner_text(".c-ans")})')
        pg.click('#c-addbtn'); pg.wait_for_selector('#c-addmsg a')
        sh = pg.evaluate(f"Object.values(JSON.parse(localStorage['{SK}']).sheets)")
        ok(len(sh) == 1 and sh[0]['items'][0]['calc'] == 'r-wall', f'{W}: Chapter 3 calculation added to a study sheet')
        # lumped calculator validity note
        pg.goto(BASE + '/#/calc/lumped'); pg.wait_for_selector('#c-form'); ok('Bi ≤ 0.1' in pg.inner_text('.c-cond'), f'{W}: lumped calculator states Bi ≤ 0.1')
        # guided practice: Example 4–1
        pg.goto(BASE + '/#/practice/ex4-1'); pg.wait_for_selector('.p-steps')
        pg.fill('#p-in-calculation', '10'); pg.select_option('#p-unit', 's'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(80)
        ok(pg.locator('#ps-calculation.done').count() == 1, f'{W}: Example 4–1: 10 s accepted')
        pg.fill('#p-in-calculation', '1'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(80)
        ok(pg.locator('#ps-calculation .p-msg.bad').count() == 1 and 'factor of 10' in pg.inner_text('#ps-calculation .p-msg'), f'{W}: 1 s flagged as a factor of ten off')
        pg.goto(BASE + '/#/practice/ex3-9'); pg.wait_for_selector('.p-steps')
        pg.fill('#p-in-calculation', '105'); pg.select_option('#p-unit', '°C'); pg.click('[data-check="calculation"]'); pg.wait_for_timeout(80)
        ok(pg.locator('#ps-calculation.done').count() == 1, f'{W}: Example 3–9: 105 °C accepted')
        pg.goto(BASE + '/#/practice'); pg.wait_for_selector('.p-list'); ok(pg.locator('.p-list .f-item').count() == 9, f'{W}: 9 textbook examples listed')
        # connections on c3-10 with a reason; + Revise puts c3-9 in the revision plan
        pg.goto(BASE + f'/#/read/{B}/3/10'); pg.wait_for_timeout(800)
        rc = pg.locator('.card').nth(9).locator('details.rc'); rc.locator('summary').click(); pg.wait_for_timeout(100)
        ok('Prerequisite' in rc.inner_text() and 'balances insulation resistance' in rc.inner_text(), f'{W}: connection with label and reason')
        rc.locator('li[data-to="c3-9"] .rc-add').click(); pg.wait_for_timeout(100)
        pg.goto(BASE + f'/#/revision/{B}'); pg.wait_for_timeout(500)
        ok('Multilayered cylinders and spheres' in pg.inner_text('main'), f'{W}: Chapter 3 card in the revision plan')
        pg.goto(BASE + f'/#/progress/{B}'); pg.wait_for_selector('.pgpage')
        ok('3. Steady Heat Conduction' in pg.inner_text('#pg-chapters') and 'Multilayered cylinders' in pg.inner_text('#pg-needs'), f'{W}: progress lists Chapter 3 and the card needing review')
        ok(not posts, f'{W}: no API POSTs while studying ({posts})')
        ctx.close()
    b.close(); finish(errs)
