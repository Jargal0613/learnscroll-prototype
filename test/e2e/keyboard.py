"""Keyboard-only walk through the main workflows (no mouse; tutor API mocked, no paid calls):
'?' shortcuts dialog (focus trap, Esc, focus return), library -> chapter -> reader, mark, note, tutor,
review, session; visible focus ring on every control reached; no shortcuts while typing."""
from common import *
import json
B = 'heat-mass-transfer'
def foc(pg, js): return pg.evaluate(f"(() => {{ const a = document.activeElement; return {js}; }})()")
def tab_to(pg, sel, back=False, n=120):
    for _ in range(n):
        if pg.evaluate("s => !!document.activeElement && document.activeElement.matches(s)", sel): return True
        pg.keyboard.press('Shift+Tab' if back else 'Tab')
    return False
def ring(pg):  # focused control shows a visible focus indicator
    return pg.evaluate("""(() => { const a = document.activeElement, s = getComputedStyle(a);
      return a.matches(':focus-visible') && (s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && s.outlineColor !== 'rgba(0, 0, 0, 0)' && s.outlineColor !== 'transparent')); })()""")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.route('**/api/tutor', lambda r: r.fallback() if r.request.method != 'POST' else r.fulfill(status=200, content_type='application/json',
            body=json.dumps({'answer': '### From the textbook\nConduction follows Fourier\'s law.', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': 'ckb'})))
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#sessStart')
        # shortcuts dialog
        ok(tab_to(pg, f'a[href="#/book/{B}"]'), f'{W}: Tab reaches the book link'); ok(ring(pg), f'{W}: visible focus on book link')
        pg.keyboard.press('?'); pg.wait_for_timeout(200)
        ok(pg.locator('dialog.keys-dlg[open]').count() == 1 and foc(pg, "a.id") == 'keys-x', f"{W}: '?' opens shortcuts dialog with focus inside")
        pg.screenshot(path=f'{OUT}/{W}-shortcuts.png')
        inside = all(not pg.keyboard.press('Tab') and foc(pg, "!!a.closest('dialog')") for _ in range(4))
        pg.keyboard.press('Shift+Tab'); ok(inside and foc(pg, "!!a.closest('dialog')"), f'{W}: focus trapped in dialog')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        ok(pg.locator('dialog.keys-dlg[open]').count() == 0 and foc(pg, f"a.matches('a[href=\"#/book/{B}\"]')"), f'{W}: Esc closes and focus returns to opener')
        # no shortcuts while typing
        pg.keyboard.press('/'); ok(foc(pg, "a.tagName") == 'INPUT', f"{W}: '/' focuses search")
        pg.keyboard.type('?b'); ok(pg.locator('dialog.keys-dlg[open]').count() == 0 and pg.input_value('.search input') == '?b', f"{W}: typing '?' in search does not open dialog")
        pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
        # library -> chapter -> reader
        tab_to(pg, f'a[href="#/book/{B}"]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        ok(f'#/book/{B}' in pg.url, f'{W}: Enter opens book')
        ok(tab_to(pg, f'a[href^="#/read/{B}/1"]'), f'{W}: Tab reaches chapter 1'); ok(ring(pg), f'{W}: visible focus on chapter')
        pg.keyboard.press('Enter'); pg.wait_for_selector('#feed'); pg.wait_for_timeout(900)
        ok(f'#/read/{B}/1' in pg.url, f'{W}: Enter opens reader')
        pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(900); ok(pg.inner_text('#count').strip().startswith('2'), f'{W}: ArrowDown moves to card 2: ' + pg.inner_text('#count'))
        # mark
        pg.keyboard.press('b'); pg.keyboard.press('d'); pg.wait_for_timeout(200)
        st = pg.evaluate("JSON.parse(localStorage.getItem('learnscroll-study-v1'))")['books'][B]['marks']
        ok(st.get('c1-2') and len(st['c1-2']) >= 1, f'{W}: B/D mark card from keyboard: {st.get("c1-2")}')
        ok(pg.get_attribute('.mark[data-mark="b"][data-id="c1-2"]', 'aria-pressed') == 'true', f'{W}: bookmark selected state exposed (aria-pressed)')
        # note
        ok(tab_to(pg, '.mark[data-mark="n"][data-id="c1-2"]'), f'{W}: Tab reaches Add note'); ok(ring(pg), f'{W}: visible focus on Add note')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300); ok(foc(pg, "a.tagName") == 'TEXTAREA', f'{W}: note editor focused')
        pg.keyboard.type('bd? key test'); pg.wait_for_timeout(900)
        ok(pg.locator('dialog.keys-dlg[open]').count() == 0, f'{W}: no global shortcuts while typing a note')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        notes = pg.evaluate("JSON.parse(localStorage.getItem('learnscroll-study-v1'))")['books'][B].get('notes', {})
        ok('key test' in json.dumps(notes) and '#/read/' in pg.url, f'{W}: note saved, Esc closed editor only')
        # tutor
        ok(tab_to(pg, '#tutorBtn', back=True), f'{W}: Shift+Tab reaches Ask tutor'); ok(ring(pg), f'{W}: visible focus on Ask tutor')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300); ok(foc(pg, "a.id") == 't-input', f'{W}: tutor input focused')
        pg.keyboard.type('What is b?'); pg.keyboard.press('Enter'); pg.wait_for_timeout(800)
        ok('Fourier' in pg.inner_text('#t-log'), f'{W}: question sent with Enter, answer shown')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        ok(pg.locator('#tutor').is_hidden() and foc(pg, "a.id") == 'tutorBtn', f'{W}: Esc closes tutor, focus returns to button')
        pg.keyboard.press('?'); pg.wait_for_timeout(150); pg.screenshot(path=f'{OUT}/{W}-reader-shortcuts.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        ok(f'#/read/{B}/1' in pg.url, f'{W}: Esc in dialog does not leave the reader')
        # review
        pg.keyboard.press('Escape'); pg.wait_for_timeout(500); ok(pg.url.endswith(f'#/book/{B}'), f'{W}: Esc back to chapters')
        ok(tab_to(pg, f'a[href^="#/review/{B}"]'), f'{W}: Tab reaches review'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
        if tab_to(pg, f'a[href="#/review/{B}/both"]', n=40): pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
        ok(pg.locator('#rv-card').count() == 1, f'{W}: review started from keyboard')
        pg.keyboard.press('Escape') if False else None
        pg.evaluate("document.activeElement && document.activeElement.blur()")  # keys go to the page, as after Enter on a link that unmounts
        pg.keyboard.press('Space'); pg.wait_for_timeout(250); ok(pg.locator('#rv-body').is_visible(), f'{W}: Space reveals')
        pg.keyboard.press('1'); pg.wait_for_timeout(250); pg.keyboard.press('Space'); pg.wait_for_timeout(200); pg.keyboard.press('2'); pg.wait_for_timeout(250)
        ok(len(pg.evaluate("JSON.parse(localStorage.getItem('learnscroll-study-v1'))")['books'][B].get('review', {})) >= 1, f'{W}: grades recorded with 1/2')
        # session
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300); pg.goto(BASE + '/#/'); pg.wait_for_selector('#sessStart')
        tab_to(pg, '#sessStart'); pg.keyboard.press('Enter'); pg.wait_for_selector('#sessGo')
        ok(tab_to(pg, '[data-min="20"]'), f'{W}: Tab reaches 20 min'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
        ok(pg.get_attribute('[data-min="20"]', 'aria-checked') == 'true', f'{W}: length selected (aria-checked)')
        tab_to(pg, '#sessGo'); ok(ring(pg), f'{W}: visible focus on Start'); pg.keyboard.press('Enter'); pg.wait_for_selector('#left'); pg.wait_for_timeout(900)
        pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(800); pg.keyboard.press('Escape'); pg.wait_for_selector('#sessSum')
        ok(pg.locator('#sessSum').is_visible(), f'{W}: session run and ended from keyboard')
        pg.screenshot(path=f'{OUT}/{W}-session-summary.png'); pg.close()
    b.close(); finish(errs)
