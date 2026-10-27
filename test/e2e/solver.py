"""Problem solver UI inside the tutor panel. Hidden unless GET /api/tutor reports solver: true. All /api/* calls are
mocked (route fulfil): no paid calls. Checks the structured steps with KaTeX, the From the textbook / Additional
explanation split, calm 429 and unavailable messages, and that the normal tutor still works alongside it."""
from common import *
import json, urllib.request
H = 'heat-mass-transfer'
st = json.loads(urllib.request.urlopen(BASE + '/api/tutor').read())
sv = json.loads(urllib.request.urlopen(BASE + '/api/solve').read())  # read-only status; no solver call
ok(isinstance(st.get('solver'), bool) and (st['solver'] is False or (sv.get('enabled') and sv.get('limiter'))), f'real GET status: solver={st.get("solver")!r} only offered with the limiter configured ({ {k: sv.get(k) for k in ("enabled", "limiter", "limits")} })')
BOOKS = {H: True, 'koretsky-thermo': False, 'electric-circuits': False, 'university-physics': False, 'chemistry-silberberg': False}
SOL = {'givens': [{'symbol': 'k', 'value': '0.8', 'unit': 'W/m·K'}, {'symbol': 'L', 'value': '0.2', 'unit': 'm'}, {'symbol': '\\Delta T', 'value': '50', 'unit': 'K'}],
       'unknown': 'Heat flux \\(q\'\'\\)', 'assumptions': ['Steady, one-dimensional conduction', 'Constant k'],
       'equations': [{'tex': "q'' = k\\frac{\\Delta T}{L}", 'source': 'Section 1-6'}, {'tex': 'R = L/k', 'source': ''}],
       'steps': ["\\(q'' = 0.8 \\times 50 / 0.2 = 200\\) W/m²"], 'result': {'value': '200', 'unit': 'W/m²'},
       'unitCheck': '(W/m·K)(K)/(m) = W/m²', 'sanityCheck': 'Positive and modest for a thin, poorly conducting wall.',
       'fromTextbook': "Fourier's law for steady 1-D conduction through a plane wall.", 'additionalExplanation': 'The thermal-resistance form gives the same result.', 'sourceNote': 'Heat and Mass Transfer, Ch 1'}
PROB = 'A 0.2 m thick wall with k = 0.8 W/m·K has 50 K across it. Find the heat flux.'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, Hh in SIZES + [(390, 844)]:
        pg = b.new_page(viewport={'width': W, 'height': Hh}); watch(pg, errs)
        mode = {'solver': False, 'solve': 'ok'}; solves = []; tutor_posts = []
        def tutor(route):
            if route.request.method == 'GET':
                body = {'configured': True, 'provider': 'mock', 'books': BOOKS}
                if mode['solver'] is not None: body['solver'] = mode['solver']
                return route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
            tutor_posts.append(json.loads(route.request.post_data))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'answer': '### From the textbook\nok', 'sources': [], 'passages': [], 'retrieval': {}, 'conversationId': tutor_posts[-1]['conversationId']}))
        def solve(route):
            solves.append(json.loads(route.request.post_data))
            m = mode['solve']
            if m == '429': return route.fulfill(status=429, headers={'Retry-After': '45'}, content_type='application/json', body=json.dumps({'error': {'code': 'rate_limited', 'message': 'Too many problems right now. Try again later.'}}))
            if m == '429day': return route.fulfill(status=429, headers={'Retry-After': '40000'}, content_type='application/json', body=json.dumps({'error': {'code': 'rate_limited', 'message': 'x'}}))
            if m == '503': return route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': {'code': 'limiter_unavailable', 'message': 'x'}}))
            if m == '404': return route.fulfill(status=404, content_type='application/json', body=json.dumps({'error': {'code': 'not_found', 'message': 'Not available.'}}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'solution': SOL, 'usage': None}))
        pg.route('**/api/tutor', tutor); pg.route('**/api/solve', solve)
        def open_():
            pg.goto(BASE + f'/#/read/{H}/1/1'); pg.reload(); pg.wait_for_timeout(700); pg.click('#tutorBtn'); pg.wait_for_function("document.getElementById('t-status').dataset.state !== 'checking'")
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()')
        for v in (False, None):
            mode['solver'] = v; open_()
            ok(pg.is_hidden('#t-solve'), f'{W}: hidden when status solver={v}')
        mode['solver'] = True; open_()
        ok(pg.is_visible('#t-solve') and pg.inner_text('#t-solve') == 'Solve a problem', f'{W}: "Solve a problem" shown when the server enables it')
        pg.click('#t-solve')
        ok(pg.get_attribute('#t-solve', 'aria-pressed') == 'true' and pg.is_visible('#t-solve-note') and pg.is_hidden('.t-scope') and pg.inner_text('#t-send') == 'Solve', f'{W}: solve mode: note shown, scope hidden, button says Solve')
        pg.fill('#t-input', 'too short'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        ok(not solves and 'more detail' in pg.inner_text('#t-log'), f'{W}: too-short problem not sent, calm hint')
        pg.fill('#t-input', PROB); pg.keyboard.press('Enter'); pg.wait_for_selector('.t-msg.solve')
        ok(solves and solves[-1] == {'bookId': H, 'problem': PROB}, f'{W}: request carries only bookId + problem')
        heads = pg.locator('.t-msg.solve .sv-h').all_inner_texts()
        ok([h.lower() for h in heads] == ['given', 'find', 'assumptions', 'equation', 'substitution', 'units', 'answer', 'sanity check'], f'{W}: steps in order: {heads}')
        ok(pg.locator('.t-msg.solve .katex').count() >= 6 and pg.locator('.t-msg.solve .katex-error').count() == 0, f'{W}: KaTeX rendered ({pg.locator(".t-msg.solve .katex").count()})')
        srcs = pg.locator('.sv-src').all_inner_texts()
        ok('From the textbook · Section 1-6' in srcs[0] and srcs[1].startswith('Additional explanation'), f'{W}: per-equation source labels: {srcs}')
        txt = pg.inner_text('.t-msg.solve')
        ok('From the textbook' in txt and 'Additional explanation' in txt and pg.locator('.sv-part.extra').count() == 1, f'{W}: From the textbook vs Additional explanation kept separate')
        ok('200 W/m²' in pg.inner_text('.sv-ans'), f'{W}: answer with unit')
        sw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]"); lw = pg.evaluate("(() => { const l = document.getElementById('t-log'); return [l.scrollWidth, l.clientWidth]; })()")
        ok(sw[0] <= sw[1] and lw[0] <= lw[1] + 1, f'{W}: no sideways scroll (page {sw}, log {lw})')
        pg.screenshot(path=f'{OUT}/{W}-solution.png')
        stored = pg.evaluate("JSON.parse(localStorage['learnscroll-tutor-v1'])")['heat-mass-transfer']['messages']
        ok(stored[-1].get('solution', {}).get('result') == SOL['result'] and isinstance(stored[-1]['content'], str), f'{W}: solution saved locally in the conversation')
        pg.reload(); pg.wait_for_timeout(700); pg.click('#tutorBtn'); pg.wait_for_selector('.t-msg.solve')
        ok(pg.locator('.t-msg.solve .sv-row').count() == 8, f'{W}: solution re-renders after reload')
        for m, want in (('429', 'about 1 minute'), ('429day', 'tomorrow'), ('503', 'isn’t available right now'), ('404', 'isn’t available right now')):
            mode['solve'] = m
            if pg.get_attribute('#t-solve', 'aria-pressed') != 'true': pg.click('#t-solve')
            pg.fill('#t-input', PROB); pg.keyboard.press('Enter'); pg.wait_for_selector('.t-calm')
            t = pg.inner_text('.t-calm'); col = pg.locator('.t-calm').evaluate("e => getComputedStyle(e).borderLeftColor")
            ok(want in t and pg.input_value('#t-input') == PROB and pg.locator('.t-err').count() == 0 and col != pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--danger').trim()"), f'{W}: calm {m} message, problem kept ({t[:70]!r})')
            if m == '429' and W != 1728: pg.screenshot(path=f'{OUT}/{W}-limit.png')
        mode['solve'] = 'ok'; pg.click('#t-solve-off')
        ok(pg.get_attribute('#t-solve', 'aria-pressed') == 'false' and pg.is_visible('.t-scope') and pg.inner_text('#t-send') == 'Send', f'{W}: back to questions restores the tutor')
        n = len(tutor_posts); pg.fill('#t-input', 'Why is there a minus sign in Fourier law?'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
        ok(len(tutor_posts) == n + 1 and 'question' in tutor_posts[-1], f'{W}: normal tutor question still goes to /api/tutor')
        pg.close()
    b.close(); finish([e for e in errs if not any(c in e for c in ('429', '503', '404'))])  # the mocked error statuses themselves
