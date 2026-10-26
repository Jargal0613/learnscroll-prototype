"""Reliability audit: persistence (refresh + fresh tab), shortcuts inert in tutor/notes/search, empty states,
corrupt/malformed localStorage (backup + recover), tutor API failures (500, non-JSON, timeout, offline),
storage quota / disabled storage warning. Makes NO paid tutor calls (all POSTs to /api/tutor are mocked)."""
from common import *
import json
SK, TK = 'learnscroll-study-v1', 'learnscroll-tutor-v1'
STATE = lambda pg: pg.evaluate(f"JSON.parse(localStorage['{SK}'] || '{{}}')")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        # --- empty states
        txt = pg.inner_text('main').lower()
        ok('nothing studied yet' in txt and 'nothing to review yet' in txt and pg.locator('#continue').count() == 0, f'{W} empty library states')
        pg.screenshot(path=f'{OUT}/{W}-empty-library.png')
        for tab, phrase in [('notes', 'no notes yet'), ('bookmarked', 'no'), ('difficult', 'no')]:
            pg.goto(f'{BASE}/#/book/heat-mass-transfer/{tab}'); pg.wait_for_timeout(300)
            ok(pg.locator('.marked-empty').count() == 1 and phrase in pg.inner_text('.marked-empty').lower(), f'empty {tab} tab')
        pg.goto(BASE + '/#/review/heat-mass-transfer'); pg.wait_for_timeout(300); ok('nothing to review' in pg.inner_text('main').lower(), 'empty review')
        # --- persistence: refresh + fresh tab
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/4'); pg.wait_for_timeout(1200)
        pg.keyboard.press('b'); pg.click('.mark[data-mark="n"][data-id="c1-4"]'); pg.keyboard.type('persist me'); pg.wait_for_timeout(900); pg.keyboard.press('Escape')
        pg.reload(); pg.wait_for_timeout(1200)
        ok(pg.locator('.mark[data-mark="b"][data-id="c1-4"][aria-pressed="true"]').count() == 1 and pg.locator('.mark.has-note[data-id="c1-4"]').count() == 1, 'bookmark + note survive refresh')
        ok(pg.inner_text('#count').startswith('4 / '), 'reader resumes same card after refresh')
        pg2 = ctx.new_page(); watch(pg2, errs); pg2.goto(BASE + '/#/'); pg2.wait_for_selector('#continue')
        ok('Card 4' in pg2.inner_text('#continue'), 'fresh tab: Continue points to the same card')
        pg2.goto(BASE + '/#/book/heat-mass-transfer/notes'); pg2.wait_for_timeout(300); ok('persist me' in pg2.inner_text('main'), 'fresh tab: note visible'); pg2.close()
        ok(pg.locator('#recover').count() == 0 and pg.evaluate(f"localStorage['{SK}-corrupt-backup']") is None, 'normal data never triggers recovery')
        # --- shortcuts inert while typing in tutor / note / search
        before = STATE(pg)['books']['heat-mass-transfer']
        pg.click('#tutorBtn'); pg.wait_for_timeout(300); pg.click('#t-input'); pg.keyboard.type('b d  x'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('PageDown')
        after = STATE(pg)['books']['heat-mass-transfer']
        ok(after['marks'] == before['marks'] and pg.inner_text('#count').startswith('4 / ') and pg.input_value('#t-input').startswith('b d'), 'tutor input: B/D/Space/arrows inert')
        pg.fill('#t-input', ''); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.click('.mark[data-mark="n"][data-id="c1-4"]'); pg.keyboard.type(' bd'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(800)
        ok(STATE(pg)['books']['heat-mass-transfer']['marks'] == before['marks'] and pg.inner_text('#count').startswith('4 / '), 'note editor: shortcuts inert')
        pg.keyboard.press('Escape')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#q'); pg.click('#q'); pg.keyboard.type('bd'); pg.keyboard.press('Space'); pg.wait_for_timeout(300)
        ok(pg.url.endswith('#/') and pg.input_value('#q') == 'bd ', 'search field: keys stay in field')
        # --- tutor API failures (mocked; no paid calls)
        def run_fail(kind, expect, shot):
            def handler(route):
                if route.request.method != 'POST': return route.fallback()
                if kind == '500': return route.fulfill(status=500, content_type='application/json', body=json.dumps({'error': {'code': 'provider_error', 'message': 'The AI provider returned an error. Try again.'}}))
                if kind == 'html': return route.fulfill(status=502, content_type='text/html', body='<html>Bad gateway</html>')
                if kind == 'offline': return route.abort('internetdisconnected')
                if kind == 'timeout': return None  # never answer; client aborts
            pg.route('**/api/tutor', handler)
            pg.evaluate('window.__lsTutorTimeoutMs = 1500')
            pg.goto(BASE + '/#/read/heat-mass-transfer/1/13'); pg.reload(); pg.wait_for_timeout(1200); pg.evaluate('window.__lsTutorTimeoutMs = 1500')
            pg.click('#tutorBtn'); pg.wait_for_timeout(300); pg.fill('#t-input', f'mock {kind} question'); pg.click('#t-send')
            try: pg.wait_for_selector('.t-err', timeout=8000); shown = pg.inner_text('.t-err')
            except Exception: shown = ''
            ok(expect.lower() in shown.lower() and pg.input_value('#t-input') == f'mock {kind} question' and pg.locator('#t-retry').count() == 1, f'API {kind}: error shown, question kept, Retry offered ({shown.splitlines()[1] if shown.count(chr(10)) else shown})')
            if shot: pg.screenshot(path=f'{OUT}/{W}-api-{kind}.png')
            pg.unroute('**/api/tutor')
            pg.click('#t-new') if pg.locator('#t-new').is_enabled() else None
            pg.fill('#t-input', '')
        n_err = len(errs)
        run_fail('500', 'provider returned an error', True)
        run_fail('html', 'HTTP 502', False)
        run_fail('offline', 'Could not reach', False)
        run_fail('timeout', 'timed out', True)
        errs[n_err:] = [e for e in errs[n_err:] if 'Failed to load resource' not in e]  # expected: the mocked failures themselves
        # --- corrupt JSON in localStorage
        pg.evaluate(f"localStorage['{SK}'] = '{{\"books\": {{bad json'"); pg.goto(BASE + '/#/'); pg.reload(); pg.wait_for_selector('#q')
        ok(pg.locator('#recover').count() == 1 and pg.evaluate(f"localStorage['{SK}-corrupt-backup']").startswith('{"books": {bad'), 'corrupt JSON: no crash, backup kept, banner shown')
        pg.screenshot(path=f'{OUT}/{W}-corrupt-recovery.png')
        with pg.expect_download() as dl: pg.click('#rec-dl')
        ok('bad json' in open(dl.value.path()).read(), 'backup downloadable')
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/2'); pg.wait_for_timeout(1000); pg.keyboard.press('b'); pg.wait_for_timeout(200)
        ok(STATE(pg)['books']['heat-mass-transfer']['marks']['c1-2']['b'] is True, 'app usable and saving again after recovery')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#rec-x'); pg.once('dialog', lambda d: d.accept()); pg.click('#rec-x'); pg.wait_for_timeout(200)
        ok(pg.locator('#recover').count() == 0 and pg.evaluate(f"localStorage['{SK}-corrupt-backup']") is None, 'backup removable after download')
        # malformed structure: bad pieces dropped, good kept
        pg.evaluate("""() => localStorage['learnscroll-study-v1'] = JSON.stringify({books: {'heat-mass-transfer': {chapter: 'x', marks: 'oops', notes: {'c1-2': {text: 5}, 'c1-3': {text: 'good note', at: Date.now()}}}, 'koretsky-thermo': 7}, recent: 'nope'})""")
        pg.evaluate(f"localStorage['{TK}'] = '[[[not json'"); pg.reload(); pg.wait_for_selector('#recover')
        ok('tutor' in pg.inner_text('#recover'), 'tutor store corruption also backed up')
        pg.goto(BASE + '/#/book/heat-mass-transfer/notes'); pg.wait_for_timeout(300); ok('good note' in pg.inner_text('main'), 'malformed structure: valid note kept')
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/3'); pg.wait_for_timeout(1000); pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        ok(pg.locator('#t-input').is_visible(), 'tutor opens after its store was corrupt')
        ctx.close()
        # --- storage quota exceeded
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        pg.add_init_script("""(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (window.__quota) throw new DOMException('Quota exceeded', 'QuotaExceededError'); return orig.call(this, k, v); }; })()""")
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/5'); pg.wait_for_timeout(1200); pg.evaluate('window.__quota = true')
        pg.keyboard.press('b'); pg.wait_for_timeout(200)
        ok(pg.locator('#save-warn').is_visible() and 'Couldn’t save' in pg.inner_text('#save-warn'), 'quota: visible warning')
        ok(pg.locator('.mark[data-mark="b"][data-id="c1-5"][aria-pressed="true"]').count() == 1, 'quota: app keeps working (non-blocking)')
        pg.click('.mark[data-mark="n"][data-id="c1-5"]'); pg.keyboard.type('x'); pg.wait_for_timeout(900)
        ok('Not saved' in pg.inner_text('.note-ed[data-note="c1-5"] .note-status'), 'quota: note says Not saved')
        pg.screenshot(path=f'{OUT}/{W}-quota-warning.png'); pg.keyboard.press('Escape')
        pg.click('#save-warn-x'); ok(pg.locator('#save-warn').is_hidden(), 'warning dismissible')
        ctx.close()
        # --- storage disabled entirely
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        pg.add_init_script("""Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });""")
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#q')
        pg.goto(BASE + '/#/read/heat-mass-transfer/1/2'); pg.wait_for_timeout(1200)
        ok(pg.locator('#save-warn').is_visible() and pg.inner_text('#count').startswith('2 / '), 'storage disabled: reader works, warning shown')
        pg.screenshot(path=f'{OUT}/{W}-storage-disabled.png')
        ctx.close()
    b.close(); finish(errs)
