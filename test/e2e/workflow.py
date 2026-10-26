"""End-to-end study workflow QA at desktop (1440, 1728) and phone (390): open book, read, refresh + resume,
bookmark, note, ask tutor (mocked: slow -> Thinking state; failure -> Retry -> success), quiz (wrong answer),
review mistakes, export; focus placement, browser back/forward, and data surviving reloads. No paid calls."""
from common import *
import json, time
B = 'heat-mass-transfer'
DATA = json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), '../../data/heat-mass-transfer.json')))
CH1 = DATA['chapters'][0]; NC = len(CH1['cards']); Q0 = CH1['quiz'][0]
S = lambda pg: json.loads(pg.evaluate("localStorage['learnscroll-study-v1'] || '{}'"))
def active(pg): return pg.evaluate("(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : ''; })()")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        phone = W < 700; tag = f'{W}'
        ctx = b.new_context(viewport={'width': W, 'height': H}, has_touch=phone, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        tap = (lambda s: pg.tap(s)) if phone else (lambda s: pg.click(s))
        mode = {'v': 'slow'}; calls = []; held = []
        def handler(route):
            if route.request.method != 'POST': return route.fallback()
            calls.append(mode['v'])
            if mode['v'] == 'slow': held.append(route); mode['v'] = 'fail'; return  # answered later: request stays in flight
            if False: return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': '### From the textbook\nSlow but fine.', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': 'cw'}))
            if mode['v'] == 'fail': mode['v'] = 'ok'; return route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': {'code': 'provider_error', 'message': 'The tutor is temporarily unavailable.'}}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': '### From the textbook\nRetried answer.', 'sources': [{'kind': 'book', 'label': 'Ch 1'}], 'passages': [], 'retrieval': {}, 'conversationId': 'cw'}))
        pg.route('**/api/tutor', handler)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#sessStart')
        # open book -> chapter
        tap(f'a[href="#/book/{B}"]'); pg.wait_for_timeout(400); ok(pg.url.endswith(f'#/book/{B}'), f'{tag}: open book')
        tap(f'a[href^="#/read/{B}/1"]'); pg.wait_for_selector('#feed'); pg.wait_for_timeout(800)
        ok(active(pg) == 'feed', f'{tag}: reader takes focus for keys ({active(pg)})')
        for _ in range(2): tap('#next'); pg.wait_for_timeout(700)
        ok(pg.inner_text('#count').startswith('3'), f'{tag}: moved to card 3 ({pg.inner_text("#count")})')
        # refresh -> resume
        pg.reload(); pg.wait_for_selector('#feed'); pg.wait_for_timeout(900); ok(pg.inner_text('#count').startswith('3'), f'{tag}: refresh resumes at card 3')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#continue'); ok('Card 3' in pg.inner_text('#continue'), f'{tag}: library offers Resume at card 3')
        tap('#continue'); pg.wait_for_selector('#feed'); pg.wait_for_timeout(900); ok(pg.inner_text('#count').startswith('3'), f'{tag}: Resume opens card 3')
        # bookmark + note
        tap('.mark[data-mark="b"][data-id="c1-3"]'); pg.wait_for_timeout(200)
        ok(S(pg)['books'][B]['marks'].get('c1-3') == {'b': True} and pg.get_attribute('.mark[data-mark="b"][data-id="c1-3"]', 'aria-pressed') == 'true', f'{tag}: bookmark saved + pressed state')
        tap('.mark[data-mark="n"][data-id="c1-3"]'); pg.wait_for_timeout(250); ok(active(pg).startswith('') and pg.evaluate("document.activeElement.tagName") == 'TEXTAREA', f'{tag}: note editor focused')
        pg.keyboard.type('Workflow note ✓'); pg.wait_for_timeout(900); pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        ok(S(pg)['books'][B]['notes'].get('c1-3', {}).get('text') == 'Workflow note ✓', f'{tag}: note saved')
        ok(pg.evaluate("document.activeElement.matches('.mark[data-mark=\"n\"]')"), f'{tag}: focus returns to Add note after closing ({active(pg)})')
        # tutor: slow -> fail -> retry
        tap('#tutorBtn'); pg.wait_for_timeout(300); ok(active(pg) == 't-input', f'{tag}: tutor input focused')
        pg.fill('#t-input', 'What is conduction?'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
        ok(pg.inner_text('#t-send') == 'Thinking…' and pg.is_disabled('#t-send'), f'{tag}: slow API shows Thinking… and blocks double send')
        pg.wait_for_timeout(1200); ok(pg.is_disabled('#t-send'), f'{tag}: still waiting after 1.6 s')
        held[0].fulfill(status=200, content_type='application/json', body=json.dumps({'answer': '### From the textbook\nSlow but fine.', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': 'cw'}))
        pg.wait_for_selector('#t-log >> text=Slow but fine.', timeout=8000); ok(True, f'{tag}: slow answer arrives')
        pg.fill('#t-input', 'And radiation?'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-retry', timeout=8000)
        ok('temporarily unavailable' in pg.inner_text('#t-log'), f'{tag}: failure explained with Retry'); pg.screenshot(path=f'{OUT}/{tag}-tutor-error.png')
        tap('#t-retry'); pg.wait_for_selector('#t-log >> text=Retried answer.', timeout=8000)
        conv = json.loads(pg.evaluate("localStorage['learnscroll-tutor-v1']"))[B]['messages']
        ok(calls == ['slow', 'fail', 'ok'] and [m['role'] for m in conv] == ['user', 'assistant', 'user', 'assistant'] and conv[2]['content'] == 'And radiation?', f'{tag}: retry resends same question once; history clean ({calls})')
        pg.screenshot(path=f'{OUT}/{tag}-tutor-retried.png')
        tap('#t-close'); pg.wait_for_timeout(200); ok(active(pg) == 'tutorBtn', f'{tag}: closing tutor returns focus to Ask tutor')
        # quiz: answer the first question wrong
        pg.goto(BASE + f'/#/read/{B}/1/{NC + 1}'); pg.wait_for_timeout(1000)
        wrong = (Q0['answer'] + 1) % len(Q0['options'])
        pg.locator('.card.quiz').first.locator('.opt').nth(wrong).click(); pg.wait_for_timeout(300)
        ok('Not quite' in pg.locator('.card.quiz').first.inner_text(), f'{tag}: wrong quiz answer explained')
        at = S(pg)['books'][B].get('attempts', {}); ok(at.get('c1-q1') and at['c1-q1'][-1]['ok'] is False, f'{tag}: attempt saved')
        # back/forward
        pg.goto(BASE + f'/#/book/{B}'); pg.wait_for_timeout(400); pg.go_back(); pg.wait_for_selector('#feed'); pg.wait_for_timeout(700)
        ok('/read/' in pg.url and pg.locator('#feed').count() == 1, f'{tag}: browser Back returns to reader')
        pg.go_forward(); pg.wait_for_timeout(500); ok(pg.url.endswith(f'#/book/{B}'), f'{tag}: Forward returns to book')
        # review mistakes
        pg.goto(BASE + f'/#/mistakes/{B}/1'); pg.wait_for_timeout(600)
        ok(pg.evaluate("document.activeElement.classList.contains('opt')"), f'{tag}: mistakes retry focuses first option')
        pg.locator('.opt').nth(Q0['answer']).click(); pg.wait_for_timeout(250); ok(active(pg) == 'mx-go', f'{tag}: focus moves to Next after answering')
        tap('#mx-go'); pg.wait_for_timeout(300); ok('right this time' in pg.inner_text('main') and 'No mistakes left' in pg.inner_text('main'), f'{tag}: mistake cleared')
        pg.screenshot(path=f'{OUT}/{tag}-mistakes-done.png')
        # export
        pg.goto(BASE + '/#/'); pg.wait_for_timeout(400)
        with pg.expect_download() as d: tap('#exp')
        e = json.load(open(d.value.path())); hb = e['study']['books'][B]
        ok(hb['marks'].get('c1-3') == {'b': True} and hb['notes']['c1-3']['text'] == 'Workflow note ✓' and len(hb['attempts']['c1-q1']) == 2, f'{tag}: export contains bookmark, note and both attempts')
        with pg.expect_download() as d: tap('#expMd')
        md = open(d.value.path()).read(); ok('Workflow note ✓' in md, f'{tag}: Markdown export contains the note')
        pg.reload(); pg.wait_for_timeout(500); ok(S(pg)['books'][B]['notes']['c1-3']['text'] == 'Workflow note ✓', f'{tag}: everything survives a final reload')
        if phone: ok(pg.evaluate("document.documentElement.scrollWidth") <= W, f'{tag}: no horizontal scroll at the end')
        pg.screenshot(path=f'{OUT}/{tag}-library-end.png'); ctx.close()
    errs[:] = [x for x in errs if '503' not in x]  # the mocked failure itself
    b.close(); finish(errs)
