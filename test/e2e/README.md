# Browser checks (optional)

Python Playwright scripts; not an npm dependency and not part of `npm test`.

    python3 -m venv .venv && .venv/bin/pip install playwright && .venv/bin/playwright install chromium
    node scripts/dev-server.js 8787 &
    test/e2e/run_all.sh http://localhost:8787 /tmp/learnscroll-e2e .venv/bin/python

Each script runs at 1440x900 and 1728x1117 and exits non-zero on any failure. None of them make paid
tutor calls: `reliability.py` mocks every tutor POST (500, non-JSON 502, offline, timeout).
`notes_review.py` sends only a GET status request.
