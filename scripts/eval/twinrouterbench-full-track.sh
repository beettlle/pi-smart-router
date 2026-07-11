#!/usr/bin/env bash
# TwinRouterBench full static-track path (SP-200 / #107).
#
# Pin fetch → convert without --limit → harness + release-gates --report-only.
# Writes under a gitignored local cache (default: .pi-smart-router/eval-cache/twinrouterbench).
# Do NOT check the full ~970-row JSON into git. PR CI stays on the vendored ≤150 subset.
#
# Usage:
#   npm run routing:twinrouterbench:full-track
#   bash scripts/eval/twinrouterbench-full-track.sh [--skip-fetch] [--cache-dir DIR]
#
# Env:
#   TRB_CACHE_DIR   Override cache directory (nightly may set to $RUNNER_TEMP/...)
#   TRB_PIN_COMMIT  Override pinned commit (default matches PROVENANCE.md)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PIN_COMMIT="${TRB_PIN_COMMIT:-430acecac71141de77afd8e5e13690d236d58e93}"
EXPECTED_SHA256="5b4f90c24643b214a9b0f26bf4e05afc742554262f4ef405e0b3b4a4cce503f4"
CACHE_DIR="${TRB_CACHE_DIR:-$ROOT/.pi-smart-router/eval-cache/twinrouterbench}"
SKIP_FETCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-fetch) SKIP_FETCH=1; shift ;;
    --cache-dir)
      CACHE_DIR="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$CACHE_DIR"
QUESTION_BANK="$CACHE_DIR/question_bank.jsonl"
FULL_TRACK="$CACHE_DIR/full-static-track.json"
FULL_TRACK_DIR="$CACHE_DIR/full-track"

if [[ "$SKIP_FETCH" -eq 0 ]]; then
  echo "Fetching TwinRouterBench pin ${PIN_COMMIT} → ${QUESTION_BANK}"
  curl -fsSL \
    "https://raw.githubusercontent.com/CommonstackAI/TwinRouterBench/${PIN_COMMIT}/data/static/question_bank.jsonl" \
    -o "$QUESTION_BANK"
else
  if [[ ! -f "$QUESTION_BANK" ]]; then
    echo "Missing ${QUESTION_BANK}; omit --skip-fetch or place the pin file there." >&2
    exit 1
  fi
fi

ACTUAL_SHA256="$(shasum -a 256 "$QUESTION_BANK" | awk '{print $1}')"
if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  echo "Upstream SHA-256 mismatch for pin ${PIN_COMMIT}:" >&2
  echo "  expected: ${EXPECTED_SHA256}" >&2
  echo "  actual:   ${ACTUAL_SHA256}" >&2
  exit 1
fi

echo "Converting full static track (no --limit) → ${FULL_TRACK}"
npm run routing:ingest-twinrouterbench -- \
  --input "$QUESTION_BANK" \
  --output "$FULL_TRACK"

# Harness expects a fixtures directory (loads *.json recursively).
rm -rf "$FULL_TRACK_DIR"
mkdir -p "$FULL_TRACK_DIR"
cp "$FULL_TRACK" "$FULL_TRACK_DIR/full-static-track.json"

echo "Harness summary-only on full track…"
npm run routing:eval-harness -- --fixtures "$FULL_TRACK_DIR" --summary-only

echo "Release-gates report-only on full track (does not gate PR/release)…"
npx tsx scripts/eval/assert-release-gates.ts --fixtures "$FULL_TRACK_DIR" --report-only

echo "Full-track path complete. Artifacts under ${CACHE_DIR} (gitignored — do not commit)."
