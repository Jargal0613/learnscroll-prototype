"""Round 13: the shared tutor on reading-book sections. Same panel and endpoint; context = book, chapter, section and
an optional selected passage (the server adds the bounded section excerpt itself); updates on navigation; separate
conversations per book; no requests on open/close/navigate; 'Based on this section' labelling. Mocked POSTs."""
from common import *
import json
A, N = 'ai-history', 'neuro-history'
MOCK = {'configured': True, 'provider': 'mock', 'books': {'heat-mass-transfer': True, A: True, N: True}, 'textbook': {'heat-mass-transfer': True, A: False, N: False}, 'solver': True}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, Hh in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': Hh}); watch(pg, errs); posts = []
        def h(route):
            if route.request.method == 'GET': return route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK))
            body = json.loads(route.request.post_data); posts.append((body, len(route.request.post_data)))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': f'### From this section\nAnswer {len(posts)}', 'sources': [], 'passages': [], 'retrieval': {'status': 'section', 'book': body['bookId'], 'section': (body.get('pageContext') or {}).get('sectionId')}, 'conversationId': body['conversationId']}))
        pg.route('**/api/tutor', h)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        pg.goto(BASE + f'/#/books/{A}/02_01'); pg.reload(); pg.wait_for_selector('.tb-bar .g-ask')
        pg.click('.tb-bar .g-ask'); pg.wait_for_selector('#tutor:not([hidden])')
        ok('Reading · 2.1' in pg.inner_text('#t-ctx') and 'Artificial Intelligence' in pg.inner_text('#t-ctx'), f'{W}: panel context: book, Reading · section 2.1')
        ok(pg.is_hidden('#t-solve-row'), f'{W}: no engineering problem solver for this book')
        chips = pg.locator('#t-log [data-suggest]').all_inner_texts(); ok(any('section' in c for c in chips), f'{W}: section suggestions ({len(chips)})')
        pg.click('#t-close'); pg.click('#tb-next'); pg.wait_for_selector('.tb-art h1:has-text("2.2")'); pg.click('.tb-bar .g-ask'); pg.click('#t-close')
        ok(not posts, f'{W}: open, close and navigate: no POST')
        pg.click('.tb-bar .g-ask'); pg.fill('#t-input', 'What is a half adder?'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log [data-ret="section"]')
        body, size = posts[-1]; pc = body.get('pageContext') or {}
        ok(body['bookId'] == A and pc.get('pageType') == 'book-section' and pc.get('sectionId') == '02_02' and pc.get('chapterId') == 2 and body['cardId'] is None, f'{W}: payload: ai-history, chapter 2, section 02_02')
        ok(size < 8000 and not pc.get('excerpt'), f'{W}: no book text in the request ({size} bytes); the server adds the bounded excerpt')
        ok('Based on this section' in pg.inner_text('#t-log [data-ret="section"]') and pg.locator('#t-log [data-check]').count() == 0, f'{W}: labelled "Based on this section"; no check button')
        # selection becomes context (bounded) on the next question
        pg.click('#t-close')
        pg.evaluate("""() => { const p = document.querySelector('.tb-art p'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
        pg.wait_for_timeout(100); pg.evaluate("document.querySelector('.tb-bar .g-ask').click()"); pg.wait_for_selector('#tutor:not([hidden])')
        ok('selected text' in pg.inner_text('#t-ctx'), f'{W}: selected passage shown as context')
        pg.fill('#t-input', 'Explain the selected part'); pg.keyboard.press('Enter'); pg.wait_for_function('document.querySelectorAll("#t-log .t-msg.bot:not(.loading)").length >= 2')
        pc = posts[-1][0]['pageContext']; ok(0 < len(pc.get('excerpt', '')) <= 600 and len(posts[-1][0]['messages']) == 2, f'{W}: selection sent ({len(pc.get("excerpt", ""))} chars) with the earlier messages')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-reading-tutor.png')
        box = pg.locator('#tutor').bounding_box()
        ok((400 <= box['width'] <= 440) if W >= 1200 else box['width'] == W, f'{W}: panel {box["width"]:.0f}px ({"side" if W >= 1200 else "full screen"})')
        # another book: its own conversation
        pg.evaluate("document.getElementById('t-close').click()"); pg.goto(BASE + f'/#/books/{N}/04_02'); pg.wait_for_selector('.tb-art h1:has-text("SECTION 4.2")'); pg.wait_for_timeout(400); pg.wait_for_selector('.tb-bar .g-ask'); pg.click('.tb-bar .g-ask')
        ok('Answer 1' not in pg.inner_text('#t-log') and pg.locator('#t-log .t-msg').count() == 0 and 'Reading · 4.2' in pg.inner_text('#t-ctx'), f'{W}: Neuroscience has its own conversation and context')
        pg.fill('#t-input', 'What is a synapse?'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log [data-ret="section"]')
        ok(posts[-1][0]['bookId'] == N and posts[-1][0]['pageContext']['sectionId'] == '04_02', f'{W}: Neuroscience question carries its own book and section')
        pg.evaluate("document.getElementById('t-close').click()"); pg.goto(BASE + f'/#/books/{A}/02_02'); pg.wait_for_selector('.tb-art h1:has-text("SECTION 2.2")'); pg.wait_for_timeout(400); pg.wait_for_selector('.tb-bar .g-ask'); pg.click('.tb-bar .g-ask')
        ok('Answer 2' in pg.inner_text('#t-log'), f'{W}: back in the AI book, its conversation is still there')
        # contents page has no tutor button; Heat & Mass reader tutor unchanged
        pg.evaluate("document.getElementById('t-close').click()"); pg.goto(BASE + f'/#/books/{A}'); pg.wait_for_selector('#tb-go')
        ok(pg.locator('.g-ask').count() == 0 and pg.locator('#g-tutor-host').count() == 0, f'{W}: contents page: no tutor (needs a section)')
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/1'); pg.wait_for_selector('#tutorBtn'); pg.wait_for_timeout(400); pg.click('#tutorBtn'); pg.fill('#t-input', 'Fourier?'); pg.keyboard.press('Enter'); pg.wait_for_function('!document.getElementById("t-send").disabled')
        ok(posts[-1][0]['bookId'] == 'heat-mass-transfer' and posts[-1][0]['pageContext']['pageType'] == 'reader', f'{W}: Heat & Mass reader tutor unchanged')
        pg.close()
    finish(errs)
