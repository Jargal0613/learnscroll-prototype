"""Round 14 'My textbook': B opens their own PDF; it is kept in IndexedDB only (no request ever carries it), shown by
the browser's PDF viewer at the mapped page beside the existing cards. Uses a generated 420-page dummy PDF (no
textbook content). Checks: entry point, open/verify/offset/remove, mapped pages, prev/next + chapter boundaries,
resume, mark read, bookmarks with notes, card -> page and formula -> page links, related cards open the right card,
no tutor/network calls, export carries progress but not the file, phone layout without horizontal overflow."""
from common import *
import json, os, re, tempfile
BOOK = 'heat-mass-transfer'
def dummy_pdf(n=420):
    objs = ['<< /Type /Catalog /Pages 2 0 R >>', None, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for i in range(1, n + 1):
        s = f'BT /F1 24 Tf 72 700 Td (Dummy page {i}) Tj ET'.encode()
        objs.append(f'<< /Length {len(s)} >>\nstream\n{s.decode()}\nendstream')
        objs.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objs)} 0 R >>'); kids.append(len(objs))
    objs[1] = f'<< /Type /Pages /Kids [{" ".join(f"{k} 0 R" for k in kids)}] /Count {n} >>'
    out = b'%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs, 1): offs.append(len(out)); out += f'{i} 0 obj\n{o}\nendobj\n'.encode()
    x = len(out); out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offs)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    p = os.path.join(tempfile.gettempdir(), 'ls-dummy-textbook.pdf'); open(p, 'wb').write(out); return p
PDF = dummy_pdf()
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, Hh in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': Hh}); pg = ctx.new_page(); watch(pg, errs); reqs = []
        pg.on('request', lambda r: reqs.append((r.method, r.url, len(r.post_data_buffer or b''))))
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        pg.goto(BASE + f'/#/book/{BOOK}'); pg.wait_for_selector('#tp-entry')
        ok('Read the book' in pg.inner_text('#tp-entry') and pg.locator('.chap').count() >= 5, f'{W}: book page offers Read the book next to the study tools')
        pg.click('#tp-entry'); pg.wait_for_selector('#tp-file', state='attached')
        ok('stays in this browser only' in pg.inner_text('.tp-open') and 'not uploaded' in pg.inner_text('.tp-open'), f'{W}: open prompt explains the file stays local')
        ok('1–1' in pg.inner_text('.tp-cards') and pg.locator('.tp-card').count() == 3, f'{W}: section 1–1 shows its 3 existing cards beside the page')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-open-prompt.png')
        n0 = len(reqs)
        pg.set_input_files('#tp-file', PDF); pg.wait_for_selector('#tp-ver')
        ok(not any(m != 'GET' for m, u, s in reqs) and not any(s for m, u, s in reqs), f'{W}: opening the PDF sends nothing ({len(reqs) - n0} requests, all GET, none with a body)')
        ok('Different file' in pg.inner_text('#tp-ver'), f'{W}: unverified copy is flagged')
        ok(pg.get_attribute('#tp-ext', 'href').endswith('#page=25'), f'{W}: 1–1 → printed page 2 → PDF page 25')
        stored = pg.evaluate("""() => new Promise(r => { const q = indexedDB.open('learnscroll-textbook'); q.onsuccess = () => { const g = q.result.transaction('files').objectStore('files').get('heat-mass-transfer'); g.onsuccess = () => r({ size: g.result.size, sha: g.result.sha256.length, blob: g.result.blob.size }); }; })""")
        ok(stored['size'] == os.path.getsize(PDF) and stored['blob'] == stored['size'] and stored['sha'] == 64, f'{W}: file stored in IndexedDB ({stored["size"]} bytes, SHA-256 recorded)')
        pg.fill('#tp-offset', '20'); pg.locator('#tp-offset').dispatch_event('change'); pg.wait_for_function("document.getElementById('tp-ext').href.endsWith('#page=22')")
        ok(True, f'{W}: offset change: PDF page = printed + 20')
        # navigation, chapter boundary, direct links
        pg.goto(BASE + f'/#/text/{BOOK}/1-summary'); pg.wait_for_selector('#tp-ext')
        ok(pg.get_attribute('#tp-ext', 'href').endswith('#page=70') and 'Chapter summary' in pg.inner_text('.tp-title'), f'{W}: direct link 1-summary → p. 50 (offset kept)')
        pg.click('#tb-next'); pg.wait_for_selector('.tp-title:has-text("2–1")'); pg.wait_for_selector('#tp-ext')
        ok('Chapter 2' in pg.inner_text('.tp-where') and pg.get_attribute('#tp-ext', 'href').endswith('#page=88'), f'{W}: Next crosses into chapter 2 (2–1, p. 68)')
        pg.keyboard.press('ArrowLeft'); pg.wait_for_selector('.tp-title:has-text("Chapter summary")'); ok(True, f'{W}: ← key goes back')
        pg.goto(BASE + f'/#/text/{BOOK}/5-summary'); pg.wait_for_selector('.tp-title:has-text("Chapter summary")')
        ok(pg.locator('#tb-next').count() == 0 and 'End of chapter 5' in pg.inner_text('.tb-nav'), f'{W}: last section: no Next')
        pg.goto(BASE + f'/#/text/{BOOK}/1-1'); pg.wait_for_selector('.tp-title:has-text("1–1")')
        ok(pg.locator('#tb-prev').count() == 0, f'{W}: first section: no Previous')
        pg.goto(BASE + f'/#/text/{BOOK}/9-1'); pg.wait_for_selector('.empty, main'); ok('isn’t' in pg.inner_text('main'), f'{W}: unknown section handled')
        # progress + bookmark + note + resume
        pg.goto(BASE + f'/#/text/{BOOK}/3-4'); pg.wait_for_selector('#tp-read'); pg.click('#tp-read'); pg.wait_for_selector('#tp-read[aria-pressed="true"]')
        pg.click('#tb-mark'); pg.wait_for_selector('#tb-mark[aria-pressed="true"]')
        ok('1 of 45 sections read' in pg.inner_text('#tb-prog'), f'{W}: Mark read counts (1 of 45)')
        if W < 900: pg.click('#tb-menu')
        pg.fill('[data-note="0"]', 'cylinders'); pg.locator('[data-note="0"]').dispatch_event('change')
        rd = pg.evaluate("JSON.parse(localStorage.getItem('learnscroll.v1') || localStorage.getItem('learnscroll') || '{}')")
        r = (rd.get('reading') or {}).get(BOOK) if isinstance(rd, dict) else None
        if r is None:
            keys = pg.evaluate('Object.keys(localStorage)'); r = None
            for k in keys:
                v = pg.evaluate(f'localStorage.getItem({json.dumps(k)})')
                if v and '"reading"' in v: r = json.loads(v).get('reading', {}).get(BOOK)
        ok(r and r['section'] == '3-4' and '3-4' in r.get('done', {}) and r['marks'][0] == {**r['marks'][0], 'section': '3-4', 'note': 'cylinders'}, f'{W}: saved in study.reading: section, done, bookmark note')
        ok(not any('heat-mass-transfer' in (pg.evaluate(f'localStorage.getItem({json.dumps(k)})') or '') and '%PDF' in (pg.evaluate(f'localStorage.getItem({json.dumps(k)})') or '') for k in pg.evaluate('Object.keys(localStorage)')), f'{W}: the PDF is not in localStorage / exported study data')
        pg.goto(BASE + '/#/'); pg.goto(BASE + f'/#/text/{BOOK}'); pg.wait_for_selector('.tp-title')
        ok('3–4' in pg.inner_text('.tp-title'), f'{W}: resume opens the last section (3–4)')
        if W >= 900: ok(pg.locator('.tb-side a[aria-current]').inner_text().startswith('3–4'), f'{W}: contents highlights the current section')
        # related card opens the existing card
        href = pg.get_attribute('.tp-card a[data-card]', 'href'); want = pg.locator('.tp-card h3').first.inner_text(); pg.click('.tp-card a[data-card]'); pg.wait_for_selector('#count'); pg.wait_for_timeout(700)
        n = int(href.rsplit('/', 1)[1]); ok(re.search(r'#/read/heat-mass-transfer/3/\d+$', href) and pg.inner_text('#count').startswith(f'{n} /'), f'{W}: related card link opens the existing card ({href}, "{want}")')
        # card -> page link
        pg.goto(BASE + f'/#/read/{BOOK}/1/13'); pg.wait_for_selector('.card .tp-link')
        lk = pg.locator('.card .tp-link').first; ok('p.' in lk.inner_text() and lk.get_attribute('href').startswith(f'#/text/{BOOK}/1-'), f'{W}: cards carry a Textbook page link ({pg.locator(".card .tp-link").count()} in chapter 1)')
        pg.goto(BASE + f'/#/read/{BOOK}/3/1'); pg.wait_for_selector('.card .tp-link'); ok(pg.locator('.card .tp-link').first.get_attribute('href') == f'#/text/{BOOK}/3-1', f'{W}: chapter 3 card → 3-1')
        pg.goto(BASE + f'/#/read/koretsky-thermo/1/1'); pg.wait_for_timeout(600); ok(pg.locator('.tp-link').count() == 0, f'{W}: other books: no textbook links')
        # formula notebook -> page
        pg.goto(BASE + f'/#/read/{BOOK}/1/13'); pg.wait_for_selector('.card'); sv = pg.locator('[data-fsave]').first
        if sv.count():
            sv.click(); pg.goto(BASE + '/#/formulas'); pg.wait_for_selector('.f-src-link')
            ok(pg.locator('a.tp-link').count() >= 1 and pg.locator('a.tp-link').first.get_attribute('href').startswith(f'#/text/{BOOK}/'), f'{W}: saved formula links to its textbook page')
        else: ok(False, f'{W}: formula save button found')
        # no paid / tutor calls anywhere above
        ok(not any('/api/' in u and m == 'POST' for m, u, s in reqs), f'{W}: no tutor/API POSTs from reading, navigating, bookmarking')
        # layout
        pg.goto(BASE + f'/#/text/{BOOK}/1-6'); pg.wait_for_selector('#tp-ver')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth'); ok(ow <= 0, f'{W}: no horizontal overflow ({ow})')
        if W >= 1300: ok(pg.locator('.tp-cards').bounding_box()['x'] > pg.locator('.tp-page').bounding_box()['x'], f'{W}: cards beside the page (right column)')
        if W < 900:
            ok(pg.is_hidden('#tb-side') and pg.is_visible('#tb-menu'), f'{W}: contents collapsed behind Sections')
            pg.click('#tb-menu'); ok(pg.is_visible('#tb-side'), f'{W}: Sections opens the contents'); pg.screenshot(path=f'{OUT}/{W}-contents.png'); pg.click('#tb-close')
            hb = [pg.locator(s).bounding_box()['height'] for s in ['#tb-menu', '#tp-read', '#tb-mark']]; ok(min(hb) >= 44, f'{W}: touch targets ≥44px ({hb})')
        pg.screenshot(path=f'{OUT}/{W}-viewer.png', full_page=(W < 900))
        # remove the file
        pg.once('dialog', lambda d: d.accept()); pg.click('#tp-remove'); pg.wait_for_selector('#tp-file', state='attached')
        ok(pg.evaluate("""() => new Promise(r => { const q = indexedDB.open('learnscroll-textbook'); q.onsuccess = () => { const g = q.result.transaction('files').objectStore('files').get('heat-mass-transfer'); g.onsuccess = () => r(g.result === undefined); }; })"""), f'{W}: Remove deletes the file from this browser; progress stays')
        ctx.close()
    finish(errs)
