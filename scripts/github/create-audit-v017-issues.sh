#!/usr/bin/env bash
# Create 0.17 audit backlog issues from spine-tasks/_authoring/issues/audit-v017/.
# Idempotency: aborts if manifest exists or if any batch title already exists.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

DRAFT_DIR="$REPO_ROOT/spine-tasks/_authoring/issues/audit-v017"
MANIFEST="$REPO_ROOT/scripts/github/audit-v017-issues-created.txt"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI required" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh not authenticated — run: gh auth login" >&2
  exit 1
fi

if [[ -f "$MANIFEST" ]]; then
  echo "error: manifest already exists ($MANIFEST); aborting to avoid duplicates." >&2
  exit 1
fi

title_exists() {
  local title="$1"
  local count
  count="$(gh issue list --state all --search "in:title \"${title}\"" --json number --jq 'length' 2>/dev/null || echo 0)"
  [[ "$count" != "0" ]]
}

create_issue() {
  local key="$1"
  local title="$2"
  local priority_label="$3"
  local type_label="$4"
  local body_file="$5"

  if title_exists "$title"; then
    echo "error: issue already exists with title: $title" >&2
    exit 1
  fi

  if [[ ! -f "$body_file" ]]; then
    echo "error: missing body file: $body_file" >&2
    exit 1
  fi

  local url num
  url="$(gh issue create \
    --title "$title" \
    --label "$priority_label" \
    --label "$type_label" \
    --body-file "$body_file")"
  num="$(echo "$url" | grep -oE '[0-9]+$')"
  echo "Created #${num}: ${title}" >&2
  echo "${key}=${num}"
}

echo "Creating 0.17 audit backlog (21 issues)..."

ISSUE_A1="$(create_issue A1 \
  "routing: P0 — CI quality gates on src and extension changes" \
  "priority/P0" "enhancement" \
  "$DRAFT_DIR/A1-ci-quality-gates.md")"

ISSUE_A2="$(create_issue A2 \
  "routing: P0 — sync RoutingDecision/RoutingRequest contracts with live pipeline" \
  "priority/P0" "enhancement" \
  "$DRAFT_DIR/A2-sync-contracts.md")"

ISSUE_A3="$(create_issue A3 \
  "[bug] Finish SP-222 producer: map Pi status and tool metadata in mapContextMessages (follow-on #132)" \
  "priority/P0" "bug" \
  "$DRAFT_DIR/A3-sp222-producer.md")"

ISSUE_A4="$(create_issue A4 \
  "[bug] Gate expected-cost explain logging behind SMART_ROUTER_LOG_ROUTING" \
  "priority/P0" "bug" \
  "$DRAFT_DIR/A4-expected-cost-log-gate.md")"

ISSUE_A5="$(create_issue A5 \
  "[bug] Stabilize SC-004 triage p95 latency test under parallel Vitest" \
  "priority/P0" "bug" \
  "$DRAFT_DIR/A5-flaky-sc004-test.md")"

ISSUE_A6="$(create_issue A6 \
  "[bug] route-and-delegate fail-open when delegation fleet exhausted" \
  "priority/P0" "bug" \
  "$DRAFT_DIR/A6-route-delegate-fail-open.md")"

ISSUE_A7="$(create_issue A7 \
  "routing: P0 — validate RouterPipeline concurrent route() safety" \
  "priority/P0" "enhancement" \
  "$DRAFT_DIR/A7-concurrent-route-safety.md")"

ISSUE_A8="$(create_issue A8 \
  "routing: P0 — mitigate SQLite sync blocking on routing hot path" \
  "priority/P0" "enhancement" \
  "$DRAFT_DIR/A8-sqlite-blocking.md")"

ISSUE_B1="$(create_issue B1 \
  "routing: P1 — split RouterPipeline; invert domain→infra via ports" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B1-split-router-pipeline.md")"

ISSUE_B2="$(create_issue B2 \
  "routing: P1 — extension coverage gate in Vitest" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B2-extension-coverage.md")"

ISSUE_B3="$(create_issue B3 \
  "routing: P1 — session teardown evicts in-memory routing state" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B3-session-teardown.md")"

ISSUE_B4="$(create_issue B4 \
  "routing: P1 — HMAC-pepper community telemetry session hashes" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B4-telemetry-hmac.md")"

ISSUE_B5="$(create_issue B5 \
  "routing: P1 — ONNX artifact pinning and embedder lifecycle" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B5-onnx-pinning.md")"

ISSUE_B6="$(create_issue B6 \
  "routing: P1 — explicit degraded mode when HyDRA/K4 weights missing" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B6-degraded-hydra-mode.md")"

ISSUE_B7="$(create_issue B7 \
  "routing: P1 — extension public facade (replace 70+ deep src imports)" \
  "priority/P1" "enhancement" \
  "$DRAFT_DIR/B7-extension-facade.md")"

ISSUE_C1="$(create_issue C1 \
  "routing: P2 — remove or CI-guard committed scripts/src build artifacts" \
  "priority/P2" "enhancement" \
  "$DRAFT_DIR/C1-scripts-artifacts.md")"

ISSUE_C2="$(create_issue C2 \
  "routing: P2 — hardware probe SystemInfoPort unit tests (Linux/Windows/macOS)" \
  "priority/P2" "enhancement" \
  "$DRAFT_DIR/C2-hardware-probe-tests.md")"

ISSUE_C3="$(create_issue C3 \
  "docs: P2 — reconcile operator config and docs with 0.16.2 runtime" \
  "priority/P2" "documentation" \
  "$DRAFT_DIR/C3-docs-reconcile.md")"

ISSUE_C4="$(create_issue C4 \
  "routing: P2 — document library vs extension feature parity gap" \
  "priority/P2" "documentation" \
  "$DRAFT_DIR/C4-extension-parity-docs.md")"

ISSUE_C5="$(create_issue C5 \
  "routing: P2 — align Node engine requirements (EBADENGINE)" \
  "priority/P2" "enhancement" \
  "$DRAFT_DIR/C5-node-engine.md")"

ISSUE_C6="$(create_issue C6 \
  "routing: P2 — fragment router-pipeline.test.ts by stage" \
  "priority/P2" "enhancement" \
  "$DRAFT_DIR/C6-fragment-pipeline-tests.md")"

ISSUE_D1="$(create_issue D1 \
  "chore: P3 — spine STATUS.md and .DONE marker hygiene" \
  "priority/P3" "enhancement" \
  "$DRAFT_DIR/D1-spine-hygiene.md")"

ISSUE_D2="$(create_issue D2 \
  "chore: P3 — modernize ESLint to flat config (v9+)" \
  "priority/P3" "enhancement" \
  "$DRAFT_DIR/D2-eslint-flat-config.md")"

{
  echo "# Created $(date -u +%Y-%m-%dT%H:%M:%SZ) — 0.17 audit backlog"
  echo "$ISSUE_A1"
  echo "$ISSUE_A2"
  echo "$ISSUE_A3"
  echo "$ISSUE_A4"
  echo "$ISSUE_A5"
  echo "$ISSUE_A6"
  echo "$ISSUE_A7"
  echo "$ISSUE_A8"
  echo "$ISSUE_B1"
  echo "$ISSUE_B2"
  echo "$ISSUE_B3"
  echo "$ISSUE_B4"
  echo "$ISSUE_B5"
  echo "$ISSUE_B6"
  echo "$ISSUE_B7"
  echo "$ISSUE_C1"
  echo "$ISSUE_C2"
  echo "$ISSUE_C3"
  echo "$ISSUE_C4"
  echo "$ISSUE_C5"
  echo "$ISSUE_C6"
  echo "$ISSUE_D1"
  echo "$ISSUE_D2"
} > "$MANIFEST"

echo ""
echo "=== Created 21 issues ==="
cat "$MANIFEST"
echo ""
echo "Manifest: $MANIFEST"
echo "Next: annotate open issues, cross-link comments, update docs/routing-roadmap.md"
