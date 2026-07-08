#!/usr/bin/env bash
# Create routing-quality backlog issues from docs/routing-roadmap.md (2026-07-08).
# Idempotency: aborts if any issue with title prefix "routing: P0 —" already exists.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI required" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh not authenticated — run: gh auth login" >&2
  exit 1
fi

MANIFEST="$REPO_ROOT/scripts/github/routing-quality-issues-created.txt"
if [[ -f "$MANIFEST" ]]; then
  echo "warning: manifest exists ($MANIFEST); aborting to avoid duplicates." >&2
  exit 1
fi
ROUTING_COUNT="$(gh issue list --state all --search 'routing: P in:title' --json number 2>/dev/null | jq 'length' || echo 0)"
if [[ "$ROUTING_COUNT" -ge 14 ]]; then
  echo "warning: found $ROUTING_COUNT routing: P* issues; aborting to avoid duplicates." >&2
  exit 1
fi

OPEN_COUNT="$(gh issue list --state open --json number | jq 'length')"
echo "Open issues before batch: $OPEN_COUNT (expect 3: #1, #25, #26)"

ROADMAP_URL="https://github.com/beettlle/pi-smart-router/blob/main/docs/routing-roadmap.md"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

create_issue() {
  local title="$1"
  local labels="$2"
  local body_file="$3"
  local url
  url="$(gh issue create --title "$title" --label "$labels" --body-file "$body_file")"
  echo "$url" | grep -oE '[0-9]+$'
}

# shellcheck disable=SC2034
ISSUE_SUBAGENT=""
ISSUE_SAAR=""
ISSUE_BREAKEVEN=""
ISSUE_ISOTONIC=""
ISSUE_PROFILES=""
ISSUE_HYDRA7=""
ISSUE_OATS=""
ISSUE_VCOST=""
ISSUE_EVAL=""
ISSUE_GRANITE=""
ISSUE_MODERNBERT=""
ISSUE_ENTROPY=""
ISSUE_PINONLY=""
ISSUE_TPS=""

echo "Creating issue 1/14: sub-agent delegate..."
cat >"$BODY_FILE" <<EOF
## Summary

Prefer ephemeral frontier sub-agent delegation for planning turns so the primary session stays pinned and prefix cache is preserved.

## Priority

P0

## Pipeline stages

\`turn_envelope\`, \`session_pin\`, explain/delegate contract

## Problem / motivation

SP-064 routes planning turns to frontier while pin metadata stays on an economical model — an **inference-path cache miss** even when SQLite pin is unchanged. Gemini + parallel research recommend compressed-context sub-agent calls with results injected as observations (Weave/Cursor pattern).

## Proposed solution

- [ ] Define \`planning_delegate\` (or equivalent) in routing explain output / pi middleware contract
- [ ] Document compressed context spec for frontier sub-call (exclude full execution history)
- [ ] Primary request remains on pinned tier when delegate path is used
- [ ] Fallback documented when pi cannot spawn sub-agents (see SAAR buffer issue)

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P0
- [SAAR (vLLM, 2026-06)](https://vllm.ai/blog/2026-06-02-session-aware-agentic-routing)
- [gemini-research.md](https://github.com/beettlle/pi-smart-router/blob/main/docs/gemini-research.md) §2

## Dependencies

- Related closed: #23 (historical turn_envelope / pin order)
- Blocks: SAAR buffer can land independently

## Out of scope

- Changing pi core sub-agent orchestration (coordinate upstream if needed)

## Verification

- [ ] Integration test: planning turn does not switch primary inference model when delegate path active
- [ ] Explain output documents delegate vs direct route
- [ ] Dogfood on multi-turn planning session
EOF
ISSUE_SUBAGENT="$(create_issue \
  "routing: P0 — cache-preserving planning via ephemeral sub-agent delegate" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_SUBAGENT"

echo "Creating issue 2/14: SAAR session pin..."
cat >"$BODY_FILE" <<EOF
## Summary

Implement Session-Aware Agentic Routing (SAAR) pin semantics: \`planning_turn_buffer\`, configurable \`prefix_cache_weight\`, idle-timeout reopen, and hard-lock during tool loops.

## Priority

P0

## Pipeline stages

\`turn_envelope\`, \`session_pin\`

## Problem / motivation

Turn envelope currently early-exits planning → frontier before pin economics apply. Without turn-index-aware pin policy, prefix cache (30–90% effective input cost) is lost on warm sessions.

## Proposed solution

- [ ] \`SessionState\`: \`planning_turn_buffer\` (default 2), \`prefix_cache_weight\` (default 0.20), \`idle_timeout_seconds\`, \`switch_threshold\`
- [ ] Turns 0–(buffer-1): allow capability-gated frontier without permanent pin overwrite
- [ ] After buffer: hard-lock pin; tier upgrades only during tool loops
- [ ] Config surface in operator config / env

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P0
- [SAAR blog](https://vllm.ai/blog/2026-06-02-session-aware-agentic-routing)

## Dependencies

- Related closed: #23, #32
- Complements: #$ISSUE_SUBAGENT (sub-agent preferred when pi supports it)

## Out of scope

- Full SeqRoute MDP / CQL quota RL

## Verification

- [ ] Unit tests for buffer + hard-lock transitions
- [ ] Integration: planning then execution turns respect pin after buffer
- [ ] \`npm run verify:ci\`
EOF
ISSUE_SAAR="$(create_issue \
  "routing: P0 — SAAR session pin (planning_turn_buffer, prefix_cache_weight, idle timeout)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_SAAR"

echo "Creating issue 3/14: cache breakeven..."
cat >"$BODY_FILE" <<EOF
## Summary

Gate turn_envelope sub-routes and session pin breaks with explicit cache breakeven math so switches save more than cache reprime costs.

## Priority

P0

## Pipeline stages

\`session_pin\`, \`turn_envelope\`, \`expected-cost\`

## Problem / motivation

Unconditional SP-064 sub-routes can turn a \$0.30 marginal save into a \$3+ cache miss when prefix discount (up to ~90% input) is discarded.

## Proposed solution

- [ ] Implement breakeven check: \`marginal_savings + future_cache_value > cache_reprime_cost\`
- [ ] Apply before turn_envelope tier override and before pin-break (beyond existing #32 warmup rule)
- [ ] Expose breakeven components in explain / telemetry
- [ ] Unit tests for edge cases (cold session vs warm 100k prefix)

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2–§3
- Related: gemini-research §2, closed #32

## Dependencies

- Depends on: #$ISSUE_SAAR (pin policy)
- Related closed: #32, #70, #68

## Out of scope

- Subscription quota λ (see virtual cost v2 issue)

## Verification

- [ ] Unit tests for breakeven formula
- [ ] Integration: tool_result sub-route blocked when breakeven fails
- [ ] Explain shows breakeven decision
EOF
ISSUE_BREAKEVEN="$(create_issue \
  "routing: P0 — cache breakeven gate for turn_envelope sub-routes and pin breaks" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_BREAKEVEN"

echo "Creating issue 4/14: isotonic P(success)..."
cat >"$BODY_FILE" <<EOF
## Summary

Add isotonic regression calibrator on top of SP-105 logistic P(success) baseline; ship as versioned artifact with <5ms serve-time lookup.

## Priority

P1

## Pipeline stages

\`low_intensity\`, calibration scripts (SP-116/117)

## Problem / motivation

Raw structural / logistic scores are miscalibrated — thresholding without calibration over-escalates to frontier (high ECE).

## Proposed solution

- [ ] Offline isotonic fit on held-out validation set
- [ ] Extend routing-calibration bundle schema with calibrator artifact
- [ ] Online lookup in low_intensity gate (<5ms)
- [ ] Richer training labels: tool-failure chains, invalid stop_reason, re-prompt/edit distance

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P1
- [SWE-Gym](https://arxiv.org/abs/2412.21139), [ToolRM](https://arxiv.org/abs/2509.11963)
- UCCI / isotonic (gemini-research §5 — verify citation)

## Dependencies

- Related closed: #61, #66 (SP-104–117)

## Out of scope

- Post-generation judging / cascades

## Verification

- [ ] Calibrator unit tests; ECE reported on holdout
- [ ] Integration with low_intensity gate
- [ ] \`npm run verify:ci\`
EOF
ISSUE_ISOTONIC="$(create_issue \
  "routing: P1 — isotonic P(success) calibrator artifact (UCCI-style)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_ISOTONIC"

echo "Creating issue 5/14: benchmark profiles..."
cat >"$BODY_FILE" <<EOF
## Summary

Ground \`models.yaml\` / registry capability vectors from live benchmarks with Switchcraft-style AST tool-call validation and monthly CI refresh.

## Priority

P1

## Pipeline stages

\`hydra_matcher\`, \`mapPiModelToProfile\`, config

## Problem / motivation

Static regex defaults (e.g. frontier ≈ 0.95) cause under/over-routing. Terminal-Bench better proxies debugging/tool-use than SWE-bench alone.

## Proposed solution

- [ ] Ingest SWE-bench Verified, Terminal-Bench, LiveCodeBench, BFCL scores per model
- [ ] AST validation for tool-capability ingestion (not exact string match)
- [ ] Monthly CI job rewrites profiles with provenance + frozen catalog date
- [ ] Shortfall gate uses updated profiles without encoder retrain

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P1
- [HyDRA arXiv:2605.17106](https://arxiv.org/abs/2605.17106)
- Switchcraft (gemini-research §4)

## Dependencies

- Related closed: #65 (projection head)
- Extends mapper / fleet profiles

## Out of scope

- K=4 dimension expansion (separate issue)

## Verification

- [ ] Profile scraper tests with fixture leaderboard data
- [ ] Mapper integration test: frontier floor from benchmarks
- [ ] CI job documented in README
EOF
ISSUE_PROFILES="$(create_issue \
  "routing: P1 — benchmark-grounded capability profiles (SWE-bench, Terminal-Bench, AST validation)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_PROFILES"

echo "Creating issue 6/14: HyDRA 7-flag prefix..."
cat >"$BODY_FILE" <<EOF
## Summary

Extend SP-112 four-flag metadata prefix toward HyDRA seven-flag spec to improve requirement prediction on agent turns.

## Priority

P1

## Pipeline stages

\`hydra_matcher\` input (\`hydra-input.ts\`)

## Problem / motivation

Current prefix: \`turns|tools|tokens|type\` (4 flags). HyDRA reference uses 7 flags and excludes prior assistant responses from encoder input for cheaper routing inference.

## Proposed solution

- [ ] Document delta vs HyDRA reference flags
- [ ] Add calibration-driven extensions (e.g. compaction, loop state, attachment indicators) as data supports
- [ ] Keep privacy-safe: metadata only, no raw prompt in training export
- [ ] Update projection/calibration if prefix changes affect embeddings

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §3
- Related closed: #60 / SP-112

## Dependencies

- Related closed: #60, #65

## Out of scope

- Encoder swap (Granite/ModernBERT issues)

## Verification

- [ ] Unit tests for prefix builder
- [ ] HyDRA matcher tests unchanged or improved
EOF
ISSUE_HYDRA7="$(create_issue \
  "routing: P1 — extend HyDRA metadata prefix toward 7-flag HyDRA spec" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_HYDRA7"

echo "Creating issue 7/14: OATS centroids..."
cat >"$BODY_FILE" <<EOF
## Summary

Outcome-aware cluster centroid refinement (OATS): shift centroids toward cheap-tier success embeddings and away from loop-escalation failures — offline only, zero serving latency.

## Priority

P2

## Pipeline stages

\`low_intensity\`, cluster config, SP-117 train path

## Problem / motivation

Static centroids (SP-114) cause false-high-confidence matches to low_stakes clusters.

## Proposed solution

- [ ] OATS interpolation step in calibration train pipeline
- [ ] Positive set: cheap-tier successes; negative set: loop-escalation failures
- [ ] Versioned centroid artifact in calibration bundle
- [ ] Document α/β hyperparameters and minimum sample sizes

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P2
- OATS (gemini-research §6 — verify citation)

## Dependencies

- Related closed: #64, #66

## Out of scope

- Online cluster learning at request time

## Verification

- [ ] Unit test on synthetic centroid shift
- [ ] Calibration pipeline integration test
EOF
ISSUE_OATS="$(create_issue \
  "routing: P2 — OATS offline centroid refinement in calibration pipeline" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_OATS"

echo "Creating issue 8/14: virtual cost v2..."
cat >"$BODY_FILE" <<EOF
## Summary

Extend virtual cost beyond SP-096 \`quota_cost_per_1m\`: deterministic quota decay λ(remaining_window), exhaustion risk, and KV-cache savings credit in scoring and pin economics.

## Priority

P2

## Pipeline stages

\`session_pin\`, pricing broker, \`expected-cost\`

## Problem / motivation

Sticker-price and flat virtual cost misroute late in subscription windows when marginal cost is near zero but quota exhaustion risk is high.

## Proposed solution

- [ ] \`virtual_cost(turn)\` adds quota_arbitrage_premium and kv_cache_savings (negative)
- [ ] Rolling window position for Cursor-style 5h limits where applicable
- [ ] Integrate with breakeven gate (#$ISSUE_BREAKEVEN)
- [ ] **Not** SeqRoute HBR+CQL in v1 — deterministic multiplier only

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P2
- Related closed: #70, #68

## Dependencies

- Related closed: #70, #68, #32
- Complements: #$ISSUE_BREAKEVEN

## Out of scope

- Full MDP / reinforcement learning quota policy

## Verification

- [ ] Unit tests for λ decay and cache credit
- [ ] Expected-cost integration tests
EOF
ISSUE_VCOST="$(create_issue \
  "routing: P2 — virtual cost v2 (quota decay λ, KV-cache savings credit)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_VCOST"

echo "Creating issue 9/14: eval harness..."
cat >"$BODY_FILE" <<EOF
## Summary

Offline evaluation harness for agentic routing: capability coverage, cost arbitrage, latency/continuity — plus counterfactual trace replay and TwinRouterBench-style step-level prefixes.

## Priority

P2

## Pipeline stages

offline eval (new \`scripts/\` or \`tests/eval/\`)

## Problem / motivation

MT-Bench / HumanEval underweight multi-turn tool loops. Need step-level prefixes and cumulative regret vs hindsight-optimal routing.

## Proposed solution

- [ ] Three-track harness: capability / cost / continuity (RouterBench + LLMRouterBench lineage)
- [ ] Counterfactual: \"cheap at step k\" vs verified tool progression
- [ ] TwinRouterBench static track integration or compatible fixture format
- [ ] Frozen model catalog + checkpoint date for published numbers

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §5
- [RouterBench](https://arxiv.org/abs/2403.12031), [LLMRouterBench](https://arxiv.org/abs/2601.07206)
- TwinRouterBench (gemini-research §9)

## Dependencies

- Related closed: #61 telemetry export

## Out of scope

- Production shadow deploy (separate roadmap phase)

## Verification

- [ ] Harness runs on fixture traces in CI (smoke)
- [ ] Document how to run locally
EOF
ISSUE_EVAL="$(create_issue \
  "routing: P2 — agent-native router eval harness (counterfactual replay + TwinRouterBench track)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_EVAL"

echo "Creating issue 10/14: Granite encoder..."
cat >"$BODY_FILE" <<EOF
## Summary

Trial \`ibm-granite/granite-embedding-97m-multilingual-r2\` (384-dim, long context, ONNX) as drop-in replacement for MiniLM behind feature flag.

## Priority

P3

## Pipeline stages

\`hydra_matcher\`, shared embedder, artifacts

## Problem / motivation

MiniLM truncates at 512 tokens; agent turns carry large diff/log context. Granite keeps 384-dim compatibility with SP-115 projection head.

## Proposed solution

- [ ] Feature-flag encoder selection in operator config
- [ ] ONNX artifact path + latency budget check (80–120ms)
- [ ] MiniLM remains fallback
- [ ] Benchmark vs MiniLM on held-out agent turn sample

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §2 P3
- [ModernBERT arXiv:2412.13663](https://arxiv.org/abs/2412.13663)
- Granite R2 (gemini-research §3)

## Dependencies

- Related closed: #65
- Blocks: ModernBERT/K=4 issue

## Out of scope

- K=4 heads (follow-on issue)

## Verification

- [ ] Encoder swap integration test
- [ ] Latency benchmark script output
EOF
ISSUE_GRANITE="$(create_issue \
  "routing: P3 — Granite 97M long-context encoder trial (384-dim ONNX drop-in)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_GRANITE"

echo "Creating issue 11/14: ModernBERT K=4..."
cat >"$BODY_FILE" <<EOF
## Summary

Optional ModernBERT-base encoder with K=4 independent sigmoid heads on [CLS] for true HyDRA-style capability prediction (incl. debugging dimension).

## Priority

P3

## Pipeline stages

\`hydra_matcher\`, artifacts, calibration

## Problem / motivation

SP-115 learned 384×3 projection is an approximation. HyDRA uses K heads on encoder pooled vector; K=4 adds debugging beyond current K=3.

## Proposed solution

- [ ] Only after Granite trial (#$ISSUE_GRANITE) or explicit skip decision
- [ ] K=4 when calibration Top-1 error warrants (roadmap: >~10%)
- [ ] Catalog-decoupled shortfall unchanged
- [ ] Document migration from SP-115 artifact

## Evidence

- [HyDRA arXiv:2605.17106](https://arxiv.org/abs/2605.17106)
- [routing-roadmap.md]($ROADMAP_URL) §2 P3

## Dependencies

- Depends on: #$ISSUE_GRANITE (recommended sequence)
- Related closed: #65

## Out of scope

- Retraining on raw prompts

## Verification

- [ ] Head output shape tests
- [ ] Offline QR on eval harness
EOF
ISSUE_MODERNBERT="$(create_issue \
  "routing: P3 — ModernBERT encoder + K=4 capability heads (true HyDRA fidelity)" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_MODERNBERT"

echo "Creating issue 12/14: entropy triage..."
cat >"$BODY_FILE" <<EOF
## Summary

Add length-normalized token entropy checks in deterministic triage to detect adversarial suffix patterns (R2A / Route-to-Rome class attacks).

## Priority

P3

## Pipeline stages

\`deterministic_triage\` (confounder sanitization)

## Problem / motivation

Embedding routers are vulnerable to optimized suffixes that inflate perceived complexity. Existing confounder regex is necessary but not sufficient.

## Proposed solution

- [ ] Entropy anomaly detection on prompt tail segments
- [ ] Strip or flag suffixes violating natural language/code distributions
- [ ] Flip-flop shadow log: 3 consecutive tier flips → pin tier for session
- [ ] Document false-positive rate on dogfood corpus

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §3, §8
- [AdversariaLLM](https://arxiv.org/abs/2511.04316)
- R2A (gemini-research §8)

## Dependencies

- Builds on existing confounder sanitization

## Out of scope

- SAE residual-stream defense (deferred)
- RouteLLM MF head (deferred)

## Verification

- [ ] Unit tests with synthetic high-entropy suffix fixtures
- [ ] No regression on normal prompts corpus
EOF
ISSUE_ENTROPY="$(create_issue \
  "routing: P3 — entropy-based adversarial suffix checks in deterministic triage" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_ENTROPY"

echo "Creating issue 13/14: pin-only fallback..."
cat >"$BODY_FILE" <<EOF
## Summary

Operator config flag to degrade to pin-on-first-turn (emergency only) when shadow eval shows quality retention regresses >5% vs baseline.

## Priority

P3

## Pipeline stages

\`session_pin\`, operator config

## Problem / motivation

Multi-stage router is the design target, but operators need a safe mode if shadow QR drops (roadmap fallback posture).

## Proposed solution

- [ ] Config: \`pin_only_fallback\` or equivalent
- [ ] Requires eval harness (#$ISSUE_EVAL) metrics or manual operator trigger
- [ ] Document as emergency mode, not default
- [ ] Telemetry when fallback active

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §1, §10

## Dependencies

- Depends on: #$ISSUE_EVAL (recommended for automated trigger)

## Out of scope

- Making pin-only the default policy

## Verification

- [ ] Config toggles behavior in integration test
- [ ] README operator section
EOF
ISSUE_PINONLY="$(create_issue \
  "routing: P3 — pin-only operator fallback when shadow quality retention regresses" \
  "enhancement" \
  "$BODY_FILE")"
echo "Created #$ISSUE_PINONLY"

echo "Creating issue 14/14: tokens_per_second gate..."
cat >"$BODY_FILE" <<EOF
## Summary

Gate local zero-tier on rolling median \`tokens_per_second\` estimate instead of boolean hardware probe only.

## Priority

P3

## Pipeline stages

\`hardware_probe\`, \`local_zero\`

## Problem / motivation

Boolean \"GPU available\" misroutes on slow local backends; human-usable threshold (~25 tok/s) better predicts local viability.

## Proposed solution

- [ ] Rolling median over last N local inference samples
- [ ] Gate local_zero when below threshold; fall through to economical cloud
- [ ] Dogfood on real hardware per open platform issues

## Evidence

- [routing-roadmap.md]($ROADMAP_URL) §3
- LiteLLM local-first case studies

## Dependencies

- Related open: #1, #25, #26 (hardware dogfooding)
- Related closed: #59 (local_zero decouple)

## Out of scope

- MLX native backend

## Verification

- [ ] Unit tests with mocked throughput meter
- [ ] Dogfood on Apple Silicon (existing); Linux/Windows when #25/#26 land
EOF
ISSUE_TPS="$(create_issue \
  "routing: P3 — rolling tokens_per_second gate for local zero-tier" \
  "enhancement,help wanted" \
  "$BODY_FILE")"
echo "Created #$ISSUE_TPS"

MANIFEST="$REPO_ROOT/scripts/github/routing-quality-issues-created.txt"
cat > "$MANIFEST" <<EOF
# Created $(date -u +%Y-%m-%dT%H:%M:%SZ) — routing quality backlog
ISSUE_SUBAGENT=$ISSUE_SUBAGENT
ISSUE_SAAR=$ISSUE_SAAR
ISSUE_BREAKEVEN=$ISSUE_BREAKEVEN
ISSUE_ISOTONIC=$ISSUE_ISOTONIC
ISSUE_PROFILES=$ISSUE_PROFILES
ISSUE_HYDRA7=$ISSUE_HYDRA7
ISSUE_OATS=$ISSUE_OATS
ISSUE_VCOST=$ISSUE_VCOST
ISSUE_EVAL=$ISSUE_EVAL
ISSUE_GRANITE=$ISSUE_GRANITE
ISSUE_MODERNBERT=$ISSUE_MODERNBERT
ISSUE_ENTROPY=$ISSUE_ENTROPY
ISSUE_PINONLY=$ISSUE_PINONLY
ISSUE_TPS=$ISSUE_TPS
EOF

echo ""
echo "=== Created 14 issues ==="
printf '%s\n' \
  "#$ISSUE_SUBAGENT  P0 sub-agent delegate" \
  "#$ISSUE_SAAR      P0 SAAR pin" \
  "#$ISSUE_BREAKEVEN P0 cache breakeven" \
  "#$ISSUE_ISOTONIC  P1 isotonic P(success)" \
  "#$ISSUE_PROFILES  P1 benchmark profiles" \
  "#$ISSUE_HYDRA7    P1 HyDRA 7-flag" \
  "#$ISSUE_OATS      P2 OATS centroids" \
  "#$ISSUE_VCOST     P2 virtual cost v2" \
  "#$ISSUE_EVAL      P2 eval harness" \
  "#$ISSUE_GRANITE   P3 Granite encoder" \
  "#$ISSUE_MODERNBERT P3 ModernBERT K=4" \
  "#$ISSUE_ENTROPY   P3 entropy triage" \
  "#$ISSUE_PINONLY   P3 pin-only fallback" \
  "#$ISSUE_TPS       P3 tokens_per_second"
echo ""
echo "Manifest: $MANIFEST"
echo "Update docs/routing-roadmap.md with these numbers."
