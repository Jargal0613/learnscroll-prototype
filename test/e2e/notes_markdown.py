"""Notes as Markdown: footer action downloads a .md grouped by book/chapter/card heading with $$eq$$; JSON export unchanged."""
from common import *
import json, shutil
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#expMd')
        pg.click('#expMd'); pg.wait_for_timeout(300)
        ok('No notes to export' in pg.inner_text('.notice.ok'), f'{W} empty state when there are no notes')
        for path, cid, text in [('heat-mass-transfer/1/13', 'c1-13', 'Fourier: flux goes down the gradient.\nRemember the minus sign.'), ('heat-mass-transfer/1/2', 'c1-2', 'Rates, not just end states.'), ('koretsky-thermo/1/1', 'c1-1', 'Thermo note')]:
            pg.goto(f'{BASE}/#/read/{path}'); pg.reload(); pg.wait_for_timeout(1000)
            pg.click(f'.mark[data-mark="n"][data-id="{cid}"]'); pg.keyboard.type(text); pg.wait_for_timeout(800); pg.keyboard.press('Escape')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#expMd'); pg.locator('.lib-foot').scroll_into_view_if_needed()
        pg.screenshot(path=f'{OUT}/{W}-footer.png')
        with pg.expect_download() as dl: pg.click('#expMd')
        md = open(dl.value.path()).read(); shutil.copy(dl.value.path(), f'{OUT}/{W}-{dl.value.suggested_filename}')
        ok(dl.value.suggested_filename.endswith('.md'), 'downloads a .md file: ' + dl.value.suggested_filename)
        h = md.index('## Heat and Mass Transfer'); k = md.index('## Engineering and Chemical Thermodynamics')
        ok(h < k and md.index('### Chapter 1: Introduction and Basic Concepts') > h, 'grouped by book then chapter')
        ok('#### Conduction: Fourier’s law\n\n$$' in md and 'Remember the minus sign.' in md, 'card heading + $$equation$$ + note')
        ok(md.index('#### Why rates matter') < md.index('#### Conduction'), 'cards in book order')
        ok('#### Why rates matter\n\nRates, not just end states.' in md, 'no equation block for card without eq')
        with pg.expect_download() as dj: pg.click('#exp')
        d = json.load(open(dj.value.path()))
        ok(set(d) <= {'app', 'version', 'exportedAt', 'study', 'tutor', 'session'} and d['version'] == 5, 'JSON backup unaffected by Markdown export (same envelope, version 3)')
        ctx.close()
    b.close(); finish(errs)
