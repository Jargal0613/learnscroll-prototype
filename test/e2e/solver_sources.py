"""Problem solver source states, end to end: the real /api/solve handler (fake provider, no network) produces the
response for 'retrieved' / 'none' / 'failed'; the browser gets exactly that JSON and must show three distinct states
and never a textbook citation without a retrieved passage."""
from common import *
import json, subprocess, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'test/fixtures/solver-states.js')]))
H = 'heat-mass-transfer'; PROB = 'A 0.2 m wall with k = 0.8 W/m K has 50 K across it. Find q.'
for k in ('retrieved', 'none', 'failed'): ok(SERVER[k]['retrieval']['status'] == k, f'server output state {k}')
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, Hh in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': Hh}); watch(pg, errs); state = {'k': 'retrieved'}
        pg.route('**/api/tutor', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'configured': True, 'provider': 'mock', 'books': {H: True}, 'solver': True})))
        pg.route('**/api/solve', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SERVER[state['k']])))
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        pg.goto(BASE + f'/#/read/{H}/1/1'); pg.reload(); pg.wait_for_timeout(700); pg.click('#tutorBtn'); pg.wait_for_selector('#t-solve'); pg.click('#t-solve')
        for k in ('retrieved', 'none', 'failed'):
            state['k'] = k; n = pg.locator('.t-msg.solve').count()
            pg.fill('#t-input', PROB); pg.keyboard.press('Enter'); pg.wait_for_function(f"document.querySelectorAll('.t-msg.solve').length > {n}")
            last = pg.locator('.t-msg.solve').last; txt = last.inner_text()
            ok(last.locator(f'[data-ret="{k}"]').count() == 1, f'{W}: {k}: its own state block')
            if k == 'retrieved':
                ok('source retrieved from the textbook (1 passage)' in txt.lower() and 'From the textbook · Section 1-6' in txt, f'{W}: retrieved: passage + equation citation shown ({txt[-200:]!r})')
                last.locator('summary').click(); ok('Fourier law states' in last.inner_text(), f'{W}: retrieved passage excerpt visible')
            else:
                head = 'No relevant textbook passage found' if k == 'none' else 'Textbook search failed'
                ok(head in txt and 'From the textbook ·' not in txt and 'Retrieved passage' not in txt and last.locator('.sv-part:not(.extra)').count() == 0, f'{W}: {k}: "{head}", no citation, no From-the-textbook part')
                ok('Fourier law for plane walls' in txt, f'{W}: {k}: model text kept under Additional explanation')
            if W != 1728: last.screenshot(path=f'{OUT}/{W}-{k}.png')
        pg.reload(); pg.wait_for_timeout(700); pg.click('#tutorBtn'); pg.wait_for_selector('.t-msg.solve')
        ok([pg.locator('.t-msg.solve').nth(i).locator('[data-ret]').get_attribute('data-ret') for i in range(3)] == ['retrieved', 'none', 'failed'], f'{W}: states survive reload')
        pg.close()
    b.close(); finish(errs)
