"""Quiz feedback: a wrong answer says what you chose and why the right answer is right (from the question's own data);
'Explain with tutor' is optional, opens the tutor with the question + chapter filled in and sends nothing until Send;
it starts a fresh conversation about that question (earlier one saved). Retry flow and mistake review unchanged."""
from common import *
import json, os, re
B = 'heat-mass-transfer'
D = json.load(open(os.path.join(os.path.dirname(__file__), '../../data/heat-mass-transfer.json')))
CH = D['chapters'][0]; NC = len(CH['cards']); Q = CH['quiz'][0]; L = 'ABCD'
plain = lambda h: re.sub(r'<[^>]*>', '', h).strip()
OLD = {B: {'conversationId': 'cold', 'messages': [{'role': 'user', 'content': 'earlier chat', 'at': 1}, {'role': 'assistant', 'content': 'earlier answer', 'at': 2, 'retrieval': {}}], 'draft': '', 'scope': 'card',
       'origin': {'chapter': 1, 'label': 'Card 1: x', 'scope': 'card', 'cardId': 'c1-1'}}}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs); sent = []
        pg.route('**/api/tutor', lambda r: r.fallback() if r.request.method != 'POST' else (sent.append(json.loads(r.request.post_data)), r.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': '### From the textbook\nok', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': 'x'})))[1])
        pg.goto(BASE + '/#/'); pg.evaluate("c => { localStorage.clear(); localStorage.setItem('learnscroll-tutor-v1', JSON.stringify(c)); }", OLD)
        pg.goto(BASE + f'/#/read/{B}/1/{NC + 1}'); pg.reload(); pg.wait_for_timeout(1000)
        card = pg.locator('.card.quiz').first; wrong = (Q['answer'] + 1) % 4
        card.locator('.opt').nth(wrong).click(); pg.wait_for_timeout(300); fb = card.locator('.feedback')
        t = fb.inner_text()
        ok(f'You chose {L[wrong]}' in t and plain(Q['options'][wrong]) in t, f'{W}: wrong answer names what you chose')
        ok(f'Why {L[Q["answer"]]} is right:' in t and plain(Q['why']).split('\\(')[0][:20] in t, f'{W}: why the right answer is right, from the stored explanation')
        ok(f'Correct answer: {L[Q["answer"]]}' in t, f'{W}: correct answer line kept')
        ok(pg.locator('#tutor').is_hidden() and not sent, f'{W}: tutor not opened and nothing sent automatically')
        fb.scroll_into_view_if_needed(); pg.wait_for_timeout(200); pg.screenshot(path=f'{OUT}/{W}-wrong-feedback.png')
        ok(fb.locator('.fb-tutor').count() == 1, f'{W}: optional Explain with tutor action')
        fb.locator('.fb-tutor').click(); pg.wait_for_timeout(400)
        v = pg.input_value('#t-input')
        ok(pg.locator('#tutor').is_visible() and plain(Q['q'])[:30] in v and f'Ch 1' in v and f'I chose {L[wrong]}' in v, f'{W}: tutor opened with question + chapter filled in: {v[:90]!r}')
        ok(not sent and pg.evaluate("document.activeElement.id") == 't-input', f'{W}: nothing sent until Send; focus in the box')
        ok('earlier chat' not in pg.inner_text('#t-log') and pg.inner_text('#t-saved') == 'Saved (1)', f'{W}: fresh conversation; earlier one saved')
        ok('Practice 1' in pg.inner_text('#t-ctx'), f'{W}: tutor context is the practice question ({pg.inner_text("#t-ctx")!r})')
        pg.screenshot(path=f'{OUT}/{W}-explain-prefilled.png')
        pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log .t-msg.bot')
        ok(len(sent) == 1 and sent[0]['cardId'] == 'c1-q1' and sent[0]['chapterId'] == 1 and sent[0]['messages'] == [] and sent[0]['question'] == v, f'{W}: Send passes the question with its chapter/card and no old history')
        pg.click('#t-close')
        # correct answer path
        card2 = pg.locator('.card.quiz').nth(1); q2 = CH['quiz'][1]; card2.scroll_into_view_if_needed(); card2.locator('.opt').nth(q2['answer']).click(); pg.wait_for_timeout(200)
        t2 = card2.locator('.feedback').inner_text(); ok(t2.startswith('Correct.') and 'You chose' not in t2 and plain(q2['why']).split('\\(')[0][:15] in t2, f'{W}: correct answer shows the short why')
        # retry + mistake review unchanged
        att = json.loads(pg.evaluate("localStorage['learnscroll-study-v1']"))['books'][B]['attempts']; ok(att['c1-q1'][-1]['ok'] is False, f'{W}: attempt still recorded')
        pg.goto(BASE + f'/#/mistakes/{B}/1'); pg.wait_for_timeout(500); pg.locator('.opt').nth(wrong).click(); pg.wait_for_timeout(200)
        mt = pg.inner_text('#mx-card') if pg.locator('#mx-card').count() else pg.inner_text('main')
        ok('Not quite.' in mt and 'You chose' not in mt and pg.locator('.fb-tutor').count() == 0, f'{W}: mistake review feedback unchanged')
        pg.close()
    b.close(); finish(errs)
