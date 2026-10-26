"""Study sheets: create from the library or a chapter, pick saved formulas/notes/bookmarks/difficult cards, reorder,
grouped by book/chapter, student notes visually distinct from card text, print CSS hides chrome and doesn't clip
equations, standalone HTML export, saved locally and in export/import; Back never re-creates a sheet."""
from common import *
import json, re
SK, B, K = 'learnscroll-study-v1', 'heat-mass-transfer', 'koretsky-thermo'
T = 1761500000000
SEED = {'schema': 3, 'books': {B: {'chapter': 1, 'card': 0, 'done': {}, 'seen': {}, 'marks': {'c1-2': {'b': True}, 'c1-q1': {'d': True}}, 'notes': {'c1-13': {'text': 'MY NOTE on Fourier', 'at': T}}, 'review': {}, 'attempts': {}},
                                K: {'chapter': 1, 'card': 0, 'done': {}, 'seen': {}, 'marks': {'c1-1': {'b': True}}, 'notes': {}, 'review': {}, 'attempts': {}}},
        'last': B, 'recent': [], 'sessions': [], 'formulas': {f'f-{B}-c1-13': {'kind': 'card', 'title': 'Conduction: Fourier’s law', 'tex': '\\dot Q_\\text{cond} = -kA\\,\\frac{dT}{dx}', 'book': B, 'chapter': 1, 'card': 'c1-13', 'heading': 'Conduction: Fourier’s law', 'at': T, 'updated': T},
        'fc-abcd12': {'kind': 'custom', 'title': 'Long one', 'tex': 'q = ' + ' + '.join(f'h_{{{i}}}(T_{{s,{i}}} - T_{{\\infty}})' for i in range(14)), 'notes': 'mine', 'at': T, 'updated': T}}}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate("([k, v]) => { localStorage.clear(); localStorage[k] = JSON.stringify(v); }", [SK, SEED]); pg.reload(); pg.wait_for_selector('.tools-line')
        st = lambda: json.loads(pg.evaluate(f"localStorage['{SK}']"))
        pg.click('.tools-line >> text=Study sheets'); pg.wait_for_selector('#sh-new'); ok('No study sheets yet' in pg.inner_text('main'), f'{W}: empty state explains')
        pg.click('#sh-new'); pg.wait_for_selector('#sh-title'); sid = list(st()['sheets'])[0]
        ok(len(st()['sheets']) == 1 and pg.locator('.sh-cands input').count() == 6, f'{W}: new sheet; all 6 saved items offered (2 formulas, 1 note, 3 marks)')
        pg.go_back(); pg.wait_for_selector('#sh-new'); ok(len(st()['sheets']) == 1, f'{W}: Back does not re-create a sheet')
        pg.goto(BASE + f'/#/sheets/{sid}'); pg.wait_for_selector('#sh-title')
        pg.fill('#sh-title', 'Exam sheet'); pg.keyboard.press('Tab'); ok(st()['sheets'][sid]['title'] == 'Exam sheet', f'{W}: title saved')
        for i in range(6): pg.locator('.sh-cands input').nth(i).check(); pg.wait_for_timeout(30)
        items = st()['sheets'][sid]['items']; ok(len(items) == 6 and len({json.dumps(x) for x in items}) == 6, f'{W}: 6 items, no duplicates')
        pg.locator('.sh-cands input').nth(0).check(); ok(len(st()['sheets'][sid]['items']) == 6, f'{W}: ticking again never duplicates')
        groups = [g.inner_text() for g in pg.locator('#sheet .sh-group h2').all()]
        ok(len(groups) == 3 and any('Ch 1' in g and 'Heat' in g for g in groups) and any('Your formulas' in g for g in groups), f'{W}: grouped by book/chapter: {groups}')
        mine = pg.locator('#sheet .sh-mine').first; card = pg.locator('#sheet .sh-card').first
        ok('MY NOTE on Fourier' in pg.inner_text('#sheet') and mine.evaluate("e => getComputedStyle(e).borderLeftWidth") == '3px' and card.evaluate("e => getComputedStyle(e).borderLeftWidth") == '0px', f'{W}: student notes visually distinct from card text')
        ok('MY NOTE' not in ''.join(c.inner_text() for c in pg.locator('#sheet .sh-card').all()), f'{W}: card text block never contains student notes')
        # reorder: move last item to the top
        first0 = items[0]; pg.click('[data-down="0"]'); it2 = st()['sheets'][sid]['items']; ok(it2[1] == first0 and pg.evaluate("document.activeElement.dataset.down") == '1', f'{W}: move down; focus follows')
        pg.click('[data-up="1"]'); ok(st()['sheets'][sid]['items'][0] == first0, f'{W}: move up')
        pg.click('[data-rm="5"]'); ok(len(st()['sheets'][sid]['items']) == 5, f'{W}: remove')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-editor.png', full_page=True)
        ok(pg.evaluate('document.documentElement.scrollWidth') <= W, f'{W}: no sideways page scroll')
        # print
        pg.emulate_media(media='print')
        hidden = pg.evaluate("['.back','.sh-head','.sh-cols','.sh-prev-h'].every(s => getComputedStyle(document.querySelector(s)).display === 'none')")
        clip = pg.evaluate("[...document.querySelectorAll('#sheet .katex-display')].every(k => { const r = k.getBoundingClientRect(), sh = k.closest('.sh-eq'); return sh.scrollWidth <= sh.clientWidth + 2 || getComputedStyle(sh).overflowX === 'visible'; })")
        ok(hidden and clip, f'{W}: print hides chrome; equations not clipped')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#sheet')).backgroundColor") in ('rgb(255, 255, 255)',), f'{W}: print is black on white')
        if W == 1440: pg.screenshot(path=f'{OUT}/{W}-print-media.png', full_page=True)
        pg.emulate_media(media='screen')
        # standalone HTML
        with pg.expect_download() as d: pg.click('#sh-html')
        html = open(d.value.path(), encoding='utf-8').read()
        ok(d.value.suggested_filename == 'exam-sheet.html' and '<script' not in html and 'katex.min.css' in html and 'class="katex"' in html and 'MY NOTE on Fourier' in html, f'{W}: standalone HTML: pre-rendered KaTeX, CSS via CDN, no scripts')
        ok(not re.search(r'localStorage|learnscroll-study', html), f'{W}: export contains no app data dump')
        # chapter entry point
        pg.goto(BASE + f'/#/sheets/new/{K}/1'); pg.wait_for_selector('#sh-title'); ok(len(st()['sheets']) == 2 and pg.input_value('#sh-book') == K and pg.locator('.sh-cands input').count() == 1, f'{W}: created from a chapter, picker scoped to it')
        pg.go_back(); pg.wait_for_timeout(500); ok(len(st()['sheets']) == 2, f'{W}: Back from a chapter-created sheet makes no copy')
        # export/import
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp')
        with pg.expect_download() as d2: pg.click('#exp')
        ex = json.load(open(d2.value.path())); ok(len(ex['study']['sheets']) == 2, f'{W}: sheets in export')
        pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#imp'); pg.set_input_files('#imp-file', d2.value.path()); pg.wait_for_selector('#imp-over')
        ok('Study sheets' in pg.inner_text('.imp-plan'), f'{W}: import plan lists sheets'); pg.uncheck('#imp-backup'); pg.click('#imp-over'); pg.wait_for_timeout(300)
        ok(st()['sheets'][sid]['title'] == 'Exam sheet' and len(st()['sheets'][sid]['items']) == 5, f'{W}: sheets restored by import')
        ctx.close()
    b.close(); finish(errs)
