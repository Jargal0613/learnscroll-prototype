from common import *
import json
# Longest equations in the data (by LaTeX length): heat-mass-transfer ch2 cards 7, 6, 8, 19; koretsky ch2 card 16.
LONG = [('heat-mass-transfer', 2, 7), ('heat-mass-transfer', 2, 6), ('heat-mass-transfer', 2, 8), ('heat-mass-transfer', 2, 19), ('koretsky-thermo', 2, 16)]
LONG_ANS = ("### Additional explanation\n**Equation**\n\\[ \\frac{\\partial}{\\partial x}\\left(k\\frac{\\partial T}{\\partial x}\\right)+\\frac{\\partial}{\\partial y}\\left(k\\frac{\\partial T}{\\partial y}\\right)+\\frac{\\partial}{\\partial z}\\left(k\\frac{\\partial T}{\\partial z}\\right)+\\dot e_{gen}=\\rho c\\frac{\\partial T}{\\partial t} + \\dot Q_{conv}=hA_s(T_s-T_\\infty)+\\varepsilon\\sigma A_s(T_s^4-T_{surr}^4) \\]\n"
            "Inline: \\( \\dot Q_{total} = kA\\frac{T_1-T_2}{L} + hA_s(T_s-T_\\infty) + \\varepsilon\\sigma A_s(T_s^4-T_{surr}^4) + \\dot m c_p (T_{out}-T_{in}) + \\dot W_{elec} \\) end.")
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        pg = b.new_page(viewport={'width': W, 'height': H}); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate("localStorage.clear()")
        for book, ch, n in LONG:
            for tutor in (False, True):
                pg.goto(f'{BASE}/#/read/{book}/{ch}/{n}'); pg.reload(); pg.wait_for_selector('.katex'); pg.wait_for_timeout(700)
                if tutor: pg.click('#tutorBtn'); pg.wait_for_timeout(400)
                r = pg.evaluate("""() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>{const r=x.getBoundingClientRect();return r.top>-50&&r.top<200});
                  const eq=c&&c.querySelector('.eq'); if(!eq) return null; const er=eq.getBoundingClientRect(), br=c.querySelector('.card-body').getBoundingClientRect();
                  return {page: document.documentElement.scrollWidth <= innerWidth, inside: er.right <= br.right + 1, scrolls: eq.scrollWidth > eq.clientWidth, sw: eq.scrollWidth, cw: eq.clientWidth} }""")
                ok(r and r['page'] and r['inside'], f'{W} {book} ch{ch} card{n} tutor={tutor}: no overflow {r}')
                if r and r['scrolls']:
                    pg.evaluate("() => { const e=[...document.querySelectorAll('.eq')].find(x=>x.scrollWidth>x.clientWidth); e.scrollLeft = 99999; }")
                    ok(True, '  long equation scrolls horizontally inside its block')
                if n == 7 and book == 'heat-mass-transfer': pg.screenshot(path=f'{OUT}/{W}-ch2-card7-tutor{int(tutor)}.png')
        conv = {'heat-mass-transfer': {'conversationId': 'ceqtest', 'messages': [{'role': 'user', 'content': 'long eq', 'at': 1}, {'role': 'assistant', 'content': LONG_ANS, 'sources': [], 'passages': [], 'retrieval': {}, 'at': 2}], 'draft': '', 'scope': 'card'}}
        pg.evaluate("c => localStorage.setItem('learnscroll-tutor-v1', JSON.stringify(c))", conv)
        pg.goto(BASE + '/#/read/heat-mass-transfer/2/7'); pg.reload(); pg.wait_for_timeout(1200); pg.click('#tutorBtn'); pg.wait_for_timeout(800)
        r = pg.evaluate("() => { const l=document.getElementById('t-log'); const d=l.querySelector('.katex-display'); return {log: l.scrollWidth <= l.clientWidth + 1, disp: d && d.scrollWidth > d.clientWidth, page: document.documentElement.scrollWidth <= innerWidth} }")
        ok(r['log'] and r['page'], f'{W} tutor panel: long display/inline math does not widen panel {r}')
        ok(r['disp'], '  long display equation scrolls inside the tutor answer')
        pg.screenshot(path=f'{OUT}/{W}-tutor-long-equation.png')
        pg.close()
    b.close(); finish(errs)
