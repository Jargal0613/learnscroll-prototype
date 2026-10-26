"""Session time: remaining time from Date.now() (reload, reopen), active time only while visible,
background tab excluded, expiry while closed -> completed with summary on return. Uses Playwright's fake clock."""
from common import *
import datetime
XK, SK = 'learnscroll-session-v1', 'learnscroll-study-v1'
T0 = datetime.datetime(2026, 10, 27, 9, 0, 0, tzinfo=datetime.timezone.utc)
def secs(t):  # '8:30 left' -> 510
    m, s_ = t.split(' ')[0].split(':'); return int(m) * 60 + int(s_)
def near(t, want, tol=3): return abs(secs(t) - want) <= tol  # real page-load time leaks into the fake clock a little
def sess(pg): return pg.evaluate(f"JSON.parse(localStorage['{XK}'] || 'null')")
def hide(pg, hidden):
    pg.evaluate("""h => { Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
                         Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }""", hidden)
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for W, H in SIZES:
        ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); watch(pg, errs)
        pg.clock.install(time=T0)
        pg.goto(BASE + '/#/'); pg.evaluate('localStorage.clear()'); pg.goto(BASE + '/#/session'); pg.wait_for_selector('#sessGo')
        pg.click('[data-book="heat-mass-transfer"]'); pg.click('[data-min="10"]'); pg.click('#sessGo'); pg.wait_for_selector('#left')
        ok(pg.inner_text('#left') == '10:00 left', f'{W} starts at 10:00 ({pg.inner_text("#left")})')
        pg.clock.run_for(60_000); pg.wait_for_timeout(100)
        ok(near(pg.inner_text('#left'), 540), f'after 1 min: {pg.inner_text("#left")}')
        # reload: remaining derived from start, not reset
        pg.clock.run_for(30_000); pg.reload(); pg.wait_for_selector('#left')
        ok(near(pg.inner_text('#left'), 510), f'reload keeps remaining time: {pg.inner_text("#left")}')
        # background tab: 2 min hidden do not count as active, but remaining time still runs
        pg.clock.run_for(30_000); hide(pg, True); pg.clock.run_for(120_000); hide(pg, False); pg.wait_for_timeout(50)
        ok(near(pg.inner_text('#left'), 360), f'background: remaining recomputed on visible ({pg.inner_text("#left")})')
        act = sess(pg)['active']; ok(115_000 <= act <= 125_000, f'background time excluded from active ({act/1000:.0f}s ~ 120s)')
        pg.screenshot(path=f'{OUT}/{W}-running.png')
        # reopen in a fresh tab (same browser): same remaining time
        pg.clock.run_for(60_000)
        pg2 = ctx.new_page(); watch(pg2, errs); pg2.goto(BASE + '/#/'); pg2.wait_for_selector('#sessResume'); pg2.click('#sessResume'); pg2.wait_for_selector('#left')
        ok(near(pg2.inner_text('#left'), 300, 5), f'reopen in new tab: {pg2.inner_text("#left")}')
        pg2.close()
        # close everything; expire while closed (1 h later)
        before = sess(pg)['active']
        pg.close()
        pg = ctx.new_page(); watch(pg, errs)
        pg.clock.install(time=T0 + datetime.timedelta(hours=1))
        pg.goto(BASE + '/#/'); pg.wait_for_selector('#q')
        ok(sess(pg) is None, 'expired session completed on return')
        n = pg.inner_text('.notice.ok') if pg.locator('.notice.ok').count() else ''
        ok('ended while you were away' in n, 'library tells you it ended while away')
        s = pg.evaluate(f"JSON.parse(localStorage['{SK}']).sessions[0]")
        ok(170 <= s['seconds'] <= 250, f'active time excludes closed hour and background ({s["seconds"]} s)')
        pg.screenshot(path=f'{OUT}/{W}-expired-away-library.png')
        # expiry while closed, returning straight to the session URL -> summary
        pg.goto(BASE + '/#/session'); pg.wait_for_selector('#sessGo'); pg.click('#sessGo'); pg.wait_for_selector('#left')
        pg.clock.run_for(20_000); pg.close()
        pg = ctx.new_page(); watch(pg, errs); pg.clock.install(time=T0 + datetime.timedelta(hours=3))
        pg.goto(BASE + '/#/session/run'); pg.wait_for_selector('#sessSum')
        t = pg.inner_text('#sessSum')
        ok('ran out while the page was closed' in t and 'Active study time' in t, 'summary on return to session URL')
        pg.screenshot(path=f'{OUT}/{W}-expired-away-summary.png')
        ctx.close()
    b.close(); finish(errs)
