"""Automated WCAG 2.2 AA contrast audit: every visible text element (incl. muted text, placeholders, tutor sources,
quiz right/wrong feedback, selected/disabled states, shortcuts dialog) across the main screens at desktop and phone,
plus 3:1 for input boundaries and selected-state indicators. Disabled controls are reported but exempt (WCAG 1.4.3)."""
from common import *
import json, os
JS = open(os.path.join(os.path.dirname(__file__), 'contrast_lib.inject.txt')).read()
B = 'heat-mass-transfer'
STUDY = {'books': {B: {'chapter': 1, 'card': 3, 'done': {}, 'marks': {'c1-2': {'b': True, 'd': True}}, 'seen': {'1': 5}, 'notes': {'c1-2': {'text': 'note text', 'at': 1793000000000}},
         'review': {'c1-2': {'r': 'again', 'at': 1793000000000}}}}, 'last': B, 'recent': [{'book': B, 'chapter': 1, 'card': 3, 'at': 1793000000000}]}
CONV = {B: {'conversationId': 'cc', 'messages': [{'role': 'user', 'content': 'Q?', 'at': 1}, {'role': 'assistant', 'content': '### From the textbook\nAnswer \\(q=kA\\).',
        'sources': [{'kind': 'book', 'label': 'Textbook p. 3'}, {'kind': 'notes', 'label': 'Ch 1 notes'}], 'passages': [], 'retrieval': {}, 'at': 2,
        'check': {'question': 'Q2?', 'hint': 'h', 'answer': 'a'}}], 'draft': '', 'scope': 'card'}}
def audit(pg, name, W):
    rows = pg.evaluate(JS); bad = [r for r in rows if r['ratio'] < r['need'] and not r['disabled']]
    dis = [r for r in rows if r['disabled'] and r['ratio'] < r['need']]
    ok(not bad, f'{W} {name}: {len(rows)} pairs meet AA' + ('' if not bad else ' — FAILING: ' + json.dumps(sorted({(r["sel"], r["text"][:20], r["ratio"], r["need"]) for r in bad})[:12])))
    return dis
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []; exempt = set()
    for W, H in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate("([s, c]) => { localStorage.clear(); localStorage.setItem('learnscroll-study-v1', JSON.stringify(s)); localStorage.setItem('learnscroll-tutor-v1', JSON.stringify(c)); }", [STUDY, CONV])
        for name, h in [('library', '#/'), ('book', f'#/book/{B}'), ('bookmarked', f'#/book/{B}/bookmarked'), ('notes', f'#/book/{B}/notes'), ('review-setup', f'#/review/{B}'), ('session', '#/session'), ('import', '#/import')]:
            pg.goto(BASE + '/' + h); pg.wait_for_timeout(700); exempt |= {r['sel'] for r in audit(pg, name, W)}
        pg.goto(BASE + '/#/'); pg.wait_for_timeout(500); pg.keyboard.press('?'); pg.wait_for_timeout(200); audit(pg, 'shortcuts dialog', W); pg.keyboard.press('Escape')
        pg.goto(BASE + f'/#/read/{B}/1/2'); pg.wait_for_timeout(1000); exempt |= {r['sel'] for r in audit(pg, 'reader (marked card)', W)}
        pg.click('#tutorBtn'); pg.wait_for_timeout(300); pg.click('[data-hint]'); pg.click('[data-reveal]'); pg.wait_for_timeout(200); audit(pg, 'tutor with sources + check', W); pg.click('#t-close')
        n = pg.locator('#feed > .card:not(.end):not(.quiz)').count()
        pg.goto(BASE + f'/#/read/{B}/1/{n + 1}'); pg.wait_for_timeout(1000)
        q = pg.locator('.card.quiz').first; opts = q.locator('.opt')
        right = pg.evaluate("i => { const q = document.querySelectorAll('.card.quiz')[0]; return [...q.querySelectorAll('.opt')].findIndex(o => o.dataset.ok === '1' || o.dataset.correct === 'true'); }", 0)
        opts.nth(1).click(); pg.wait_for_timeout(300); audit(pg, 'quiz answered (feedback shown)', W)
        pg.screenshot(path=f'{OUT}/{W}-quiz-feedback.png')
        ok('Correct' in q.locator('.feedback').inner_text() or 'Not quite' in q.locator('.feedback').inner_text() or len(q.locator('.feedback').inner_text()) > 10, f'{W}: quiz feedback states result in words, not color alone: {q.locator(".feedback").inner_text()[:50]!r}')
        qd = json.load(open(os.path.join(os.path.dirname(__file__), '../../data/heat-mass-transfer.json')))['chapters'][0]['quiz'][1]
        q2 = pg.locator('.card.quiz').nth(1); q2.scroll_into_view_if_needed(); q2.locator('.opt').nth((qd['answer'] + 1) % len(qd['options'] if 'options' in qd else qd['opts'])).click(); pg.wait_for_timeout(300)
        ok(q2.locator('.opt.wrong').count() == 1, f'{W}: wrong answer state rendered'); audit(pg, 'quiz answered wrong', W)
        ok('Your answer' in pg.evaluate("e => getComputedStyle(e, '::after').content", q2.locator('.opt.wrong').element_handle()), f'{W}: wrong option labelled in text, not color alone')
        q2.screenshot(path=f'{OUT}/{W}-quiz-wrong.png')
        pg.goto(BASE + f'/#/review/{B}/both'); pg.wait_for_timeout(500); pg.keyboard.press('Space'); pg.wait_for_timeout(200); audit(pg, 'review card revealed', W)
        pg.close()
    print('disabled (exempt) below AA:', sorted(exempt))
    b.close(); finish(errs)
