"""Round 13 reading books: library cards, contents, shared reader with left contents (drawer on phone), See also links,
prev/next at the boundaries, resume, book switcher, bookmarks with notes, section progress, missing sections,
no tutor requests while reading, Heat & Mass entry still there."""
from common import *
import json
A, N = 'ai-history', 'neuro-history'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, Hh in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': Hh}); watch(pg, errs); posts = []
        pg.on('request', lambda r: r.method == 'POST' and '/api/' in r.url and posts.append(r.url))
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('.grid .tb')
        cards = pg.locator('.grid .book').count(); tb = pg.locator('.grid .tb')
        ok(tb.count() == 2 and pg.locator('.grid a.book[href="#/book/heat-mass-transfer"]').count() == 1, f'{W}: library: Heat & Mass plus both reading books ({cards} books)')
        t = tb.first.inner_text()
        ok('A History of Artificial Intelligence and Computing' in t and '20 chapters' in t.replace('\n', ' ') and '64 sections' in t.replace('\n', ' ') and 'Not started' in t, f'{W}: AI card: title, 20 chapters, 64 sections, Not started')
        ok('15 chapters' in tb.nth(1).inner_text().replace('\n', ' ') and '52 sections' in tb.nth(1).inner_text().replace('\n', ' '), f'{W}: Neuroscience card: 15 chapters, 52 sections')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-library.png', full_page=True)
        tb.first.click(); pg.wait_for_selector('#tb-go')
        ok(pg.locator('.tb-side a').count() == 64 and pg.inner_text('#tb-go') == 'Start reading', f'{W}: contents lists 64 sections; Start reading')
        firsts = pg.locator('.tb-side a .tb-n').all_inner_texts()[:4]
        ok(firsts == ['1.1', '1.2', '1.3', '2.1'], f'{W}: outline order ({firsts})')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-contents.png')
        pg.click('#tb-go'); pg.wait_for_selector('.tb-art h1')
        ok('SECTION 1.1' in pg.inner_text('.tb-art h1') and pg.locator('#tb-prev').count() == 0 and 'Start of the book' in pg.inner_text('.tb-nav'), f'{W}: first section: no Previous at the start')
        links = pg.locator('.tb-see a'); hrefs = links.evaluate_all('l => l.map(a => [a.getAttribute("href"), a.target, a.rel])')
        ok(len(hrefs) >= 2 and all(h.startswith('https://') and tg == '_blank' and 'noopener' in r and 'noreferrer' in r for h, tg, r in hrefs), f'{W}: See also: {len(hrefs)} links, https, new tab, noopener noreferrer')
        ok(pg.locator('.tb-art script, .tb-art img').count() == 0, f'{W}: text rendered safely')
        if W >= 1200: ok(pg.is_visible('#tb-side') and pg.locator('#tb-side [aria-current="page"]').count() == 1, f'{W}: desktop: left contents with the current section marked')
        else:
            ok(pg.is_hidden('#tb-side'), f'{W}: phone: contents hidden behind a menu')
            pg.click('#tb-menu'); ok(pg.is_visible('#tb-side') and pg.locator('#tb-side').bounding_box()['width'] == W, f'{W}: phone: contents opens full screen')
            pg.screenshot(path=f'{OUT}/{W}-drawer.png'); pg.click('#tb-close'); ok(pg.is_hidden('#tb-side'), f'{W}: phone: drawer closes')
        pg.screenshot(path=f'{OUT}/{W}-reader.png')
        # bookmark + progress
        pg.click('#tb-mark'); ok(pg.get_attribute('#tb-mark', 'aria-pressed') == 'true', f'{W}: bookmark added')
        pg.evaluate("document.getElementById('tb-end').scrollIntoView()"); pg.wait_for_function("document.getElementById('tb-prog').textContent.startsWith('1 of 64')", timeout=5000)
        ok(True, f'{W}: section marked read after reaching its end (1 of 64)')
        pg.click('#tb-next'); pg.wait_for_selector('.tb-art h1:has-text("SECTION 1.2")')
        ok(pg.locator('#tb-prev').count() == 1, f'{W}: Next goes to 1.2; Previous available')
        pg.keyboard.press('ArrowLeft'); pg.wait_for_selector('.tb-art h1:has-text("SECTION 1.1")'); ok(True, f'{W}: ← key goes back')
        pg.goto(BASE + f'/#/books/{A}/20_02'); pg.wait_for_selector('.tb-art h1')
        ok(pg.locator('#tb-next').count() == 0 and 'End of the book' in pg.inner_text('.tb-nav'), f'{W}: last section: no Next at the end')
        # resume + note + reload persistence
        pg.goto(BASE + '/#/'); pg.wait_for_selector('.grid .tb')
        ok('Continue: section 20.2' in tb.first.inner_text() and '1 of 64' in tb.first.inner_text(), f'{W}: library shows last read and progress')
        pg.goto(BASE + f'/#/books/{A}'); pg.wait_for_selector('#tb-go')
        ok('Continue: 20.2' in pg.inner_text('#tb-go'), f'{W}: contents offers Continue')
        pg.fill('[data-note="0"]', 'Boole matters'); pg.locator('[data-note="0"]').blur(); pg.reload(); pg.wait_for_selector('[data-note="0"]')
        ok(pg.input_value('[data-note="0"]') == 'Boole matters', f'{W}: bookmark note persists after reload')
        pg.click('.tb-marks li a'); pg.wait_for_selector('.tb-art h1:has-text("SECTION 1.1")'); ok(True, f'{W}: bookmark opens its section')
        # switch book, independent progress
        pg.select_option('#tb-switch', f'#/books/{N}'); pg.wait_for_selector('#tb-go')
        ok('From Papyrus to Processors' in pg.inner_text('h1') and pg.inner_text('#tb-go') == 'Start reading' and pg.locator('.tb-marks li').count() == 0, f'{W}: switched to Neuroscience; its own progress and bookmarks')
        pg.goto(BASE + f'/#/books/{N}/99_99'); pg.wait_for_selector('main .empty'); ok('isn’t in this book' in pg.inner_text('main'), f'{W}: missing section fails gracefully')
        pg.goto(BASE + '/#/books/nope'); pg.wait_for_selector('main .empty'); ok(True, f'{W}: unknown book fails gracefully')
        st = pg.evaluate("JSON.parse(localStorage.getItem('learnscroll-study-v1')).reading")
        ok(set(st) == {A} and st[A]['marks'][0]['note'] == 'Boole matters' and '01_01' in st[A]['done'], f'{W}: stored per book (bookmark, note, done)')
        pg.goto(BASE + '/#/book/heat-mass-transfer'); pg.wait_for_timeout(500); ok(pg.locator('.chap').count() >= 5, f'{W}: Heat & Mass book page unchanged')
        ok(not posts, f'{W}: no API POST while reading, navigating or bookmarking')
        pg.close()
    finish(errs)
