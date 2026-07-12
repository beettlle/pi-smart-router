#!/usr/bin/env bash
# Shadow dogfood offline companion for human QA.
# Prints the human checklist, runs hard fixture gates + TwinRouterBench soft-report,
# and archives outputs under .pi-smart-router/qa-runs/<timestamp>/.
#
# Resolves the package root from this script's path (cwd at invoke time does not matter).
#
# Exit codes:
#   0 — hard gates passed (corpus soft-report may still show FAIL metrics)
#   1 — missing tools / deps / package root / hard gates failed
#
# See docs/qa/shadow-dogfood-protocol.md

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]]; then
  echo "error: package root missing package.json (resolved ROOT=$ROOT)" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found on PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found on PATH" >&2
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "error: node_modules missing under $ROOT — run: npm install" >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${SMART_ROUTER_QA_OUT_DIR:-$ROOT/.pi-smart-router/qa-runs/$TIMESTAMP}"
mkdir -p "$OUT_DIR"

cat <<EOF
========================================================================
pi-smart-router — shadow dogfood offline companion
Package root (from script path): $ROOT
Full protocol: docs/qa/shadow-dogfood-protocol.md
========================================================================

HUMAN CHECKLIST (do in pi; this script does not drive live sessions)
  [ ] /model smart-router/auto
  [ ] SMART_ROUTER_DATASET=1 (optional SMART_ROUTER_LOG_ROUTING=1)
  [ ] Fleet: economical + frontier + at least one non-Google fallback
  [ ] Session matrix: trivial | tool loop | planning | pin continuity | hard | Gemini?
  [ ] /smart-router status + history after sessions
  [ ] Prefer passive labels; feedback good|bad only when clear
  [ ] export dataset + export telemetry-contrib; privacy check (no prompts)
  [ ] Fill sign-off form in docs/qa/shadow-dogfood-protocol.md

OFFLINE (this script; npm --prefix \$ROOT)
  1) npm run release:functional-smoke   — HARD; must pass
  2) npm run routing:assert-release-gates:corpus-report — SOFT; expect over-routing FAIL

EOF

echo "Archive directory: $OUT_DIR"
echo

HARD_LOG="$OUT_DIR/release-functional-smoke.log"
SOFT_LOG="$OUT_DIR/corpus-soft-report.log"
SUMMARY="$OUT_DIR/SUMMARY.txt"

echo "==> Running hard fixture gates: npm --prefix \"$ROOT\" run release:functional-smoke"
set +e
npm --prefix "$ROOT" run release:functional-smoke >"$HARD_LOG" 2>&1
HARD_EC=$?
set -e

if [[ "$HARD_EC" -ne 0 ]]; then
  echo "HARD GATES FAILED (exit $HARD_EC). See $HARD_LOG" >&2
  {
    echo "timestamp_utc=$TIMESTAMP"
    echo "package_root=$ROOT"
    echo "hard_gates=FAIL"
    echo "hard_exit_code=$HARD_EC"
    echo "soft_gates=NOT_RUN"
    echo "protocol=docs/qa/shadow-dogfood-protocol.md"
  } >"$SUMMARY"
  exit 1
fi

echo "Hard gates: PASS (log: $HARD_LOG)"
echo

echo "==> Running TwinRouterBench soft-feed: npm --prefix \"$ROOT\" run routing:assert-release-gates:corpus-report"
echo "    (report-only; soft FAIL on over-routing is expected and does not fail this script)"
set +e
npm --prefix "$ROOT" run routing:assert-release-gates:corpus-report >"$SOFT_LOG" 2>&1
SOFT_EC=$?
set -e

# Corpus report is --report-only and should exit 0; still archive whatever happened.
if [[ "$SOFT_EC" -ne 0 ]]; then
  echo "warning: corpus soft-report exited $SOFT_EC (unexpected for --report-only). See $SOFT_LOG" >&2
fi

echo "Soft report archived: $SOFT_LOG"
echo

{
  echo "timestamp_utc=$TIMESTAMP"
  echo "package_root=$ROOT"
  echo "hard_gates=PASS"
  echo "hard_exit_code=0"
  echo "soft_report_exit_code=$SOFT_EC"
  echo "hard_log=$HARD_LOG"
  echo "soft_log=$SOFT_LOG"
  echo "protocol=docs/qa/shadow-dogfood-protocol.md"
  echo "note=TwinRouterBench soft over-routing FAIL is expected; do not edit release-gates.json without approval"
} >"$SUMMARY"

echo "========================================================================"
echo "Offline companion complete."
echo "Summary: $SUMMARY"
echo "Next: complete human matrix + sign-off in docs/qa/shadow-dogfood-protocol.md"
echo "========================================================================"
exit 0
