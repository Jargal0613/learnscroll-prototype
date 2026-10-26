"""Shared helpers for LearnScroll browser checks (Python Playwright; not an npm dependency).
Run:  python3 -m venv .venv && .venv/bin/pip install playwright && .venv/bin/playwright install chromium
      .venv/bin/python test/e2e/<script>.py <base-url> [screens-dir]"""
import sys, os
from playwright.sync_api import sync_playwright
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787').rstrip('/')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/learnscroll-e2e'
os.makedirs(OUT, exist_ok=True)
SIZES = [(1440, 900), (1728, 1117)]
results = []
def ok(cond, msg):
    results.append((bool(cond), msg)); print(('PASS ' if cond else 'FAIL ') + msg, flush=True)
def watch(pg, errs):
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.on('pageerror', lambda e: errs.append(str(e)))
def finish(errs):
    ok(not errs, 'no console errors' + (f': {errs[:3]}' if errs else ''))
    failed = [m for c, m in results if not c]
    print(f'{len(results) - len(failed)}/{len(results)} passed')
    sys.exit(1 if failed else 0)
