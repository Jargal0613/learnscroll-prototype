"""Calculation workspace: curated Heat & Mass Transfer calculators reached from the reader and the formula notebook;
solve for any variable with units and substitution steps; clear messages for missing input, bad numbers,
division by zero and out-of-range values (never NaN); works offline; results go onto a study sheet and into the export."""
from common import *
import json
B = 'heat-mass-transfer'; SK = 'learnscroll-study-v1'
def calc(pg, vals, solve=None, out=None):
    if solve: pg.check(f'input[name="c-solve"][value="{solve}"]'); pg.wait_for_timeout(50)
    for n, (v, u) in vals.items():
        pg.fill(f'#c-v-{n}', v)
        if u and pg.locator(f'select#c-u-{n}').count(): pg.select_option(f'#c-u-{n}', u)
    if out and pg.locator('select#c-out').count(): pg.select_option('#c-out', out)
    pg.click('#c-go'); pg.wait_for_timeout(80)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES + [(390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = ctx.new_page(); watch(pg, errs)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_selector('#q')
        # reader: card with Newton's law of cooling has a Calculate link next to Save formula
        pg.goto(BASE + f'/#/read/{B}/1/17'); pg.wait_for_timeout(600)
        link = pg.locator('.card').nth(16).locator('.eq-act a.c-calc')
        ok(link.count() == 1 and link.inner_text() == 'Calculate', f'{W}: reader card has a Calculate link')
        ok(pg.locator('.card').nth(0).locator('.c-calc').count() == 0, f'{W}: cards without a curated calculator have none')
        link.click(); pg.wait_for_selector('#c-form')
        ok(pg.evaluate('location.hash') == '#/calc/convection', f'{W}: opens the convection calculator')
        ok('Eq. (1–24)' in pg.inner_text('.meta-line') and pg.locator('.c-eq .katex').count() == 1, f'{W}: equation number and KaTeX formula shown')
        # solve for h with °C inputs
        calc(pg, {'Q': ('1200', 'W'), 'A': ('2', 'm²'), 'Ts': ('80', '°C'), 'Tinf': ('20', '°C')}, solve='h')
        ans = pg.inner_text('.c-ans')
        ok('10 W/m²·K' in ans, f'{W}: h = 10 W/m²·K ({ans})')
        steps = pg.inner_text('.c-steps')
        ok('Rearrange' in steps and 'Convert to SI' in steps and '80 °C = 353.15 K' in steps and 'Substitute' in steps and pg.locator('.c-steps .katex').count() >= 3, f'{W}: steps: rearrange, conversions, substitution (KaTeX)')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-result.png', full_page=True)
        # solve for Ts, show in °C
        calc(pg, {'Q': ('1.2', 'kW'), 'h': ('10', None), 'A': ('2', 'm²'), 'Tinf': ('20', '°C')}, solve='Ts', out='°C')
        ok('80 °C' in pg.inner_text('.c-ans') and '353.1 K' in pg.inner_text('.c-ans'), f'{W}: Ts in °C with SI shown too ({pg.inner_text(".c-ans")})')
        # errors: missing, not a number, division by zero
        pg.fill('#c-v-A', ''); pg.click('#c-go'); pg.wait_for_timeout(80)
        ok('Enter surface area' in pg.inner_text('#c-msg') and pg.evaluate('document.activeElement.id') == 'c-v-A' and pg.get_attribute('#c-v-A', 'aria-invalid') == 'true', f'{W}: missing input named and focused')
        pg.fill('#c-v-A', '2,5'); pg.click('#c-go'); pg.wait_for_timeout(80)
        ok('isn’t a number' in pg.inner_text('#c-msg'), f'{W}: bad number explained')
        calc(pg, {'Q': ('1200', 'W'), 'A': ('2', 'm²'), 'Ts': ('20', '°C'), 'Tinf': ('20', '°C')}, solve='h')
        ok('no temperature difference' in pg.inner_text('#c-msg') and pg.locator('#c-result').count() == 0, f'{W}: division by zero explained, no result')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-error.png')
        # range: emissivity > 1
        pg.goto(BASE + '/#/calc/emission'); pg.wait_for_selector('#c-form')
        calc(pg, {'eps': ('1.3', None), 'A': ('1', 'm²'), 'Ts': ('300', 'K')}, solve='Q')
        ok('between 0 and 1' in pg.inner_text('#c-msg'), f'{W}: emissivity range enforced')
        calc(pg, {'Q': ('1000', 'W'), 'A': ('1', 'm²'), 'Ts': ('300', 'K')}, solve='eps')
        ok('not physical' in pg.inner_text('#c-msg'), f'{W}: unphysical result (ε > 1) refused')
        ok('NaN' not in pg.inner_text('main') and 'Infinity' not in pg.inner_text('main'), f'{W}: never NaN/Infinity on the page')
        # offline: page already loaded, calculations still work
        ctx.set_offline(True)
        pg.goto(BASE + '/#/calc/cylinder'); pg.wait_for_selector('#c-form')
        calc(pg, {'L': ('1', 'm'), 'k': ('15', None), 'T1': ('120', '°C'), 'T2': ('100', '°C'), 'r1': ('5', 'cm'), 'r2': ('6', 'cm')}, solve='Q', out='kW')
        ok('10.34 kW' in pg.inner_text('.c-ans'), f'{W}: offline: cylinder Q = 10.34 kW ({pg.inner_text(".c-ans")})')
        ctx.set_offline(False)
        # add to a new study sheet
        pg.click('#c-addbtn'); pg.wait_for_selector('#c-addmsg a')
        st = pg.evaluate(f"JSON.parse(localStorage['{SK}'])"); sh = list(st['sheets'].values())
        it = sh[0]['items'][0] if sh else {}
        ok(len(sh) == 1 and it.get('t') == 'calc' and it.get('calc') == 'cylinder' and it.get('solve') == 'Q' and it['inputs']['r1'] == [5, 'cm'] and abs(it['result'][0] - 10.3387) < 1e-3 and it['result'][1] == 'kW', f'{W}: calculation saved on a sheet ({it})')
        pg.click('#c-addmsg a'); pg.wait_for_selector('#sheet')
        art = pg.locator('#sheet .sh-item.k-calc')
        ok(art.count() == 1 and 'calculation' in art.inner_text().lower() and 'result' in art.inner_text().lower() and '10.3386' in art.inner_text() and art.locator('.katex').count() >= 3, f'{W}: sheet shows the calculation with inputs and result ({art.locator(".sh-calc-r").inner_text()!r} katex={art.locator(".katex").count()})')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-sheet.png', full_page=True)
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#exp')
        with pg.expect_download() as d: pg.click('#exp')
        ex = json.load(open(d.value.path()))
        ok(ex['version'] >= 4 and any(i.get('t') == 'calc' for s in ex['study']['sheets'].values() for i in s['items']), f'{W}: calculation exported (format 4)')
        # notebook: a saved card formula with three calculators (c2-19) lists all three; workspace link
        pg.goto(BASE + f'/#/read/{B}/2/19'); pg.wait_for_timeout(600); pg.locator('.card').nth(18).locator('.f-save').click(); pg.wait_for_timeout(100)
        pg.goto(BASE + '/#/formulas'); pg.wait_for_selector('.f-list')
        ok(pg.locator('.f-item .f-calc a').count() == 3 and pg.locator('a.c-ws').count() == 1, f'{W}: notebook shows 3 calculators for ΔTmax and the workspace link')
        pg.click('a.c-ws'); pg.wait_for_selector('.c-list')
        ok(pg.locator('.c-list > li').count() >= 10, f'{W}: workspace lists {pg.locator(".c-list > li").count()} curated calculators')
        sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); ok(sw[0] <= sw[1], f'{W}: no sideways scroll on the list {sw}')
        pg.goto(BASE + '/#/calc/net-radiation'); pg.wait_for_selector('#c-form'); sw = pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); ok(sw[0] <= sw[1], f'{W}: no sideways scroll on a calculator {sw}')
        if W != 1728: pg.screenshot(path=f'{OUT}/{W}-form.png', full_page=True)
        ctx.close()
    b.close(); finish([e for e in errs if 'ERR_INTERNET_DISCONNECTED' not in e])
