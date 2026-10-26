"""Tutor continuity (mocked API, no paid calls): follow-ups send the earlier history and stay on the
book/chapter/card/scope the conversation started in; 'New conversation' sends no old context; earlier
conversations are saved and reopen with their original context; retry keeps the question without duplicating
history; textbook-retrieved vs additional explanation are visibly separate blocks."""
from common import *
import json
B = 'heat-mass-transfer'
def ans(n): return f'### From the textbook\nTextbook part {n}: \\(q = -k\\,dT/dx\\).\n\n### Additional explanation\nExtra part {n}.'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        sent = []; mode = {'v': 'ok'}
        def handler(route):
            if route.request.method != 'POST': return route.fallback()
            body = json.loads(route.request.post_data); sent.append(body)
            if mode['v'] == 'fail': mode['v'] = 'ok'; return route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': {'code': 'provider_error', 'message': 'Temporarily unavailable.'}}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': ans(len(sent)), 'sources': [{'kind': 'book', 'label': 'Ch 1'}], 'passages': [], 'retrieval': {}, 'conversationId': body['conversationId']}))
        pg.route('**/api/tutor', handler)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.goto(BASE + f'/#/read/{B}/1/3'); pg.wait_for_timeout(1000)
        pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        ok(pg.is_disabled('#t-saved'), f'{W}: Saved disabled while there is nothing saved')
        pg.fill('#t-input', 'Q1 what is Fourier law?'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log >> text=Extra part 1')
        ok(sent[0]['messages'] == [] and sent[0]['cardId'] == 'c1-3' and sent[0]['scope'] == 'card', f'{W}: first question has no history, card c1-3')
        bk, ex = pg.locator('#t-log .t-sec-book'), pg.locator('#t-log .t-sec-extra')
        ok(bk.count() == 1 and ex.count() == 1 and 'Textbook part 1' in bk.inner_text() and 'Extra part 1' in ex.inner_text() and 'Extra' not in bk.inner_text(), f'{W}: textbook vs additional explanation in separate blocks')
        pg.locator('#t-log .t-msg.bot').last.screenshot(path=f'{OUT}/{W}-sections.png')
        # move to another card: follow-up stays on the original card/scope
        pg.click('#t-close'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(700); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(700)
        pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        ctxt = pg.inner_text('#t-ctx'); ok('Conversation from' in ctxt and 'Card 3' in ctxt, f'{W}: panel shows where the conversation started: {ctxt!r}')
        ok(pg.is_disabled('[data-scope="chapter"]') and pg.is_disabled('[data-scope="book"]'), f'{W}: scope fixed for an ongoing conversation')
        pg.fill('#t-input', 'Q2 and why the minus sign?'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log >> text=Extra part 2')
        f = sent[1]; ok(f['cardId'] == 'c1-3' and f['chapterId'] == 1 and f['scope'] == 'card', f'{W}: follow-up keeps origin card/scope ({f["cardId"]}, {f["scope"]})')
        ok([m['content'] for m in f['messages']] == ['Q1 what is Fourier law?', ans(1)], f'{W}: follow-up sends the earlier question and answer as history')
        # failure -> retry keeps question, history not duplicated
        mode['v'] = 'fail'; pg.fill('#t-input', 'Q3 units?'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-retry')
        ok(pg.input_value('#t-input') == 'Q3 units?', f'{W}: failed question kept in the box')
        pg.click('#t-retry'); pg.wait_for_selector('#t-log >> text=Extra part 4')
        ok(sent[3]['question'] == 'Q3 units?' and sent[3]['messages'] == sent[2]['messages'] and len(sent[3]['messages']) == 4, f'{W}: retry resends same question with same history')
        conv = json.loads(pg.evaluate("localStorage['learnscroll-tutor-v1']"))[B]
        ok([m['content'] for m in conv['messages'] if m['role'] == 'user'] == ['Q1 what is Fourier law?', 'Q2 and why the minus sign?', 'Q3 units?'], f'{W}: stored history has each question once')
        # new conversation: no old context, current card
        pg.click('#t-new'); pg.wait_for_timeout(200)
        ok('Q1' not in pg.inner_text('#t-log') and 'Conversation from' not in pg.inner_text('#t-ctx') and 'Card 5' in pg.inner_text('#t-ctx'), f'{W}: new conversation is empty and follows the current card')
        ok(not pg.is_disabled('[data-scope="chapter"]'), f'{W}: scope selectable again')
        pg.click('[data-scope="chapter"]'); pg.fill('#t-input', 'Q4 fresh topic'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log >> text=Extra part 5')
        ok(sent[4]['messages'] == [] and sent[4]['conversationId'] != sent[0]['conversationId'] and sent[4]['scope'] == 'chapter', f'{W}: new conversation sends no old history and a new id')
        ok(pg.inner_text('#t-saved') == 'Saved (1)', f'{W}: earlier conversation saved ({pg.inner_text("#t-saved")})')
        # reopen the saved one
        pg.click('#t-saved'); pg.wait_for_selector('.t-saved-item'); pg.screenshot(path=f'{OUT}/{W}-saved-list.png')
        ok('Q1 what is Fourier law?' in pg.inner_text('.t-saved-list') and 'Card 3' in pg.inner_text('.t-saved-list') and pg.evaluate("document.activeElement.classList.contains('t-saved-item')"), f'{W}: saved list shows first question + origin; focus moves into it')
        pg.click('.t-saved-item'); pg.wait_for_timeout(300)
        ok('Q2 and why' in pg.inner_text('#t-log') and 'Q4' not in pg.inner_text('#t-log') and 'Card 3' in pg.inner_text('#t-ctx'), f'{W}: reopened conversation shows its messages and original context')
        pg.fill('#t-input', 'Q5 back to Fourier'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log >> text=Extra part 6')
        ok(sent[5]['conversationId'] == sent[0]['conversationId'] and sent[5]['cardId'] == 'c1-3' and len(sent[5]['messages']) == 6, f'{W}: reopened follow-up sends its own history and origin')
        pg.reload(); pg.wait_for_timeout(1000); pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        ok('Q5 back to Fourier' in pg.inner_text('#t-log') and pg.inner_text('#t-saved') == 'Saved (1)', f'{W}: after reload, active + saved conversations persist')
        pg.click('#t-saved'); pg.wait_for_selector('.t-saved-item'); ok('Q4 fresh topic' in pg.inner_text('.t-saved-list') and 'This chapter' in pg.inner_text('.t-saved-list'), f'{W}: the swapped-out conversation is in the saved list')
        pg.screenshot(path=f'{OUT}/{W}-reopened.png'); pg.close()
    errs[:] = [x for x in errs if '503' not in x]
    b.close(); finish(errs)
