"""Export / import: tutor style row, versioned export, clear + import round-trip, merge, overwrite with backup, malformed files."""
import json, time, tempfile
from common import *
TAG = 'e2e'
errs = []
SK='learnscroll-study-v1'; TK='learnscroll-tutor-v1'
with sync_playwright() as p:
  b=p.chromium.launch()
  for W,H in [(1440,900),(1728,1117)]:
    ctx=b.new_context(viewport={'width':W,'height':H}, accept_downloads=True); pg=ctx.new_page()
    pg.on('console', lambda m: m.type=='error' and errs.append(m.text)); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE+'/#/'); pg.evaluate("localStorage.clear()")
    st=lambda: pg.evaluate(f"JSON.parse(localStorage['{SK}']||'{{}}')")
    # tutor style row
    pg.goto(BASE+'/#/read/heat-mass-transfer/1/13'); pg.reload(); pg.wait_for_timeout(1500); pg.click('#tutorBtn'); pg.wait_for_timeout(600)
    g=pg.evaluate("(()=>{const e=document.querySelector('.t-style');const bs=[...e.querySelectorAll('button')];return {h:e.getBoundingClientRect().height,sw:e.scrollWidth,cw:e.clientWidth,labels:bs.map(x=>x.textContent),tops:[...new Set(bs.map(x=>Math.round(x.getBoundingClientRect().top)))].length,fs:getComputedStyle(bs[0]).fontSize}})()")
    ok(g['labels']==['Default','Simple','Math walkthrough','Example'] and g['tops']==1 and g['sw']<=g['cw'], f'{W} style row one line, no scroll {g}')
    ok(pg.locator('.t-suggest').count()==0 and 'e.g.' in pg.get_attribute('#t-input','placeholder'), 'no suggestions, descriptive placeholder')
    pg.click('[data-style="simple"]'); pg.screenshot(path=f'{OUT}/{TAG}-{W}-tutor-style-row.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    # make some study data through the UI
    pg.keyboard.press('b'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(500); pg.keyboard.press('d')
    pg.click('.mark[data-mark="n"][data-id="c1-13"]'); pg.keyboard.type('Fourier: heat flows down the gradient'); pg.wait_for_timeout(900); pg.keyboard.press('Escape')
    pg.goto(BASE+'/#/review/heat-mass-transfer/both'); pg.wait_for_timeout(500); pg.keyboard.press('Space'); pg.keyboard.press('1'); pg.wait_for_timeout(200)
    orig=st(); otut=pg.evaluate(f"JSON.parse(localStorage['{TK}']||'{{}}')")
    pg.goto(BASE+'/#/'); pg.wait_for_timeout(600)
    pg.locator('.lib-foot').scroll_into_view_if_needed(); pg.screenshot(path=f'{OUT}/{TAG}-{W}-library-footer.png')
    pg.check('#exp-conv')
    with pg.expect_download() as dl: pg.click('#exp')
    path=tempfile.gettempdir()+f'/exp-{TAG}-{W}.json'; dl.value.save_as(path); d=json.load(open(path))
    ok(d['app']=='learnscroll' and d['version']==4 and 'exportedAt' in d and d['tutor']['prefs'].get('style')=='simple' and 'conversations' in d['tutor'], 'export file versioned, has prefs+conversations '+dl.value.suggested_filename)
    ok(d['study']['books']['heat-mass-transfer']['notes']['c1-13']['text'].startswith('Fourier'), 'export has note')
    # clear + import (round-trip)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(600)
    pg.set_input_files('#imp-file', path); pg.wait_for_timeout(600)
    ok('#/import' in pg.url and 'In the file' in pg.inner_text('main'), 'confirmation screen'); pg.screenshot(path=f'{OUT}/{TAG}-{W}-import-confirm.png', full_page=True)
    ok(pg.evaluate(f"localStorage['{SK}']") is None, 'nothing applied before confirm')
    pg.click('#imp-merge'); pg.wait_for_timeout(600)
    ok(st()['books']['heat-mass-transfer']['marks']==orig['books']['heat-mass-transfer']['marks'] and st()['books']['heat-mass-transfer']['notes']==orig['books']['heat-mass-transfer']['notes'] and st()['books']['heat-mass-transfer']['review']==orig['books']['heat-mass-transfer']['review'], 'round-trip restores marks/notes/reviews')
    ok(pg.evaluate(f"JSON.parse(localStorage['{TK}'])._prefs.style")=='simple', 'style restored')
    ok(pg.locator('#continue').count()==1 and 'Merged' in pg.inner_text('.notice.ok'), 'resume + success message'); pg.screenshot(path=f'{OUT}/{TAG}-{W}-after-roundtrip.png')
    # merge with conflicts
    m=json.loads(json.dumps(d)); hb=m['study']['books']['heat-mass-transfer']
    hb['notes']['c1-13']={'text':'NEWER note from file','at':int(time.time()*1000)+100000}; hb['notes']['c1-3']={'text':'file-only note','at':1761500000000}
    hb['marks']['c1-5']={'b':True,'d':False}; hb['seen']['1']=25
    pg.evaluate("""()=>{const s=JSON.parse(localStorage['learnscroll-study-v1']);const h=s.books['heat-mass-transfer'];h.notes['c1-9']={text:'local-only note',at:Date.now()};h.marks['c1-7']={b:false,d:true};localStorage['learnscroll-study-v1']=JSON.stringify(s)}""")
    mp=tempfile.gettempdir()+f'/merge-{TAG}-{W}.json'; json.dump(m,open(mp,'w')); pg.reload(); pg.wait_for_timeout(500)
    pg.set_input_files('#imp-file', mp); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/{TAG}-{W}-merge-confirm.png', full_page=True); pg.click('#imp-merge'); pg.wait_for_timeout(500)
    h=st()['books']['heat-mass-transfer']
    ok(h['notes']['c1-13']['text']=='NEWER note from file' and 'c1-3' in h['notes'] and 'c1-9' in h['notes'] and h['marks']['c1-5']['b'] and h['marks']['c1-7']['d'] and h['seen']['1']==25, 'merge: union, newer wins, max progress')
    # overwrite with backup
    pg.evaluate("""()=>{const t=JSON.parse(localStorage['learnscroll-tutor-v1']||'{}');t['heat-mass-transfer']={conversationId:'ctest1',messages:[{role:'user',content:'test q',at:Date.now()}],draft:'',scope:'card'};localStorage['learnscroll-tutor-v1']=JSON.stringify(t)}""")
    o={'app':'learnscroll','version':1,'exportedAt':'2026-10-27T00:00:00.000Z','study':{'books':{'koretsky-thermo':{'chapter':1,'card':2,'marks':{'c1-1':{'b':True}}}},'last':'koretsky-thermo','recent':[{'book':'koretsky-thermo','chapter':1,'card':2,'at':1761500000000}]},'tutor':{'prefs':{'style':'example'}}}
    op=tempfile.gettempdir()+f'/over-{TAG}-{W}.json'; json.dump(o,open(op,'w')); pg.set_input_files('#imp-file', op); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/{TAG}-{W}-overwrite-confirm.png', full_page=True)
    with pg.expect_download() as bk: pg.click('#imp-over')
    pg.wait_for_timeout(600); bkd=json.load(open(bk.value.path()))
    s=st(); ok(list(s['books'].keys())==['koretsky-thermo'] and 'backup' in bk.value.suggested_filename and 'heat-mass-transfer' in bkd['study']['books'], 'overwrite applied after backup '+bk.value.suggested_filename)
    ok(bool(pg.evaluate(f"JSON.parse(localStorage['{TK}'])['heat-mass-transfer']")) , 'local conversations kept (file had none)')
    pg.screenshot(path=f'{OUT}/{TAG}-{W}-after-overwrite.png')
    # malformed
    before=pg.evaluate(f"localStorage['{SK}']"); bt=pg.evaluate(f"localStorage['{TK}']")
    for i,(txt) in enumerate(['{"app":"learnscroll","version":1,', json.dumps({**o,'version':99}), json.dumps({**o,'study':{'books':{'koretsky-thermo':{'notes':{'c1-1':{'text':5,'at':1}}}}}})]):
      bp=tempfile.gettempdir()+f'/bad{i}.json'; open(bp,'w').write(txt); pg.goto(BASE+'/#/'); pg.wait_for_timeout(300); pg.set_input_files('#imp-file', bp); pg.wait_for_timeout(400)
      msg=pg.inner_text('.imp-err') if pg.locator('.imp-err').count() else ''
      ok('can’t be imported' in msg and pg.evaluate(f"localStorage['{SK}']")==before and pg.evaluate(f"localStorage['{TK}']")==bt, f'malformed {i} rejected: '+msg.split('\n')[1] if msg else 'malformed missing')
      if i==0: pg.screenshot(path=f'{OUT}/{TAG}-{W}-malformed.png')
      if i==1: pg.screenshot(path=f'{OUT}/{TAG}-{W}-wrong-version.png')
    ctx.close()
  b.close()
finish(errs)
