"""Tutor availability per book: the panel shows a quiet 'Tutor connected' / 'Tutor unavailable for this book' from
the server's GET /api/tutor status (which reads the server's knowledge config, no ids or secrets). Unconnected books
explain before submit and never send; a failed status check looks different from 'unavailable'; a server
'book_not_available' reply is shown as unavailable, not as an error. Mocked except one read-only GET of the status."""
from common import *
import json, urllib.request
H, K = 'heat-mass-transfer', 'koretsky-thermo'
st = json.loads(urllib.request.urlopen(BASE + '/api/tutor').read())
raw = json.dumps(st)
ok(isinstance(st.get('books'), dict) and set(st['books']) >= {H, K} and not any(x in raw for x in ('vs_', 'file-', 'sk-', '.pdf')), f'real GET status: per-book map, no ids or secrets ({raw[:160]})')
if 'localhost' not in BASE: ok(st['configured'] and st['books'][H] is True and st['books'][K] is False, 'live: Heat & Mass connected, Koretsky not (matches server knowledge config)')
MOCK = {'configured': True, 'provider': 'mock', 'books': {H: True, K: False, 'electric-circuits': False, 'university-physics': False, 'chemistry-silberberg': False}}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, Hh in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': Hh}); watch(pg, errs)
        mode = {'get': 'ok', 'post': 'ok'}; posts = []
        def handler(route):
            if route.request.method == 'GET':
                if mode['get'] == 'fail': return route.fulfill(status=500, content_type='application/json', body='{}')
                if mode['get'] == 'off': return route.fulfill(status=200, content_type='application/json', body=json.dumps({'configured': False, 'provider': None, 'books': {k: False for k in MOCK['books']}}))
                return route.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK))
            posts.append(json.loads(route.request.post_data))
            if mode['post'] == 'na': return route.fulfill(status=404, content_type='application/json', body=json.dumps({'error': {'code': 'book_not_available', 'message': 'Not indexed.'}}))
            if mode['post'] == 'fail': return route.fulfill(status=502, content_type='application/json', body=json.dumps({'error': {'code': 'provider_error', 'message': 'Upstream failed.'}}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': '### From the textbook\nok', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': posts[-1]['conversationId']}))
        pg.route('**/api/tutor', handler)
        def open_(book):
            pg.goto(BASE + f'/#/read/{book}/1/1'); pg.reload(); pg.wait_for_timeout(900); pg.click('#tutorBtn'); pg.wait_for_function("document.getElementById('t-status').dataset.state !== 'checking'")
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        open_(H)
        ok(pg.inner_text('#t-status') == 'Tutor connected' and pg.get_attribute('#t-status', 'data-state') == 'on' and pg.is_hidden('#t-notice') and not pg.is_disabled('#t-input'), f'{W}: connected book: quiet "Tutor connected", input enabled')
        if W != 1728: pg.locator('.t-head').screenshot(path=f'{OUT}/{W}-connected.png')
        open_(K)
        ok(pg.inner_text('#t-status') == 'Tutor unavailable for this book' and pg.get_attribute('#t-status', 'data-state') == 'off', f'{W}: unconnected book: "Tutor unavailable for this book"')
        ok(pg.is_visible('#t-notice') and 'never searched' in pg.inner_text('#t-notice') and pg.is_disabled('#t-input') and pg.is_disabled('#t-send'), f'{W}: explained before submit; input and Send disabled')
        pg.evaluate("document.getElementById('t-input').disabled = false"); pg.fill('#t-input', 'force'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        ok(not posts and 'From the textbook' not in pg.inner_text('#t-log'), f'{W}: nothing sent for an unconnected book; no "From the textbook"')
        ok(pg.locator('#t-notice').evaluate("e => getComputedStyle(e).borderLeftColor") != pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--danger')"), f'{W}: unavailable notice is not styled as an error')
        if W != 1728: pg.locator('#tutor').screenshot(path=f'{OUT}/{W}-unavailable.png')
        mode['get'] = 'off'; open_(H)
        ok(pg.inner_text('#t-status') == 'Tutor unavailable' and pg.is_disabled('#t-send'), f'{W}: server not configured: "Tutor unavailable"')
        mode['get'] = 'fail'; open_(K)
        s_err = pg.get_attribute('#t-status', 'data-state'); before = pg.evaluate("getComputedStyle(document.getElementById('t-status'), '::before').color")
        ok(s_err == 'error' and 'Couldn’t check' in pg.inner_text('#t-status') and before == 'rgb(255, 107, 107)', f'{W}: failed status check is a distinct error state (red !), not "unavailable"')
        if W != 1728: pg.locator('.t-head').screenshot(path=f'{OUT}/{W}-status-error.png')
        mode['post'] = 'na'; pg.fill('#t-input', 'question'); pg.keyboard.press('Enter'); pg.wait_for_function("document.getElementById('t-status').dataset.state === 'off'")
        ok(pg.locator('#t-log .t-err').count() == 0 and pg.is_visible('#t-notice') and 'From the textbook' not in pg.inner_text('#t-log'), f'{W}: server "book_not_available" shown as unavailable, not as an error')
        mode['get'] = 'ok'; mode['post'] = 'fail'; open_(H); pg.fill('#t-input', 'q'); pg.keyboard.press('Enter'); pg.wait_for_selector('#t-log .t-err')
        ok(pg.get_attribute('#t-status', 'data-state') == 'on' and pg.is_hidden('#t-notice'), f'{W}: an answer error on a connected book stays an error (red box), status still connected')
        pg.close()
    b.close(); finish([e for e in errs if '500' not in e and '502' not in e and '404' not in e])
