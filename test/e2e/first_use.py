"""First-use guide: compact 3-step guide only when this browser has no study activity; existing users never see
it; dismissal persists across reloads; reopen from the Help menu; links to the shortcuts; fits desktop and phone."""
from common import *
import json
SK, B = 'learnscroll-study-v1', 'heat-mass-transfer'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844), (320, 640)]:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#helpBtn')
        g = pg.locator('#guide')
        ok(g.is_visible() and [x.inner_text().split('.')[0] for x in g.locator('.guide-steps b').all()] == ['Choose a book', 'Study a card', 'Review or ask the tutor'], f'{W}: new visitor sees the 3-step guide')
        bx = g.bounding_box(); ok(bx['height'] < (420 if W < 350 else 330 if W < 400 else 230) and pg.evaluate('document.documentElement.scrollWidth') <= W, f'{W}: guide is compact ({int(bx["height"])}px) with no sideways scroll')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-guide.png')
        pg.click('#guide-keys'); pg.wait_for_selector('dialog.keys-dlg[open]'); ok(True, f'{W}: guide links to the shortcuts'); pg.keyboard.press('Escape')
        pg.click('#guide-x'); ok(g.count() == 0 and pg.evaluate('document.activeElement.id') == 'helpBtn', f'{W}: Dismiss removes it and moves focus to Help')
        pg.reload(); pg.wait_for_selector('#helpBtn'); ok(pg.locator('#guide').count() == 0, f'{W}: dismissal persists after reload')
        pg.click('#helpBtn'); ok(pg.is_visible('#helpMenu') and pg.get_attribute('#helpBtn', 'aria-expanded') == 'true', f'{W}: Help menu opens')
        mb = pg.locator('#helpMenu').bounding_box(); ok(mb['x'] >= 0 and mb['x'] + mb['width'] <= W, f'{W}: Help menu fits on screen')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-help-menu.png')
        pg.keyboard.press('Escape'); ok(pg.is_hidden('#helpMenu') and pg.evaluate('document.activeElement.id') == 'helpBtn', f'{W}: Esc closes Help, focus back on the button')
        pg.click('#helpBtn'); pg.click('[data-help="keys"]'); ok(pg.is_visible('dialog.keys-dlg[open]'), f'{W}: Help → Keyboard shortcuts'); pg.keyboard.press('Escape')
        pg.click('#helpBtn'); pg.click('[data-help="guide"]'); ok(pg.is_visible('#guide'), f'{W}: Help → reopen guide')
        pg.reload(); pg.wait_for_selector('#helpBtn'); ok(pg.is_visible('#guide'), f'{W}: reopened guide stays until dismissed again')
        pg.click('#guide-x')
        # existing users: any activity hides it (no dismissal recorded)
        for name, seed in [('progress', {'schema': 2, 'books': {B: {'chapter': 1, 'card': 3, 'done': {}, 'seen': {}, 'marks': {}, 'notes': {}, 'review': {}, 'attempts': {}}}, 'recent': [], 'sessions': []}),
                           ('a note', {'schema': 2, 'books': {B: {'chapter': 1, 'card': 0, 'done': {}, 'seen': {}, 'marks': {}, 'notes': {'c1-1': {'text': 'n', 'at': 1761500000000}}, 'review': {}, 'attempts': {}}}, 'recent': [], 'sessions': []}),
                           ('last book', {'schema': 2, 'books': {}, 'last': B, 'recent': [], 'sessions': []})]:
            pg.evaluate("([k, v]) => { localStorage.clear(); localStorage[k] = JSON.stringify(v); }", [SK, seed]); pg.reload(); pg.wait_for_selector('#helpBtn')
            ok(pg.locator('#guide').count() == 0, f'{W}: existing user with {name} never sees the guide')
        pg.evaluate("localStorage.clear(); localStorage['learnscroll-tutor-v1'] = JSON.stringify({_schema: 2, 'heat-mass-transfer': {conversationId: 'c1', messages: [{role: 'user', content: 'q'}], draft: '', scope: 'card'}})"); pg.reload(); pg.wait_for_selector('#helpBtn')
        ok(pg.locator('#guide').count() == 0, f'{W}: existing user with only tutor history never sees the guide')
        # reading a card counts as activity
        pg.evaluate('localStorage.clear()'); pg.goto(BASE + f'/#/read/{B}/1/1'); pg.wait_for_timeout(800); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(500); pg.goto(BASE + '/#/'); pg.wait_for_selector('#helpBtn')
        ok(pg.locator('#guide').count() == 0, f'{W}: after studying a card the guide no longer appears')
        pg.close()
    b.close(); finish(errs)
