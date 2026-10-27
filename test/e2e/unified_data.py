"""Unified data reliability: study, tutor and session stores on one schema. Legacy data of every store upgrades
and survives reloads; newer-version stores are backed up and never overwritten silently; export -> clear profile
-> import (Replace) restores notes, progress, quiz attempts, review, tutor conversation + style, session summaries
and the session in progress; incomplete backups change nothing; exports carry no secrets or server data."""
from common import *
import json, re, tempfile
SK, TK, XK = 'learnscroll-study-v1', 'learnscroll-tutor-v1', 'learnscroll-session-v1'
B = 'heat-mass-transfer'; T1 = 1761500000000
STUDY = {'books': {B: {'chapter': 2, 'card': 3, 'done': {'1': True}, 'seen': {'1': 29, '2': 3}, 'marks': {'c1-2': {'b': True}, 'c2-1': {'d': True}},
         'notes': {'c1-2': {'text': 'unified note', 'at': T1}}, 'review': {'c1-2': {'r': 'again', 'at': T1}}, 'attempts': {'c1-q1': [{'k': 0, 'ok': False, 'at': T1}]}}},
         'last': B, 'recent': [{'book': B, 'chapter': 2, 'card': 3, 'at': T1}], 'sessions': [{'book': B, 'minutes': 10, 'start': T1, 'end': T1 + 600000, 'seconds': 420, 'seen': 9, 'marked': 1, 'queued': 30}]}
TUT = {'_prefs': {'style': 'math'}, B: {'conversationId': 'cu1', 'messages': [{'role': 'user', 'content': 'old question', 'at': T1}, {'role': 'assistant', 'content': 'old answer', 'at': T1 + 1, 'retrieval': {}}], 'draft': '', 'scope': 'chapter'}}
def SESS(now): return {'book': B, 'minutes': 30, 'start': now - 60000, 'ids': ['c1-1', 'c1-2', 'c1-3', 'c2-1'], 'pos': 1, 'viewed': {'c1-1': True}, 'marked': {}, 'active': 40, 'visibleSince': None, 'lastSeen': now - 1000}
G = lambda pg, k: pg.evaluate(f"localStorage['{k}'] === undefined ? null : JSON.parse(localStorage['{k}'])")
def strip(o, k): return {a: b for a, b in o.items() if a != k}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); now = pg.evaluate('Date.now()')
        pg.evaluate("([s,t,x,SK,TK,XK]) => { localStorage.clear(); localStorage[SK] = JSON.stringify(s); localStorage[TK] = JSON.stringify(t); localStorage[XK] = JSON.stringify(x); }", [STUDY, TUT, SESS(now), SK, TK, XK])
        pg.reload(); pg.wait_for_timeout(700)
        s, t, x = G(pg, SK), G(pg, TK), G(pg, XK)
        ok(s['schema'] == 5 and t['_schema'] == 5 and x['schema'] == 5, f'{W}: legacy study, tutor and session stores upgraded to schema 5')
        ok(strip(t, '_schema') == TUT and G(pg, TK + '-pre-schema-1') == TUT, f'{W}: tutor data untouched + pre-migration copy')
        ok(strip(x, 'schema') == SESS(now), f'{W}: session fields untouched')
        ok(pg.locator('#sessResume').count() == 1, f'{W}: session in progress offered for resume after upgrade')
        pg.reload(); pg.wait_for_timeout(500)
        ok(G(pg, SK)['books'][B]['notes'] == STUDY['books'][B]['notes'] and strip(G(pg, TK), '_schema') == TUT and pg.locator('#sessResume').count() == 1, f'{W}: everything survives a second reload')
        pg.goto(BASE + f'/#/read/{B}/1/2'); pg.wait_for_timeout(900); pg.click('#tutorBtn'); pg.wait_for_timeout(300)
        ok('old answer' in pg.inner_text('#t-log'), f'{W}: upgraded tutor conversation shown'); pg.click('#t-close')
        # newer-version tutor + session stores
        pg.goto(BASE + '/#/'); futT = dict(TUT, _schema=7); futX = dict(SESS(now), schema=7)
        pg.evaluate("([t,x,TK,XK]) => { localStorage[TK] = JSON.stringify(t); localStorage[XK] = JSON.stringify(x); }", [futT, futX, TK, XK]); pg.reload(); pg.wait_for_timeout(700)
        ok(G(pg, TK + '-corrupt-backup') == futT and G(pg, XK + '-corrupt-backup') == futX, f'{W}: newer tutor/session stores backed up verbatim')
        ok(G(pg, TK) == futT and pg.locator('#recover').count() == 1 and 'different version' in pg.inner_text('main'), f'{W}: newer tutor store not overwritten; recovery offered')
        pg.screenshot(path=f'{OUT}/{W}-newer-version.png')
        # export everything -> clear -> import (Replace)
        pg.evaluate("([s,t,x,SK,TK,XK]) => { localStorage.clear(); localStorage[SK] = JSON.stringify(s); localStorage[TK] = JSON.stringify(t); localStorage[XK] = JSON.stringify(x); }", [STUDY, TUT, SESS(now), SK, TK, XK])
        pg.reload(); pg.wait_for_timeout(600); before = {k: G(pg, k) for k in (SK, TK, XK)}
        ok(pg.is_checked('#exp-conv'), f'{W}: conversations included by default')
        with pg.expect_download() as d: pg.click('#exp')
        raw = open(d.value.path()).read(); f = json.loads(raw)
        ok(f['version'] == 5 and sorted(f) == ['app', 'exportedAt', 'session', 'study', 'tutor', 'version'] and f['session']['ids'] == SESS(now)['ids'], f'{W}: export v2 has study, tutor and session')
        ok(not re.search(r'sk-[A-Za-z0-9]|OPENAI|api[_-]?key|vs_[A-Za-z0-9]{6}|vector_store|corrupt-backup|pre-schema', raw, re.I), f'{W}: export has no secrets, server ids or internal backups')
        pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)
        ok(pg.locator('#sessResume').count() == 0 and pg.locator('#continue').count() == 0, f'{W}: profile cleared')
        pg.set_input_files('#imp-file', d.value.path()); pg.wait_for_timeout(500)
        ok('Replace' in pg.inner_text('main') and 'Merge' in pg.inner_text('main') and 'Session in progress' in pg.inner_text('main'), f'{W}: Merge or Replace choice with session row')
        pg.screenshot(path=f'{OUT}/{W}-import-choice.png', full_page=True)
        pg.uncheck('#imp-backup'); pg.click('#imp-over'); pg.wait_for_timeout(600)
        after = {k: G(pg, k) for k in (SK, TK, XK)}
        ok(after[SK] == before[SK], f'{W}: notes, progress, quizzes, review, session summaries restored exactly')
        ok(strip(after[TK], '_schema') == strip(before[TK], '_schema'), f'{W}: tutor conversation + style restored')
        ok(after[XK] == before[XK] and pg.locator('#sessResume').count() == 1, f'{W}: session in progress restored and resumable')
        pg.reload(); pg.wait_for_timeout(500); ok(G(pg, SK) == before[SK], f'{W}: import survives reload')
        pg.goto(BASE + f'/#/book/{B}/notes'); pg.wait_for_timeout(400); ok('unified note' in pg.inner_text('main'), f'{W}: restored note visible')
        # incomplete backup
        bad = tempfile.gettempdir() + f'/r8-trunc-{W}.json'; open(bad, 'w').write(raw[: len(raw) // 2])
        pg.goto(BASE + '/#/'); pg.wait_for_timeout(300); pg.set_input_files('#imp-file', bad); pg.wait_for_timeout(400)
        ok("can’t be imported" in pg.inner_text('main') and {k: G(pg, k) for k in (SK, TK, XK)} == after, f'{W}: incomplete backup rejected, nothing changed')
        newer = tempfile.gettempdir() + f'/r8-newer-{W}.json'; json.dump(dict(f, version=99), open(newer, 'w'))
        pg.goto(BASE + '/#/'); pg.wait_for_timeout(300); pg.set_input_files('#imp-file', newer); pg.wait_for_timeout(400)
        ok('newer version' in pg.inner_text('main') and {k: G(pg, k) for k in (SK, TK, XK)} == after, f'{W}: newer-version backup refused, nothing changed')
        pg.screenshot(path=f'{OUT}/{W}-newer-backup.png'); ctx.close()
    b.close(); finish(errs)
