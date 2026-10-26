"""Import semantics: the import page lists per category what Merge and Replace will do (incl. legacy files missing a
category); Replace replaces every included category, incl. an empty tutor-conversation list and an empty session;
categories not in the file are kept; auto-backup is offered and downloaded first; Cancel changes nothing; invalid
and newer files change nothing. Tutor data missing / empty / populated and session missing / empty / populated."""
from common import *
import json, tempfile, time
SK, TK, XK = 'learnscroll-study-v1', 'learnscroll-tutor-v1', 'learnscroll-session-v1'
B = 'heat-mass-transfer'; T1 = 1761500000000
LSTUDY = {'schema': 2, 'books': {B: {'chapter': 1, 'card': 2, 'done': {}, 'seen': {'1': 2}, 'marks': {'c1-2': {'b': True}}, 'notes': {'c1-2': {'text': 'local note', 'at': T1}}, 'review': {}, 'attempts': {}}}, 'last': B, 'recent': [], 'sessions': []}
LTUT = {'_schema': 2, B: {'conversationId': 'clocal', 'messages': [{'role': 'user', 'content': 'local q', 'at': T1}, {'role': 'assistant', 'content': 'local a', 'at': T1 + 1}], 'draft': '', 'scope': 'card'}}
def lsess(now): return {'schema': 2, 'book': B, 'minutes': 20, 'start': now - 60000, 'ids': ['c1-1', 'c1-2'], 'pos': 0, 'viewed': {}, 'marked': {}, 'active': 5, 'visibleSince': None, 'lastSeen': now - 1000}
FSTUDY = {'books': {B: {'chapter': 1, 'card': 5, 'done': {}, 'seen': {'1': 5}, 'marks': {}, 'notes': {'c1-5': {'text': 'file note', 'at': T1 + 9}}, 'review': {}}}, 'last': B, 'recent': [], 'sessions': []}
FCONV = {B: {'conversationId': 'cfile', 'messages': [{'role': 'user', 'content': 'file q', 'at': T1 + 5}], 'draft': '', 'scope': 'chapter'}}
def file(version, conv, sess):  # conv/sess: 'missing' | 'empty' | 'populated'
    f = {'app': 'learnscroll', 'version': version, 'exportedAt': '2026-10-27T00:00:00.000Z', 'study': FSTUDY, 'tutor': {'prefs': {'style': 'simple'}}}
    if conv == 'empty': f['tutor']['conversations'] = {}
    if conv == 'populated': f['tutor']['conversations'] = FCONV
    if version == 2 and sess != 'missing': f['session'] = None if sess == 'empty' else {'book': B, 'minutes': 10, 'start': int(time.time()*1000), 'ids': ['c1-3'], 'pos': 0, 'viewed': {}, 'marked': {}, 'active': 0, 'visibleSince': None, 'lastSeen': None}
    path = tempfile.gettempdir() + f'/r9-{version}-{conv}-{sess}.json'; json.dump(f, open(path, 'w')); return path
G = lambda pg, k: pg.evaluate(f"localStorage['{k}'] === undefined ? null : JSON.parse(localStorage['{k}'])")
ALL = lambda pg: pg.evaluate(f"[localStorage['{SK}'], localStorage['{TK}'], localStorage['{XK}'] ?? null]")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        def seed():
            pg.goto(BASE + '/#/'); now = pg.evaluate('Date.now()')
            pg.evaluate("([s,t,x,SK,TK,XK]) => { localStorage.clear(); localStorage[SK] = JSON.stringify(s); localStorage[TK] = JSON.stringify(t); localStorage[XK] = JSON.stringify(x); }", [LSTUDY, LTUT, lsess(now), SK, TK, XK])
            pg.reload(); pg.wait_for_selector('#imp')
        def open_file(path): pg.set_input_files('#imp-file', path); pg.wait_for_selector('#imp-merge, #imp-back')
        def row(cat): return [c.inner_text() for c in pg.locator(f'tr[data-cat="{cat}"] td').all()]
        cases = [(2, 'missing', 'populated'), (2, 'empty', 'empty'), (2, 'populated', 'populated'), (1, 'missing', 'missing'), (1, 'populated', 'missing')]
        for v, conv, sess in cases:
            tag = f'{W} v{v} tutor={conv} session={sess}'
            seed(); open_file(file(v, conv, sess)); rc, rs = row('conversations'), row('session')
            exp_c = {'missing': 'Kept as they are', 'empty': 'Removed (1 conversation here', 'populated': 'Replaced by the file'}[conv]
            exp_s = {'missing': 'Kept (the file has no session data)', 'empty': 'Ended (the file has none)', 'populated': 'Replaced by the file'}[sess]
            ok(rc[2].startswith(exp_c) and rs[2].startswith(exp_s), f'{tag}: plan says Replace → tutor "{rc[2]}", session "{rs[2]}"')
            if v == 1: ok(rs[0].startswith('Not in the file'), f'{tag}: legacy file: missing session category explained before import ({rs[0]})')
            if conv == 'empty' and W == 1440: pg.screenshot(path=f'{OUT}/{W}-plan-empty.png', full_page=True)
            if v == 1 and conv == 'missing' and W in (1440, 390): pg.screenshot(path=f'{OUT}/{W}-plan-legacy.png', full_page=True)
            with pg.expect_download() as d: pg.click('#imp-over')
            pg.wait_for_timeout(500); bk = json.load(open(d.value.path()))
            ok('backup' in d.value.suggested_filename and bk['study']['books'][B]['notes']['c1-2']['text'] == 'local note', f'{tag}: auto-backup of current data downloaded first')
            s, t, x = G(pg, SK), G(pg, TK), G(pg, XK)
            ok('local note' not in json.dumps(s) and 'file note' in json.dumps(s) and t['_prefs']['style'] == 'simple', f'{tag}: study data and style replaced')
            convs = {k: v_ for k, v_ in t.items() if not k.startswith('_')}
            ok({'missing': B in convs and convs[B]['conversationId'] == 'clocal', 'empty': convs == {}, 'populated': convs.get(B, {}).get('conversationId') == 'cfile'}[conv], f'{tag}: tutor conversations {conv} handled ({list(convs)})')
            ok({'missing': x is not None and x['minutes'] == 20, 'empty': x is None, 'populated': x is not None and x['ids'] == ['c1-3']}[sess], f'{tag}: session {sess} handled')
        # Merge with populated file keeps local session, combines conversations
        seed(); open_file(file(2, 'populated', 'populated')); ok(row('session')[1] == 'This browser’s session kept', f'{W}: merge plan for session')
        pg.click('#imp-merge'); pg.wait_for_timeout(500); t = G(pg, TK)[B]
        ok(G(pg, XK)['minutes'] == 20 and {t['conversationId']} | {c['conversationId'] for c in t.get('saved', [])} == {'clocal', 'cfile'}, f'{W}: merge keeps local session; both conversations kept')
        ok({'local note', 'file note'} <= {n['text'] for n in G(pg, SK)['books'][B]['notes'].values()}, f'{W}: merge combines notes')
        # Cancel, invalid, newer: nothing changes
        seed(); before = ALL(pg); open_file(file(2, 'empty', 'empty')); pg.click('#imp-cancel'); pg.wait_for_timeout(300)
        ok(ALL(pg) == before, f'{W}: Cancel changes nothing')
        bad = tempfile.gettempdir() + '/r9-bad.json'; f = json.load(open(file(2, 'populated', 'populated'))); f['study']['books'][B]['notes']['c1-5']['text'] = 5; json.dump(f, open(bad, 'w'))
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#imp'); open_file(bad); ok(ALL(pg) == before and pg.locator('#imp-merge').count() == 0, f'{W}: invalid file: no options, nothing changed')
        newer = tempfile.gettempdir() + '/r9-newer.json'; f['version'] = 3; json.dump(f, open(newer, 'w'))
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#imp'); open_file(newer); ok(ALL(pg) == before and 'newer version' in pg.inner_text('main'), f'{W}: newer file: refused, nothing changed')
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#imp'); open_file(file(2, 'populated', 'populated'))
        ok('Never imported or exported' in pg.inner_text('main') and 'Merge conflicts' in pg.inner_text('main'), f'{W}: excluded data and merge conflict rule shown')
        if W < 700: ok(pg.evaluate("document.documentElement.scrollWidth") <= W, f'{W}: import page has no page-level horizontal scroll (table scrolls in its box)')
        ctx.close()
    b.close(); finish(errs)
