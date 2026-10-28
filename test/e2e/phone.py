"""Phone / tablet layout (320, 360, 390, 430, 768): no horizontal page scroll on any screen, equations scroll inside
their own block, Prev/Next reachable and never covering card content, full-screen tutor, and a complete study
session finished with taps at narrow width. Also re-checks that desktop (1440/1728) reader + tutor geometry is unchanged."""
from common import *
B = 'heat-mass-transfer'
PAGES = ['#/', f'#/book/{B}', f'#/book/{B}/notes', f'#/review/{B}', '#/session', f'#/read/{B}/2/7', f'#/read/{B}/1/3']
def at_end(pg): return pg.evaluate("(() => { const r = document.getElementById('endSess2').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()")
def hscroll(pg): return pg.evaluate("document.documentElement.scrollWidth - innerWidth")
def eq_ok(pg):  # every equation fits or scrolls inside its own block, never pushing the page wider
    return pg.evaluate("""[...document.querySelectorAll('.eq')].every(e => { const r = e.getBoundingClientRect();
      return r.right <= innerWidth + 1 && (e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).overflowX === 'auto'); })""")
def covered(pg):  # visible card text hidden under the fixed footer?
    return pg.evaluate("""(() => { const f = document.querySelector('.foot'); if (!f) return false; const ft = f.getBoundingClientRect().top;
      const feed = document.getElementById('feed'); const c = [...feed.querySelectorAll(':scope > .card')].find(c => { const r = c.getBoundingClientRect(); return r.top <= 1 && r.bottom > 1; });
      if (!c) return false; const body = c.querySelector('.card-body'); const last = body.lastElementChild || body;
      const r = last.getBoundingClientRect(); return r.bottom > ft + 1 && r.bottom <= c.getBoundingClientRect().bottom && Math.abs(c.getBoundingClientRect().bottom - innerHeight) < 2; })()""")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in [(320, 640), (360, 740), (390, 844), (430, 932), (768, 1024)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, has_touch=True, is_mobile=W < 700); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        for h in PAGES:
            pg.goto(BASE + '/' + h); pg.wait_for_timeout(900)
            ok(hscroll(pg) <= 0, f'{W}: no horizontal page scroll on {h} ({hscroll(pg)}px)')
            if '/read/' in h: ok(eq_ok(pg), f'{W}: equations contained on {h}')
        pg.screenshot(path=f'{OUT}/{W}-reader.png')
        nb = pg.locator('#next').bounding_box()
        ok(nb and nb['y'] + nb['height'] <= H and nb['y'] > H * 0.75 and nb['height'] >= (44 if W < 700 else 30), f'{W}: Next is at the bottom, thumb-reachable ({nb})')
        pg.click('#tutorBtn'); pg.wait_for_timeout(300); tb = pg.locator('#tutor').bounding_box()
        if W <= 600: ok(tb['width'] >= W - 1 and tb['y'] <= 1 and tb['height'] >= H - 1, f'{W}: tutor is full-screen'); ok(pg.locator('#t-close').is_visible(), f'{W}: tutor close visible')
        else: ok(tb['width'] > 300, f'{W}: tutor panel open')
        pg.screenshot(path=f'{OUT}/{W}-tutor.png'); pg.click('#t-close'); pg.wait_for_timeout(200)
        if W not in (320, 390): ctx.close(); continue
        # finish a whole study session with taps
        pg.goto(BASE + '/#/session'); pg.wait_for_selector('#sessGo')
        for _ in range(5):
            pg.tap('[data-min="10"]') if pg.locator('[data-min="10"]').is_visible() else None
            if pg.get_attribute('[data-min="10"]', 'aria-checked') == 'true': break
        pg.screenshot(path=f'{OUT}/{W}-session-setup.png'); ok(hscroll(pg) <= 0, f'{W}: session setup fits')
        pg.tap('#sessGo'); pg.wait_for_selector('#left'); pg.wait_for_timeout(800)
        steps = bad_cov = bad_eq = bad_h = 0
        while not at_end(pg) and steps < 300:  # queue grew with Chapters 3-5
            if covered(pg): bad_cov += 1
            if not eq_ok(pg): bad_eq += 1
            if hscroll(pg) > 0: bad_h += 1
            if steps == 3: pg.screenshot(path=f'{OUT}/{W}-session-card.png')
            pg.tap('#next'); pg.wait_for_timeout(450); steps += 1
        seen = pg.evaluate("JSON.parse(localStorage.getItem('learnscroll-session-v1') || '{}').viewed")
        ok(at_end(pg) and steps >= 10, f'{W}: reached end of session queue in {steps} taps')
        ok(bad_cov == 0, f'{W}: no card content covered by footer ({bad_cov})'); ok(bad_eq == 0, f'{W}: no clipped equations ({bad_eq})'); ok(bad_h == 0, f'{W}: no page scroll ({bad_h})')
        pg.tap('#endSess2'); pg.wait_for_selector('#sessSum'); ok(hscroll(pg) <= 0, f'{W}: summary fits'); pg.screenshot(path=f'{OUT}/{W}-session-summary.png')
        ctx.close()
    # desktop geometry unchanged by the phone CSS
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + f'/#/read/{B}/1/3'); pg.wait_for_timeout(1000)
        card = pg.evaluate("(() => { const c = [...document.querySelectorAll('#feed > .card')][2]; return [c.offsetHeight, innerHeight, getComputedStyle(c).paddingTop, getComputedStyle(document.querySelector('.foot')).backgroundColor]; })()")
        ok(card[0] == H and card[2] == '88px' and card[3] == 'rgba(0, 0, 0, 0)', f'{W}: desktop cards full-height, footer unchanged {card}')
        pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(900); ok(pg.inner_text('#count').startswith('4'), f'{W}: desktop keyboard nav kept')
        pg.click('#tutorBtn'); pg.wait_for_timeout(300); tb = pg.locator('#tutor').bounding_box()
        ok(tb['y'] == 56 and 400 <= tb['width'] <= 440, f'{W}: desktop tutor docked at right ({tb["width"]}px)'); pg.close()
    b.close(); finish(errs)
