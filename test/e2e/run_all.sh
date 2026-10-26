#!/usr/bin/env bash
# Runs every browser check. Usage: test/e2e/run_all.sh [base-url] [screens-dir] [python]
# None of these make paid tutor calls (tutor POSTs are mocked or not sent).
set -u
BASE="${1:-http://localhost:8787}"; OUT="${2:-/tmp/learnscroll-e2e}"; PY="${3:-python3}"
cd "$(dirname "$0")"; fail=0
for t in search equations session session_picker session_time mistakes notes_markdown attention tutor_check keyboard phone contrast notes_review export_import reliability; do
  echo "== $t"; mkdir -p "$OUT/$t"
  "$PY" "$t.py" "$BASE" "$OUT/$t" > "$OUT/$t.log" 2>&1; rc=$?
  grep -v '^PASS' "$OUT/$t.log" | grep -E '^(FAIL|[0-9]+/[0-9]+ passed|Traceback)' ; [ $rc = 0 ] || { fail=1; echo "   exit $rc (see $OUT/$t.log)"; }
done
exit $fail
