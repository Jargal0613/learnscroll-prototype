"""Formula notebook: 'Save formula' under card equations (one copy per card; second press opens it), saved items keep
TeX, heading, book, chapter and link back to the card; symbol/unit text shown only from the card's own text; custom
formulas create/edit/delete with live KaTeX preview and a clear bad-LaTeX message; duplicate LaTeX needs a second
Save; search by title/symbol/concept + book filter; export/import round trip; save failure never claims success."""
from common import *
import json
SK, B = 'learnscroll-study-v1', 'heat-mass-transfer'
F = lambda pg: json.loads(pg.evaluate(f"localStorage['{SK}']"))['formulas']
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.goto(BASE + f'/#/read/{B}/1/13'); pg.wait_for_timeout(1000)
        card = pg.locator('.card').nth(12); btn = card.locator('.f-save')
        ok(btn.count() == 1 and btn.inner_text() == 'Save formula', f'{W}: Save formula control under the card equation')
        ok(pg.locator('.card').nth(0).locator('.f-save').count() == 0, f'{W}: no control on cards without an equation')
        btn.click(); pg.wait_for_timeout(100)
        f = F(pg); fid = f'f-{B}-c1-13'
        ok(list(f) == [fid] and f[fid]['tex'] == '\\dot Q_\\text{cond} = -kA\\,\\frac{dT}{dx}' and f[fid]['heading'] == 'Conduction: Fourier’s law' and f[fid]['chapter'] == 1 and f[fid]['book'] == B and f[fid]['kind'] == 'card', f'{W}: saved item keeps TeX, heading, book, chapter')
        ok(set(f[fid]) <= {'kind', 'title', 'tex', 'book', 'chapter', 'card', 'heading', 'at', 'updated'}, f'{W}: nothing invented (no symbol/unit fields)')
        ok('In formula notebook' in btn.inner_text(), f'{W}: control shows it is saved')
        if W != 1728: card.screenshot(path=f'{OUT}/{W}-card-saved.png')
        btn.click(); pg.wait_for_selector('.fpage'); ok(len(F(pg)) == 1 and pg.locator(f'#{fid}.hl').count() == 1, f'{W}: second press opens the notebook at it, no duplicate')
        it = pg.locator(f'#{fid}')
        ok(it.locator('.katex').count() > 0 and 'card text' in it.inner_text().lower() and 'thermal conductivity' in it.inner_text(), f'{W}: renders KaTeX; symbol meanings shown from the card text')
        # custom formula with bad LaTeX preview, then fix
        pg.click('#f-new'); pg.fill('#f-title', 'Newton cooling'); pg.fill('#f-tex', 'q = h(T_s - T_\\infty')
        pg.locator('#f-tex').dispatch_event('input'); pg.fill('#f-tex', 'q = h\\,(T_s - \\frac{T_\\infty}')
        ok(pg.locator('#f-prev .f-err').count() == 1 and "can’t be displayed" in pg.inner_text('#f-prev'), f'{W}: bad LaTeX gives a clear message, no crash')
        if W != 1728: pg.locator('#f-form').screenshot(path=f'{OUT}/{W}-bad-latex.png')
        pg.fill('#f-tex', 'q = h\\,(T_s - T_\\infty)'); pg.fill('#f-notes', 'my note on convection'); pg.click('#f-form button[type=submit]')
        f = F(pg); cid = [k for k in f if k.startswith('fc-')]
        ok(len(cid) == 1 and f[cid[0]]['notes'] == 'my note on convection', f'{W}: custom formula created')
        # duplicate LaTeX
        pg.click('#f-new'); pg.fill('#f-title', 'Copy'); pg.fill('#f-tex', 'q=h\\,(T_s-T_\\infty)'); pg.click('#f-form button[type=submit]')
        ok(len(F(pg)) == 2 and 'already has the same LaTeX' in pg.inner_text('#f-msg'), f'{W}: duplicate LaTeX warns first')
        pg.click('#f-form button[type=submit]'); ok(len(F(pg)) == 3, f'{W}: second Save keeps both (predictable)')
        # edit + delete
        cid2 = [k for k in F(pg) if k.startswith('fc-') and F(pg)[k]['title'] == 'Copy'][0]
        pg.click(f'[data-fedit="{cid2}"]'); pg.fill('#f-title', 'Copy edited'); pg.click('#f-form button[type=submit]')
        ok(F(pg)[cid2]['title'] == 'Copy edited', f'{W}: edit saved')
        pg.click(f'[data-fdel="{cid2}"]'); ok(cid2 in F(pg) and pg.evaluate("document.activeElement.dataset.fdelNo !== undefined"), f'{W}: delete asks first, focus on Keep')
        pg.click(f'[data-fdel-yes="{cid2}"]'); ok(cid2 not in F(pg), f'{W}: delete removes it')
        # search + filter
        pg.fill('#f-q', 'conductivity'); ok(pg.locator('.f-item').count() == 1 and pg.locator(f'#{fid}').count() == 1, f'{W}: search by concept (card text)')
        pg.fill('#f-q', 'T_s'); ok(pg.locator('.f-item').count() == 1 and pg.locator(f'#{cid[0]}').count() == 1, f'{W}: search by symbol (TeX)')
        pg.fill('#f-q', 'newton'); ok(pg.locator('.f-item').count() == 1, f'{W}: search by title')
        pg.fill('#f-q', ''); pg.select_option('#f-book', B); ok(pg.locator('.f-item').count() == 1, f'{W}: book filter')
        pg.select_option('#f-book', 'custom'); ok(pg.locator('.f-item').count() == 1, f'{W}: custom filter')
        pg.select_option('#f-book', ''); pg.fill('#f-q', 'zzzz'); ok('No formulas match' in pg.inner_text('main'), f'{W}: empty search result explained')
        pg.fill('#f-q', '')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-notebook.png', full_page=True)
        ok(pg.evaluate('document.documentElement.scrollWidth') <= W, f'{W}: no sideways page scroll')
        pg.click(f'#{fid} .f-src-link'); pg.wait_for_timeout(800); ok(pg.inner_text('#count').startswith('13 /'), f'{W}: link back opens the source card')
        # export/import
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp'); ok('2 formulas' in pg.inner_text('.tools-line'), f'{W}: library links to the notebook with a count')
        with pg.expect_download() as d: pg.click('#exp')
        ex = json.load(open(d.value.path())); ok(ex['version'] == 5 and len(ex['study']['formulas']) == 2, f'{W}: formulas in export (format 5)')
        pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#imp')
        pg.set_input_files('#imp-file', d.value.path()); pg.wait_for_selector('#imp-over'); ok('Formula notebook' in pg.inner_text('.imp-plan'), f'{W}: import plan lists formulas')
        pg.uncheck('#imp-backup'); pg.click('#imp-over'); pg.wait_for_timeout(400); ok(len(F(pg)) == 2, f'{W}: formulas restored by import')
        # save failure
        pg.goto(BASE + f'/#/read/{B}/1/16'); pg.wait_for_timeout(900)
        pg.evaluate("() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'learnscroll-study-v1') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; }")
        bb = pg.locator('.card').nth(15).locator('.f-save')
        if bb.count():
            bb.click(); pg.wait_for_timeout(100); ok('Not saved' in bb.inner_text(), f'{W}: storage failure never claims success')
        ctx.close()
    b.close(); finish(errs)
