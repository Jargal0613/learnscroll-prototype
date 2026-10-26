from common import *
import time
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#q')
        pg.keyboard.press('/'); ok(pg.evaluate("document.activeElement.id") == 'q', f'{W} "/" focuses search')
        pg.keyboard.type('fourier'); pg.wait_for_selector('.q-item')
        ok(pg.locator('.q-book').count() >= 1 and pg.locator('.q-ch').count() >= 1, 'grouped by book and chapter')
        ok(pg.locator('.q-item mark').count() >= 1, 'match highlighted')
        ms = int(pg.get_attribute('.q-ms', 'data-ms')); ok(ms < 50, f'search fast ({ms} ms)')
        pg.screenshot(path=f'{OUT}/{W}-results.png')
        pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowUp')
        sel = pg.locator('.q-item[aria-selected="true"]'); href = sel.get_attribute('href')
        ok(pg.locator('.q-item').nth(1).get_attribute('aria-selected') == 'true', 'arrow keys move selection')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(1200)
        ok(pg.url.endswith(href.split('#')[1]) or '#/read' in pg.url, f'Enter opens {href}')
        if '/read/' in href:
            n = int(href.rsplit('/', 1)[1])
            try: pg.wait_for_function(f"document.querySelector('header') && document.querySelector('header').innerText.includes('{n} / ')", timeout=5000); shown = True
            except Exception: shown = False
            ok(shown, f'exact card {n} shown')
        pg.screenshot(path=f'{OUT}/{W}-opened.png')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#q'); pg.click('#q'); pg.keyboard.type('Stefan Boltzmann'); pg.wait_for_selector('.q-item')
        ok(pg.locator('.q-item').count() >= 1, 'multi-word query')
        pg.fill('#q', ''); pg.keyboard.type('zzqxv nothing'); pg.wait_for_selector('.q-empty')
        ok('No results' in pg.inner_text('.q-empty'), 'empty state'); pg.screenshot(path=f'{OUT}/{W}-empty.png')
        pg.keyboard.press('Escape'); ok(pg.input_value('#q') == '' and pg.locator('#q-res').is_hidden(), 'Esc clears')
        # typing in search must not trigger page shortcuts
        pg.click('#q'); pg.keyboard.type('b d / j'); ok(pg.input_value('#q') == 'b d / j' and pg.url.endswith('#/'), 'typing "/" etc. stays in field')
        pg.close()
    b.close(); finish(errs)
