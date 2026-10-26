"""Quiz mistakes: attempts saved per question, 'Review mistakes' after wrong answers, retry shows answer + explanation,
attempts survive export -> clear -> import."""
from common import *
import json, tempfile
SK = 'learnscroll-study-v1'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        quiz = pg.evaluate("fetch('data/heat-mass-transfer.json').then(r => r.json()).then(b => b.chapters[0].quiz.map(q => q.answer))")
        nc = pg.evaluate("fetch('data/heat-mass-transfer.json').then(r => r.json()).then(b => b.chapters[0].cards.length)")
        pg.goto(f'{BASE}/#/read/heat-mass-transfer/1/{nc + 1}'); pg.reload(); pg.wait_for_timeout(1200)
        wrong = []
        for i, ans in enumerate(quiz):
            pick = ans if i % 2 else (ans + 1) % 4   # questions 1, 3, 5 wrong
            if not i % 2: wrong.append(f'c1-q{i + 1}')
            pg.locator('.card.quiz').nth(i).locator('.opt').nth(pick).click(); pg.wait_for_timeout(100)
        att = pg.evaluate(f"JSON.parse(localStorage['{SK}']).books['heat-mass-transfer'].attempts")
        ok(len(att) == len(quiz) and all('k' in a[0] and 'ok' in a[0] and 'at' in a[0] for a in att.values()), f'{W} attempt saved per question id ({len(att)})')
        ok(sorted(k for k, v in att.items() if not v[-1]['ok']) == sorted(wrong), 'wrong answers recorded as mistakes')
        pg.keyboard.press('End'); pg.locator('#mistakesBtn').scroll_into_view_if_needed(); pg.wait_for_timeout(500)
        ok(pg.locator('#mistakesBtn').is_visible() and f'({len(wrong)})' in pg.inner_text('#mistakesBtn'), 'Review mistakes offered with count')
        pg.screenshot(path=f'{OUT}/{W}-end-card.png')
        pg.click('#mistakesBtn'); pg.wait_for_selector('#mx-card .opt')
        ok(pg.inner_text('#mx-count') == f'1 / {len(wrong)}', 'only mistakes are retried')
        ok('Last time you chose' in pg.inner_text('#mx-card'), 'shows previous choice')
        pg.screenshot(path=f'{OUT}/{W}-retry-question.png')
        for n, qid in enumerate(wrong):
            i = int(qid.split('q')[1]) - 1
            pick = quiz[i] if n == 0 else (quiz[i] + 1) % 4   # fix the first, miss the rest again
            pg.locator('#mx-card .opt').nth(pick).click(); pg.wait_for_selector('#mx-next:not([hidden])')
            fb = pg.inner_text('#mx-card .feedback')
            ok('Correct answer' in fb and len(fb) > 40, f'answer + explanation shown after question {n + 1}')
            if n == 0: pg.screenshot(path=f'{OUT}/{W}-retry-feedback.png')
            pg.keyboard.press('Enter') if n == 0 else pg.click('#mx-go'); pg.wait_for_timeout(150)
        ok(f'1 of {len(wrong)} right' in pg.inner_text('#mx-card') and pg.locator('#mx-again').count() == 1, 'summary + retry remaining')
        pg.screenshot(path=f'{OUT}/{W}-summary.png')
        pg.click('#mx-again'); pg.wait_for_selector('#mx-count'); ok(pg.inner_text('#mx-count') == f'1 / {len(wrong) - 1}', 'retry remaining has only still-wrong ones')
        # export -> clear -> import keeps attempts
        before = pg.evaluate(f"JSON.parse(localStorage['{SK}']).books['heat-mass-transfer'].attempts")
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp')
        with pg.expect_download() as dl: pg.click('#exp')
        path = tempfile.gettempdir() + f'/mist-{W}.json'; dl.value.save_as(path)
        ok(json.load(open(path))['study']['books']['heat-mass-transfer']['attempts'] == before, 'attempts exported')
        pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#exp'); pg.set_input_files('#imp-file', path); pg.wait_for_selector('#imp-merge')
        ok('Quiz attempts' in pg.inner_text('main'), 'import summary lists quiz attempts'); pg.click('#imp-merge'); pg.wait_for_timeout(400)
        ok(pg.evaluate(f"JSON.parse(localStorage['{SK}']).books['heat-mass-transfer'].attempts") == before, 'attempts restored by import')
        ctx.close()
    b.close(); finish(errs)
