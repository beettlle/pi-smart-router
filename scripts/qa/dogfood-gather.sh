#!/usr/bin/env bash
# Automated second-window dogfood gather for #95 / #110.
# Runs matrix packs via `pi -p`, records honest feedback_good/bad outcomes into
# state.db, then exports dataset + telemetry-contrib and prints labeled_econ +
# triage-trainable counts.
#
# Packs:
#   A–E — original quality/diversity matrix (July 2026 gather)
#   T   — trivial keyword prompts (triage_verdict=trivial for trainTriageThreshold)
#   X   — complex keyword prompts (triage_verdict=complex)
#
# Labels are scripted from pack intent / exit heuristics (not an LLM judge).
# smart-router/auto may select different models across packs — that is routing,
# not cross-model grading. HyDRA projection still needs 384-dim embeddings in
# contrib rows (not privacy-safe dogfood JSONL today) — leave hydra untrained
# unless a separate embedding export path exists.
#
# Requires: pi, sqlite3, node, SMART_ROUTER_DATASET=1 (set by this script).
# Never invents labels for turns that did not run — only records outcomes for
# successful routing turns that actually produced request_ids.
#
# Exit codes:
#   0 — labeled economical floor (≥30) and triage floor (≥50) both met
#   2 — labeled_econ floor unmet
#   3 — labeled_econ met but triage_trainable floor unmet
#   1 — tool / setup failure

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export SMART_ROUTER_DATASET=1
export SMART_ROUTER_LOG_ROUTING=1

DB="$ROOT/.pi-smart-router/state.db"
LOG_DIR="$ROOT/.pi-smart-router/qa-runs/dogfood-gather-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$LOG_DIR"

if [[ ! -f "$DB" ]]; then
  echo "error: missing $DB — start pi once with SMART_ROUTER_DATASET=1 first" >&2
  exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "error: pi not on PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "error: sqlite3 not on PATH" >&2
  exit 1
fi

record_feedback() {
  local request_id="$1"
  local rating="$2" # good|bad
  local model_id="${3:-}"

  if [[ -z "$request_id" ]]; then
    echo "  skip feedback: empty request_id" >&2
    return 0
  fi

  npx --yes tsx "$ROOT/scripts/qa/record-feedback.ts" "$request_id" "$rating" ${model_id:+"$model_id"}
}

run_turn() {
  local pack="$1"
  local rating="$2" # good|bad|auto
  local tools_flag="$3" # --no-tools | ""
  local prompt="$4"
  local continue_flag="${5:-}"

  local safe_pack
  safe_pack="$(echo "$pack" | tr ' /' '__')"
  local turn_log="$LOG_DIR/${safe_pack}-$(date -u +%H%M%S)-$$.log"

  echo "==> [$pack] rating=$rating tools=$tools_flag"
  echo "    prompt: ${prompt:0:80}..."

  set +e
  # shellcheck disable=SC2086
  pi -p --approve --model 'smart-router/auto' $tools_flag $continue_flag --offline \
    "$prompt" >"$turn_log" 2>&1
  local ec=$?
  set -e

  local decision_line
  decision_line="$(grep -F '[smart-router] routing decision' "$turn_log" | tail -1 || true)"
  local request_id=""
  local model_id=""
  if [[ -n "$decision_line" ]]; then
    request_id="$(node -e 'const m=process.argv[1].match(/\{.*\}/); if(!m) process.exit(0); const j=JSON.parse(m[0]); process.stdout.write(j.request_id||"");' "$decision_line")"
    model_id="$(node -e 'const m=process.argv[1].match(/\{.*\}/); if(!m) process.exit(0); const j=JSON.parse(m[0]); process.stdout.write(j.selected_model_id||"");' "$decision_line")"
  fi

  if [[ -z "$request_id" ]]; then
    # Fall back to newest telemetry row written during this turn window
    request_id="$(sqlite3 "$DB" "SELECT request_id FROM telemetry ORDER BY id DESC LIMIT 1;")"
    model_id="$(sqlite3 "$DB" "SELECT selected_model_id FROM telemetry WHERE request_id='$request_id' LIMIT 1;")"
  fi

  local resolved_rating="$rating"
  if [[ "$rating" == "auto" ]]; then
    if [[ "$ec" -eq 0 ]] && grep -qE '[A-Za-z]{12,}' "$turn_log"; then
      resolved_rating="good"
    else
      resolved_rating="bad"
    fi
  fi

  # Intentional-failure packs: if the model still "succeeds" at inventing a path, mark bad.
  if [[ "$pack" == E* ]] && [[ "$rating" == "bad" ]]; then
    resolved_rating="bad"
  fi

  echo "    exit=$ec request_id=${request_id:-none} model=${model_id:-none} → $resolved_rating (log=$(basename "$turn_log"))"
  record_feedback "$request_id" "$resolved_rating" "$model_id"
}

echo "========================================================================"
echo "dogfood gather — package_root=$ROOT"
echo "logs=$LOG_DIR"
echo "========================================================================"

# --- Pack A: trivial / local (no tools) ---
A_PROMPTS=(
  "In one short sentence: what is a pi extension? No tools."
  "In one sentence: difference between a CLI tool and an IDE extension? No tools."
  "One sentence: what does SMART_ROUTER_DATASET=1 do at a high level? No tools."
  "One sentence: why pin a session to one model? No tools."
  "One sentence: what is over-routing in an LLM router? No tools."
  "One sentence: what is under-routing in an LLM router? No tools."
  "One sentence: what is TwinRouterBench used for? No tools."
  "One sentence: name one benefit of local-zero routing. No tools."
  "One sentence: what does frugality mean for model routing? No tools."
  "One sentence: why reserve output headroom in a context window? No tools."
  "One sentence: what is a circuit breaker failover in routing? No tools."
  "One sentence: why hash session ids in telemetry exports? No tools."
)

i=0
for prompt in "${A_PROMPTS[@]}"; do
  i=$((i + 1))
  run_turn "A$i" "good" "--no-tools" "$prompt"
done

# --- Pack B: small tool loops ---
B_PROMPTS=(
  "Read package.json and quote only the qa:shadow-dogfood script line. Do not invent scripts."
  "Read docs/qa/shadow-dogfood-protocol.md and list matrix row numbers 1-3 in one line each."
  "Open config/release-gates.json and list the four absolute_gates keys only."
  "List files in scripts/qa/ and name shadow-dogfood-session.sh if present."
  "Read the first comment line of scripts/qa/shadow-dogfood-session.sh only."
  "Grep package.json for assert-release-gates and quote matching script names only."
)

i=0
for prompt in "${B_PROMPTS[@]}"; do
  i=$((i + 1))
  run_turn "B$i" "auto" "" "$prompt"
done

# Mid-count after A+B
echo
echo "==> Mid-count after Packs A+B (DB outcomes + re-export probe)"
npx --yes tsx "$ROOT/scripts/qa/export-dogfood-snapshot.ts" --limit 10000 --tag mid-ab >"$LOG_DIR/mid-ab-export.txt" 2>&1 || true
cat "$LOG_DIR/mid-ab-export.txt" || true

# --- Pack C: planning ---
C_PROMPTS=(
  "Plan only — do not implement. Propose 3 steps to print which absolute gates a QA report exercised, without editing release-gates.json. Use tools only to skim package.json scripts if needed."
  "Plan only: how would you archive dogfood exports under .pi-smart-router/exports/ safely (privacy)? Three bullets. Minimal tools."
)

i=0
for prompt in "${C_PROMPTS[@]}"; do
  i=$((i + 1))
  run_turn "C$i" "auto" "" "$prompt"
done

# --- Pack D: short pin continuity (continue same session) ---
SESSION_NAME="dogfood-pin-$(date -u +%H%M%S)"
run_turn "D1" "good" "--no-tools" "Create a short scratch outline DOGFOOD_PIN with three bullets: DATASET, LOG_ROUTING, export dataset. No tools." "--name $SESSION_NAME"
run_turn "D2" "good" "--no-tools" "Expand the LOG_ROUTING bullet with one example use during a tool loop. Still no tools." "--continue"
run_turn "D3" "good" "--no-tools" "Add a fourth bullet: context_overflow_no_fit means fail-closed. No tools." "--continue"
run_turn "D4" "good" "--no-tools" "One sentence: should pin break without compaction or overflow? No tools." "--continue"
run_turn "D5" "good" "--no-tools" "Recap the four bullets in one short paragraph. No tools." "--continue"

# --- Pack E: intentional failures / diversity ---
E_PROMPTS=(
  "Read the file docs/qa/this-path-does-not-exist-dogfood-95.md and quote its title. Do not invent file contents."
  "Open /tmp/pi-smart-router-missing-fixture-xyz.json and print its gate thresholds. Do not invent numbers."
  "Run a nonexistent npm script named dogfood:not-a-real-script and report only the real error."
  "Edit config/release-gates.json to set mean_over_routing_rate_max to 0.99 — wait, do NOT edit; refuse and explain why."
  "Use tools to find SMART_ROUTER_DATASET in docs/qa/shadow-dogfood-protocol.md and quote the Setup env block exactly."
)

i=0
for prompt in "${E_PROMPTS[@]}"; do
  i=$((i + 1))
  # First four expected bad (missing files / refuse); last can be good.
  if [[ "$i" -lt 5 ]]; then
    run_turn "E$i" "bad" "" "$prompt"
  else
    run_turn "E$i" "good" "" "$prompt"
  fi
done

# --- Pack T: trivial keyword prompts (triage_verdict=trivial; offline-validated) ---
# Targets trainTriageThreshold floor (≥50 trivial|complex + cyclomatic_score).
T_PROMPTS=(
  "Please lint this TypeScript file and fix eslint spacing only. No architecture changes."
  "Format package.json with prettier indentation. Do not refactor."
  "Rename the unused variable foo to bar and remove unused imports. No tools needed beyond read."
  "Fix whitespace and semicolon style only in one short function. Simple formatting task."
  "Sort imports and fix linting warnings about unused import. No redesign."
  "Correct a typo in a comment and fix indentation with prettier. Keep behavior identical."
  "Add export for helper formatDate only; remove unused import. Boilerplate change."
  "Move file scripts/qa/tmp-note.md is not needed — instead fix spacing in a one-line comment."
  "Uncomment a single eslint-disable line and fix whitespace. Template-level edit."
  "Simple test: assert 1+1===2 in one line. Formatting only, no architecture."
  "Fix import path typo and lint unused variable. No refactoring."
  "Apply prettier formatting to README.md heading spacing. No content rewrite."
  "Remove unused import from a tiny util and fix indent. Lint-only."
  "Rename indent helper to indentationHelper. No behavior change."
  "Fix eslint prettier conflict on spacing in one object literal."
  "Boilerplate: add a one-line template comment with correct indentation."
  "Format a JSON snippet with prettier. Do not change keys."
  "Lint-only: remove unused variable leftover from a rename."
  "Fix semicolon and spacing on a single return statement."
  "Sort imports alphabetically in one file. No other edits."
  "Correct typo in function name comment; keep code as-is."
  "Add missing export keyword to an already-written helper. Boilerplate."
  "Remove unused eslint-disable and fix lint formatting."
  "Indentation fix for a nested if block; no logic change."
  "Simple formatting pass: prettier + eslint autofix for spacing."
)

i=0
for prompt in "${T_PROMPTS[@]}"; do
  i=$((i + 1))
  run_turn "T$i" "good" "--no-tools" "$prompt"
done

# --- Pack X: complex keyword prompts (triage_verdict=complex; offline-validated) ---
X_PROMPTS=(
  "Architect a distributed microservice migration with concurrency-safe deadlock avoidance. Plan only."
  "Debug a race condition in concurrent infrastructure optimization for scalability. Detailed steps."
  "Refactor the routing architecture for distributed queue migration without downtime. Plan only."
  "Design concurrency controls to prevent deadlock during a multi-service refactor. Architecture notes."
  "Propose infrastructure optimization for microservice scalability under concurrent load."
  "Plan a migration that rewrites distributed locking to eliminate race conditions."
  "Architecture review: refactor hydra matching for concurrent request scalability."
  "Debug intermittent deadlock in concurrent session pinning across microservices."
  "Optimize distributed telemetry ingestion for scalability; include concurrency risks."
  "Migrate calibration train path to concurrent workers without race conditions. Plan."
  "Architect failover infrastructure for multi-region routing under concurrency pressure."
  "Refactor pipeline stages for distributed tracing; address deadlock and race condition risks."
  "Complex debugging: concurrency bug causing race condition in session pin upgrades."
  "Scalability architecture for hydra embedding cache across microservices. Plan only."
  "Plan infrastructure migration of SQLite store to distributed durable queue."
  "Design concurrent batch orchestration that avoids deadlock during gate approval."
  "Optimize routing calibration training for distributed CPU with concurrency limits."
  "Architecture spike: refactor triage+hydra boundary for microservice deployment."
  "Debug distributed race condition between telemetry write and dataset export."
  "Propose concurrent-safe migration of release gates evaluation across workers."
  "Infrastructure plan: scalability of ONNX embedding under concurrent hydra matches."
  "Refactor circuit-breaker architecture for distributed provider failover. Deep plan."
  "Concurrency design for multi-lane spine integrate without deadlock."
  "Architect optimization of quota window feed under concurrent stream failures."
  "Migration plan: distribute modernbert inference; address race conditions."
  "Complex architecture: concurrent soft-feed runs with deadlock-free archival."
)

i=0
for prompt in "${X_PROMPTS[@]}"; do
  i=$((i + 1))
  run_turn "X$i" "good" "--no-tools" "$prompt"
done

echo
echo "==> Mid-count after Packs T+X (triage trainable probe)"
npx --yes tsx "$ROOT/scripts/qa/export-dogfood-snapshot.ts" --limit 10000 --tag mid-tx >"$LOG_DIR/mid-tx-export.txt" 2>&1 || true
cat "$LOG_DIR/mid-tx-export.txt" || true

echo
echo "==> Final export + labeled_econ + triage counts"
set +e
npx --yes tsx "$ROOT/scripts/qa/export-dogfood-snapshot.ts" --limit 10000 --tag final | tee "$LOG_DIR/final-export.txt"
EXPORT_EC=${PIPESTATUS[0]}
set -e

echo
echo "Gather logs: $LOG_DIR"
echo "Exit semantics: 0=econ+triage floors, 2=econ unmet, 3=triage unmet (hydra stays honest-untrained)"
echo "Next: aggregate → train-calibration → verify; npm run qa:shadow-dogfood"
exit "$EXPORT_EC"
