"""Reading text size: Small / Default / Large changes card prose only (paragraphs, definition/example notes); equations,
quiz options, headings and controls keep their size; applies at once, keeps the current card, is saved locally,
Reset returns to Default; keyboard usable (Esc closes, focus returns); no overflow at desktop or phone."""
from common import *
import json
B = 'heat-mass-transfer'
FS = """(() => { const f = s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
  return { p: f('#feed .card p'), note: f('#feed .card .note'), label: f('#feed .note .label'), eq: f('#feed .eq'), opt: f('#feed .opt'), h2: f('#feed .card h2'), nav: f('#next'), tutor: f('#tutorBtn') }; })()"""
def overflow(pg): return pg.evaluate("""document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('#feed .card-body')].some(b => b.scrollWidth > b.clientWidth + 1)""")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844), (320, 640)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.goto(BASE + f'/#/read/{B}/2/7'); pg.reload(); pg.wait_for_timeout(1000)
        base = pg.evaluate(FS); cnt = pg.inner_text('#count')
        if W == 1440: ok(base['p'] == 20, f'{W}: default prose size unchanged (20px)')
        ok(pg.get_attribute('#textBtn', 'aria-expanded') == 'false' and pg.locator('#textPop').is_hidden(), f'{W}: text size menu closed by default')
        bb = pg.locator('#textBtn').bounding_box(); ok(bb['x'] + bb['width'] <= W, f'{W}: Aa button fits the bar')
        # keyboard: open, pick Large
        pg.focus('#textBtn'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
        ok(pg.locator('#textPop').is_visible() and pg.evaluate("document.activeElement.dataset.size") == 'default', f'{W}: menu opens with focus on the current size')
        pb = pg.locator('#textPop').bounding_box(); ok(pb['x'] >= 0 and pb['x'] + pb['width'] <= W, f'{W}: menu fully on screen ({pb["x"]:.0f}..{pb["x"] + pb["width"]:.0f})')
        ok(pg.evaluate("document.querySelectorAll('#feed .m-nb').length") > 0, f'{W}: punctuation after inline math kept on its line')
        pg.screenshot(path=f'{OUT}/{W}-menu.png')
        pg.keyboard.press('Tab'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        lg = pg.evaluate(FS)
        ok(abs(lg['p'] - base['p'] * 1.15) < 0.1 and abs(lg['note'] - base['note'] * 1.15) < 0.1, f'{W}: Large applies at once to prose ({base["p"]} -> {lg["p"]})')
        ok(all(lg[k] == base[k] for k in ('label', 'eq', 'opt', 'h2', 'nav', 'tutor')), f'{W}: equations, headings, options and controls unchanged')
        ok(pg.inner_text('#count') == cnt, f'{W}: still on the same card ({cnt})')
        ok(not overflow(pg), f'{W}: no overflow at Large')
        for _ in range(4): pg.keyboard.press('Tab')
        ok(pg.evaluate("!!document.activeElement.closest('#textPop')"), f'{W}: focus stays in the menu')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        ok(pg.locator('#textPop').is_hidden() and pg.evaluate("document.activeElement.id") == 'textBtn' and '/read/' in pg.url, f'{W}: Esc closes menu, focus returns, reader stays')
        st = json.loads(pg.evaluate("localStorage['learnscroll-study-v1']")); ok(st.get('readPrefs') == {'textSize': 'large'}, f'{W}: saved locally')
        pg.screenshot(path=f'{OUT}/{W}-large.png')
        pg.reload(); pg.wait_for_timeout(900); ok(abs(pg.evaluate(FS)['p'] - base['p'] * 1.15) < 0.1, f'{W}: Large kept after reload')
        # quiz card at Large: no overflow, options unchanged
        pg.goto(BASE + f'/#/read/{B}/1/26'); pg.wait_for_timeout(900); ok(not overflow(pg) and pg.evaluate(FS)['opt'] == base['opt'], f'{W}: quiz card fine at Large')
        # Small via mouse, then Reset
        pg.click('#textBtn'); pg.click('[data-size="small"]'); pg.wait_for_timeout(200)
        sm = pg.evaluate(FS); ok(sm['p'] < base['p'] and sm['opt'] == base['opt'], f'{W}: Small shrinks prose only ({sm["p"]})')
        pg.click('#textReset'); pg.wait_for_timeout(200)
        ok(pg.evaluate(FS)['p'] == base['p'] and 'readPrefs' not in json.loads(pg.evaluate("localStorage['learnscroll-study-v1']")) and pg.locator('#textPop').is_hidden(), f'{W}: Reset returns to Default and closes')
        pg.click('#textBtn'); pg.mouse.click(W // 2, H // 2); pg.wait_for_timeout(150); ok(pg.locator('#textPop').is_hidden(), f'{W}: click outside closes')
        pg.close()
    b.close(); finish(errs)
