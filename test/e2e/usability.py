"""Usability-test kit (dev only, ?usability=1): hidden without the flag; real data is never replaced without typing
RESET, and is downloaded + kept so "Restore my real data" brings it back exactly; each scenario A-E sets up its
start state; test profiles are always labeled; sample data is marked [Sample]; no network requests are made."""
from common import *
import json
SK, B = 'learnscroll-study-v1', 'heat-mass-transfer'
REAL = {'schema': 2, 'books': {B: {'chapter': 2, 'card': 3, 'done': {'1': True}, 'seen': {'1': 25, '2': 3}, 'marks': {}, 'notes': {'c2-1': {'text': 'my real note', 'at': 1761500000000}}, 'review': {}, 'attempts': {}}}, 'last': B, 'recent': [], 'sessions': []}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        reqs = []; pg.on('request', lambda r: r.method != 'GET' and reqs.append(r.url))
        pg.goto(BASE + '/#/usability'); pg.wait_for_selector('#helpBtn')
        ok('Usability test kit' not in pg.inner_text('body'), f'{W}: kit hidden without the dev flag')
        pg.evaluate("([k, v]) => { localStorage.clear(); localStorage[k] = JSON.stringify(v); }", [SK, REAL])
        real_raw = pg.evaluate(f"localStorage['{SK}']")
        U = BASE + '/?usability=1#/usability'
        pg.goto(U); pg.reload(); pg.wait_for_selector('.ut-list')
        ok(pg.locator('.ut-list > li').count() == 5 and all(t in pg.inner_text('.ut-list') for t in ('Start:', 'Task:', 'Done when:')), f'{W}: five scenarios with start state, task and completion criteria')
        ok('real study data' in pg.inner_text('.ut-state') and pg.is_visible('#ut-reset'), f'{W}: real data detected; RESET confirmation required')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-kit.png', full_page=True)
        pg.click('[data-sc="b"]'); pg.wait_for_timeout(300)
        ok(pg.evaluate(f"localStorage['{SK}']") == real_raw and 'Type RESET first' in pg.inner_text('main'), f'{W}: without RESET nothing changes')
        pg.fill('#ut-reset', 'reset'); pg.click('[data-sc="b"]'); pg.wait_for_timeout(300)
        ok(pg.evaluate(f"localStorage['{SK}']") == real_raw, f'{W}: wrong confirmation text changes nothing')
        pg.fill('#ut-reset', 'RESET')
        with pg.expect_download() as d: pg.click('[data-sc="b"]')
        pg.wait_for_load_state(); pg.wait_for_selector('#continue')
        bk = json.load(open(d.value.path()))
        ok('before-usability-test' in d.value.suggested_filename and bk['study']['books'][B]['notes']['c2-1']['text'] == 'my real note', f'{W}: real data downloaded before the reset')
        ok(pg.is_visible('.tp-bar') and 'sample data' in pg.inner_text('.tp-bar'), f'{W}: test profile clearly labeled')
        ok('Ch 1' in pg.inner_text('#continue') and 'Card 13' in pg.inner_text('#continue') and pg.locator('#guide').count() == 0, f'{W}: scenario B start state: resume at Ch 1 card 13, no guide')
        st = json.loads(pg.evaluate(f"localStorage['{SK}']")); ok(all(n['text'].startswith('[Sample]') for n in st['books'][B]['notes'].values()), f'{W}: sample notes marked [Sample]')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-scenario-b.png')
        # other scenarios (no RESET needed now: test profile, not real data)
        pg.goto(U); pg.wait_for_selector('.ut-list'); ok(not pg.is_visible('#ut-reset') and 'Test profile active' in pg.inner_text('.ut-state'), f'{W}: in a test profile no RESET needed')
        pg.click('[data-sc="a"]'); pg.wait_for_load_state(); pg.wait_for_selector('#helpBtn'); ok(pg.is_visible('#guide') and pg.locator('#continue').count() == 0, f'{W}: scenario A: clean profile shows the guide')
        pg.goto(U); pg.wait_for_selector('.ut-list'); pg.click('[data-sc="c"]'); pg.wait_for_load_state(); pg.wait_for_selector('#tutorBtn')
        pg.wait_for_timeout(800); ok(pg.inner_text('#count').startswith('13 /'), f'{W}: scenario C: reader opens on card 13 (Fourier’s law): {pg.inner_text("#count")}')
        pg.goto(U); pg.wait_for_selector('.ut-list'); pg.click('[data-sc="d"]'); pg.wait_for_load_state(); pg.wait_for_timeout(800)
        st = json.loads(pg.evaluate(f"localStorage['{SK}']")); a = st['books'][B]['attempts']['c1-q1'][-1]
        ok(a['ok'] is False and pg.inner_text('#count').startswith('26 /'), f'{W}: scenario D: one wrong attempt seeded; reader at practice question 1')
        pg.goto(U); pg.wait_for_selector('.ut-list'); pg.click('[data-sc="e"]'); pg.wait_for_load_state(); pg.wait_for_selector('#exp')
        with pg.expect_download() as d2: pg.click('#exp')
        pg.goto(U); pg.wait_for_selector('.ut-list'); pg.click('#ut-clean'); pg.wait_for_load_state(); pg.wait_for_selector('#imp')
        ok(pg.evaluate(f"localStorage['{SK}'] === undefined"), f'{W}: scenario E: clean profile has no study data')
        pg.set_input_files('#imp-file', d2.value.path()); pg.wait_for_selector('#imp-over'); pg.uncheck('#imp-backup'); pg.click('#imp-over'); pg.wait_for_timeout(400)
        ok('[Sample] Test note' in pg.evaluate(f"localStorage['{SK}']"), f'{W}: scenario E end-to-end: sample note restored by import')
        # restore real data exactly
        pg.goto(U); pg.wait_for_selector('.ut-list'); pg.click('#ut-restore'); pg.wait_for_load_state(); pg.wait_for_selector('#helpBtn')
        ok(pg.evaluate(f"localStorage['{SK}']") == real_raw and pg.locator('.tp-bar').count() == 0 and pg.evaluate("localStorage['learnscroll-real-snapshot'] === undefined && localStorage['learnscroll-test-profile'] === undefined"), f'{W}: Restore brings back the real data exactly and removes the test profile')
        ok(not reqs, f'{W}: no non-GET requests (no telemetry): {reqs[:2]}')
        ctx.close()
    b.close(); finish(errs)
