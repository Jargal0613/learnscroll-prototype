"""Saved-data schema migration and storage failure handling in the real app (desktop + phone):
legacy data upgraded in place with a pre-migration copy; newer-schema data kept as a downloadable backup;
an import interrupted between writes is rolled back on next start; quota errors during import and during
normal saving leave data intact and say so; UI export -> overwrite import round trip is lossless."""
from common import *
import json, tempfile
SK, TK, JK = 'learnscroll-study-v1', 'learnscroll-tutor-v1', 'learnscroll-write-journal'
B = 'heat-mass-transfer'; T1 = 1761500000000
LEGACY = {'books': {B: {'chapter': 1, 'card': 4, 'done': {'1': True}, 'seen': {'1': 5}, 'marks': {'c1-2': {'b': True, 'd': False}, 'c1-3': {'b': False}},
          'notes': {'c1-2': {'text': 'legacy note', 'at': T1}}, 'review': {'c1-2': {'r': 'again', 'at': T1}}, 'attempts': {'c1-q1': [{'k': 0, 'ok': False, 'at': T1}]}}},
          'last': B, 'recent': [{'book': B, 'chapter': 1, 'card': 4, 'at': T1}], 'sessions': [], 'sessionPrefs': {'book': B, 'minutes': 10}}
TUT = {'_prefs': {'style': 'simple'}, B: {'conversationId': 'c1', 'messages': [{'role': 'user', 'content': 'hi', 'at': T1}], 'draft': '', 'scope': 'card'}}
def seed(pg, study, tutor=None, extra=None):
    pg.goto(BASE + '/#/'); pg.evaluate("([s, t, e, SK, TK]) => { localStorage.clear(); localStorage.setItem(SK, typeof s === 'string' ? s : JSON.stringify(s)); if (t) localStorage.setItem(TK, JSON.stringify(t)); for (const [k, v] of Object.entries(e || {})) localStorage.setItem(k, v); }", [study, tutor, extra, SK, TK])
    pg.reload(); pg.wait_for_timeout(700)
S = lambda pg: json.loads(pg.evaluate(f"localStorage['{SK}']"))
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in [(1440, 900), (390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        # 1. legacy -> current schema
        seed(pg, LEGACY, TUT); st = S(pg)
        ok(st.get('schema') == 2, f'{W}: legacy data migrated to schema 2 on load')
        h = st['books'][B]
        ok(h['notes'] == LEGACY['books'][B]['notes'] and h['review'] == LEGACY['books'][B]['review'] and h['attempts'] == LEGACY['books'][B]['attempts'] and st['sessionPrefs'] == LEGACY['sessionPrefs'], f'{W}: notes, reviews, attempts, prefs preserved')
        ok(h['marks'] == {'c1-2': {'b': True}}, f'{W}: marks normalised ({h["marks"]})')
        ok(json.loads(pg.evaluate(f"localStorage['{SK}-pre-schema-1']")) == LEGACY, f'{W}: exact pre-migration copy kept')
        ok(pg.locator('#recover').count() == 0, f'{W}: a normal migration shows no recovery banner')
        pg.goto(BASE + f'/#/book/{B}/bookmarked'); pg.wait_for_timeout(400); ok('Ch 1' in pg.inner_text('main'), f'{W}: migrated bookmark visible in app')
        pg.goto(BASE + f'/#/book/{B}/notes'); pg.wait_for_timeout(400); ok('legacy note' in pg.inner_text('main'), f'{W}: migrated note visible in app')
        pg.reload(); pg.wait_for_timeout(500); ok(S(pg)['books'][B]['notes'] == LEGACY['books'][B]['notes'], f'{W}: second load is a no-op')
        # 2. data from a newer version
        fut = dict(LEGACY, schema=7, futureField={'x': 1}); seed(pg, fut)
        ok(json.loads(pg.evaluate(f"localStorage['{SK}-corrupt-backup']")) == fut and pg.locator('#recover').count() == 1, f'{W}: newer-schema data backed up untouched, recovery offered')
        ok('different version' in pg.inner_text('main'), f'{W}: newer-schema notice shown'); pg.screenshot(path=f'{OUT}/{W}-future-schema.png')
        ok(S(pg)['books'][B]['notes'] == LEGACY['books'][B]['notes'], f'{W}: readable parts of newer data still loaded')
        # 3. interrupted import (journal left behind, half-written new data)
        old = json.dumps(dict(LEGACY, schema=2)); journal = json.dumps({'at': T1, 'keys': {SK: old, TK: json.dumps(TUT)}})
        seed(pg, {'schema': 2, 'books': {}, 'last': None, 'recent': [], 'sessions': []}, None, {JK: journal})
        ok(pg.evaluate(f"localStorage['{JK}']") is None and S(pg)['books'][B]['notes'] == LEGACY['books'][B]['notes'] and json.loads(pg.evaluate(f"localStorage['{TK}']")) == TUT, f'{W}: interrupted import rolled back to previous data')
        ok('interrupted' in pg.inner_text('main'), f'{W}: interrupted-import notice shown'); pg.screenshot(path=f'{OUT}/{W}-interrupted-import.png')
        # 4. UI round trip: export everything -> wipe -> overwrite import -> identical
        seed(pg, LEGACY, TUT); pg.check('#exp-conv')
        with pg.expect_download() as d: pg.click('#exp')
        f1 = json.load(open(d.value.path())); before = S(pg)
        pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(500)
        pg.set_input_files('#imp-file', d.value.path()); pg.wait_for_timeout(500); pg.uncheck('#imp-backup'); pg.click('#imp-over'); pg.wait_for_timeout(500)
        after = S(pg); ok(after == before, f'{W}: export -> overwrite import restores identical study data')
        ok(json.loads(pg.evaluate(f"localStorage['{TK}']")) == TUT, f'{W}: tutor conversations + prefs restored identically')
        ok(pg.evaluate(f"localStorage['{JK}']") is None, f'{W}: journal cleared after a successful import')
        pg.goto(BASE + '/#/'); pg.wait_for_timeout(300); pg.check('#exp-conv')
        with pg.expect_download() as d2: pg.click('#exp')
        f2 = json.load(open(d2.value.path())); f1.pop('exportedAt'); f2.pop('exportedAt'); ok(f1 == f2, f'{W}: second export equals first')
        # 5. quota during import: the second write fails -> nothing changed
        seed(pg, LEGACY, TUT); before = pg.evaluate(f"[localStorage['{SK}'], localStorage['{TK}']]")
        bigp = tempfile.gettempdir() + f'/r7-imp-{W}.json'; o = dict(f2, exportedAt='2026-10-27T00:00:00.000Z'); o['study']['books'][B]['notes']['c1-9'] = {'text': 'from file', 'at': T1 + 5}; json.dump(o, open(bigp, 'w'))
        pg.set_input_files('#imp-file', bigp); pg.wait_for_timeout(500)
        pg.evaluate(f"""(() => {{ const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) {{ if (k === '{TK}') {{ const e = new DOMException('full', 'QuotaExceededError'); throw e; }} return real.call(this, k, v); }}; }})()""")
        pg.click('#imp-merge'); pg.wait_for_timeout(500)
        ok('Import failed' in pg.inner_text('main') and pg.evaluate(f"[localStorage['{SK}'], localStorage['{TK}']]") == before, f'{W}: quota mid-import leaves both stores exactly as before')
        ok(pg.evaluate(f"localStorage['{JK}']") is None, f'{W}: no stale journal after a failed import')
        pg.screenshot(path=f'{OUT}/{W}-import-quota.png')
        # 6. quota during normal saving: warning, app keeps working
        pg.evaluate("""(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; })()""")
        pg.goto(BASE + f'/#/read/{B}/1/2'); pg.wait_for_timeout(900); pg.keyboard.press('d'); pg.wait_for_timeout(300)
        ok(pg.locator('#save-warn').is_visible() and pg.get_attribute('.mark[data-mark="d"][data-id="c1-2"]', 'aria-pressed') == 'true', f'{W}: quota while saving shows warning; app keeps working')
        pg.screenshot(path=f'{OUT}/{W}-save-quota.png')
        ctx.close()
    b.close(); finish(errs)
