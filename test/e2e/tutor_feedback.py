"""Tutor answer feedback (mocked API, no paid calls): Helpful / Needs improvement under each completed answer,
optional reasons for negative feedback, stored on that answer in this browser, survives reload and reopening a
saved conversation, keyboard-operable, copy/selection unaffected, nothing sent to the server, included in export
and accepted on import, clear error when the save fails."""
from common import *
import json
B, TK = 'heat-mass-transfer', 'learnscroll-tutor-v1'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        posts = []
        def handler(route):
            if route.request.method == 'GET': return route.fulfill(status=200, content_type='application/json', body=json.dumps({'configured': True, 'provider': 'mock', 'books': {B: True}}))
            body = json.loads(route.request.post_data); posts.append(body)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': f'Answer {len(posts)}: heat flux \\(q\\) in W/m².', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': body['conversationId']}))
        pg.route('**/api/tutor', handler)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.goto(BASE + f'/#/read/{B}/1/2'); pg.wait_for_timeout(900)
        pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        for n, q in enumerate(('first question', 'second question'), 1):
            pg.fill('#t-input', q); pg.keyboard.press('Enter'); pg.wait_for_selector(f'#t-log >> text=Answer {n}')
        bots = pg.locator('#t-log .t-msg.bot')
        ok(bots.count() == 2 and pg.locator('#t-log .t-fb').count() == 2, f'{W}: feedback row under each completed answer')
        ok(pg.locator('#t-log .t-msg.user .t-fb').count() == 0, f'{W}: no feedback on user messages')
        # helpful on answer 0 by mouse
        bots.nth(0).locator('[data-v="helpful"]').click()
        st = lambda: json.loads(pg.evaluate(f"localStorage['{TK}']"))[B]['messages']
        ok(st()[1]['feedback']['rating'] == 'helpful' and 'feedback' not in st()[3], f'{W}: helpful stored on that answer only')
        ok(bots.nth(0).locator('[data-v="helpful"]').get_attribute('aria-pressed') == 'true' and 'saved in this browser' in bots.nth(0).locator('.t-fb').inner_text(), f'{W}: pressed state + saved note shown')
        # needs improvement on answer 1 by keyboard, then reasons
        nb = bots.nth(1).locator('[data-v="needs_work"]'); nb.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
        ok(pg.evaluate("document.activeElement.dataset.v") == 'needs_work', f'{W}: focus stays on the button after keyboard use')
        chips = bots.nth(1).locator('.t-chip'); ok(chips.count() == 4 and [c.inner_text().replace('✓ ', '') for c in chips.all()] == ['Incorrect', 'Unclear', 'Wrong source', 'Equation or units issue'], f'{W}: 4 optional reasons offered')
        bots.nth(1).locator('[data-r="units"]').click(); pg.keyboard.press('Tab'); pg.wait_for_timeout(50)
        fb = st()[3]['feedback']; ok(fb['rating'] == 'needs_work' and fb['reasons'] == ['units'], f'{W}: negative feedback + reason stored ({fb})')
        if W != 1728: pg.locator('#tutor').screenshot(path=f'{OUT}/{W}-feedback.png')
        # change mind: helpful replaces negative; clicking again clears
        bots.nth(1).locator('[data-v="helpful"]').click(); ok(st()[3]['feedback']['rating'] == 'helpful' and st()[3]['feedback']['reasons'] == [] and bots.nth(1).locator('.t-chip').count() == 0, f'{W}: switching to helpful clears reasons')
        bots.nth(1).locator('[data-v="helpful"]').click(); ok('feedback' not in st()[3], f'{W}: clicking the pressed button again removes feedback')
        bots.nth(1).locator('[data-v="needs_work"]').click(); bots.nth(1).locator('[data-r="incorrect"]').click()
        ok(all('feedback' not in json.dumps(x) for x in posts), f'{W}: feedback never sent to the server')
        # selection / copy of the answer text still works
        sel = pg.evaluate("""() => { const el = document.querySelectorAll('#t-log .t-msg.bot .t-body')[0]; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString(); }""")
        ok('Answer 1' in sel and 'Helpful' not in sel, f'{W}: answer text selectable without feedback labels')
        # persists across reload and reopen from Saved
        pg.reload(); pg.wait_for_timeout(900); pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        bots = pg.locator('#t-log .t-msg.bot')
        ok(bots.nth(0).locator('[data-v="helpful"]').get_attribute('aria-pressed') == 'true' and bots.nth(1).locator('[data-r="incorrect"]').get_attribute('aria-pressed') == 'true', f'{W}: feedback survives reload')
        pg.click('#t-new'); pg.click('#t-saved'); pg.click('.t-saved-item'); pg.wait_for_timeout(200)
        ok(pg.locator('#t-log .t-msg.bot').nth(1).locator('[data-r="incorrect"]').get_attribute('aria-pressed') == 'true', f'{W}: feedback survives reopening a saved conversation')
        # export includes it; import accepts it
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp')
        with pg.expect_download() as d: pg.click('#exp')
        ex = json.load(open(d.value.path())); fbs = [m.get('feedback') for m in ex['tutor']['conversations'][B]['messages'] if m.get('feedback')]
        ok(len(fbs) == 2 and fbs[1]['reasons'] == ['incorrect'], f'{W}: feedback included in export')
        pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#imp')
        pg.set_input_files('#imp-file', d.value.path()); pg.wait_for_selector('#imp-over'); pg.uncheck('#imp-backup'); pg.click('#imp-over'); pg.wait_for_timeout(400)
        ok(json.loads(pg.evaluate(f"localStorage['{TK}']"))[B]['messages'][3]['feedback']['reasons'] == ['incorrect'], f'{W}: feedback restored by import')
        # save failure: clear error, state not shown as saved
        pg.goto(BASE + f'/#/read/{B}/1/2'); pg.wait_for_timeout(900); pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        pg.evaluate("() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'learnscroll-tutor-v1') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; }")
        bot0 = pg.locator('#t-log .t-msg.bot').nth(0); bot0.locator('[data-v="needs_work"]').click(); pg.wait_for_timeout(200)
        ok("Couldn’t save your feedback" in bot0.inner_text() and bot0.locator('[data-v="needs_work"]').get_attribute('aria-pressed') == 'false', f'{W}: save failure shows a clear error and does not pretend it saved')
        ctx.close()
    b.close(); finish(errs)
