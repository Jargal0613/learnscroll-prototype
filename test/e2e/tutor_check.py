"""Tutor 'Check my understanding' (mocked API; no paid calls): action on each answer, mode=check request,
question rendered with Hint / Reveal answer, current card unchanged, persisted, invalid response handled."""
from common import *
import json
ANS = '### From the textbook\nFourier\'s law: \\(\\dot Q = -kA\\,dT/dx\\).\n\n### Additional explanation\nHeat flows down the gradient.'
CHECK = {'question': 'If the wall thickness doubles, what happens to \\(\\dot Q\\)?', 'hint': 'Look at where \\(L\\) appears.', 'answer': 'It halves, because \\(\\dot Q = kA\\,\\Delta T/L\\).'}
CONV = {'heat-mass-transfer': {'conversationId': 'cchk1', 'messages': [{'role': 'user', 'content': 'Explain Fourier', 'at': 1}, {'role': 'assistant', 'content': ANS, 'sources': [], 'passages': [], 'retrieval': {'provider': 'openai-file-search'}, 'at': 2}], 'draft': '', 'scope': 'card'}}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate("c => { localStorage.clear(); localStorage.setItem('learnscroll-tutor-v1', JSON.stringify(c)); }", CONV)
        sent = []; mode = {'v': 'ok'}
        def handler(route):
            if route.request.method != 'POST': return route.fallback()
            sent.append(json.loads(route.request.post_data))
            if mode['v'] == 'bad': return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': {'code': 'provider_error', 'message': 'The tutor returned an invalid check question. Try again.'}}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'check': CHECK, 'retrieval': {}, 'conversationId': 'cchk1'}))
        pg.route('**/api/tutor', handler)
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/13'); pg.reload(); pg.wait_for_timeout(1200); pg.click('#tutorBtn'); pg.wait_for_selector('.t-check-btn')
        ok(pg.locator('.t-msg.bot .t-check-btn').count() == 1 and pg.inner_text('.t-check-btn') == 'Check my understanding', f'{W} small action on the answer')
        mode['v'] = 'bad'; pg.click('.t-check-btn'); pg.wait_for_selector('.t-check-row .t-err')
        ok('invalid check question' in pg.inner_text('.t-check-row .t-err') and pg.locator('.t-check-btn').is_enabled(), 'invalid response: clear error, can retry')
        mode['v'] = 'ok'; pg.click('.t-check-btn'); pg.wait_for_selector('.t-check')
        r = sent[-1]; ok(r['mode'] == 'check' and r['explanation'].startswith('### From the textbook') and r['cardId'] == 'c1-13' and 'question' not in r, 'request: mode=check, explanation, ids')
        ok(pg.locator('.t-check-hint').is_hidden() and pg.locator('.t-check-ans').is_hidden() and pg.locator('.t-check-q .katex').count() >= 1, 'question rendered (math), hint and answer hidden')
        pg.click('[data-hint]'); ok(pg.locator('.t-check-hint').is_visible() and pg.get_attribute('[data-hint]', 'aria-expanded') == 'true', 'Hint reveals hint')
        pg.click('[data-reveal]'); ok(pg.locator('.t-check-ans').is_visible() and 'halves' in pg.inner_text('.t-check-ans'), 'Reveal answer shows answer')
        ok(pg.inner_text('#count').startswith('13 / '), 'current card unchanged')
        pg.screenshot(path=f'{OUT}/{W}-mock-check.png')
        pg.reload(); pg.wait_for_timeout(1200); pg.click('#tutorBtn'); pg.wait_for_selector('.t-check')
        ok(pg.locator('.t-check-btn').count() == 0 and 'thickness doubles' in pg.inner_text('.t-check-q'), 'check question kept with the conversation')
        pg.close()
    errs[:] = [e for e in errs if 'status of 502' not in e]  # the mocked failure itself
    b.close(); finish(errs)
