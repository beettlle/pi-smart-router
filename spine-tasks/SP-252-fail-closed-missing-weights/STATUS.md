# SP-252: fail_closed_on_missing_weights + sandwich integration — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Confirm SP-251 reason codes are importable
- [x] Choose schema home (operator vs degraded_route nested)

Preflight findings:
- SP-251 codes live in `src/domain/matching/missing-weights-reason-codes.ts`
  (`HYDRA_WEIGHTS_MISSING_REASON_CODE`, `K4_HEADS_PLACEHOLDER_REASON_CODE`) and are
  already surfaced via `MatchResult.requirement_reason_codes` /
  `HydraMatcher.missingWeightsReasonCodes()`.
- Schema home: **`degraded_route` nested** (`DegradedRouteConfigSchema`) — the flag
  controls whether missing weights trigger the SP-212 degraded sandwich, so it sits
  beside `enabled`; avoids a new top-level operator section.
- Sandwich integration: reuse existing `NeuralFailureKind` `neural_misconfigured`
  (declared, previously unused) — no new cascade kind.

## Step 1: Config + fail-closed behavior

**Status:** ✅ Complete

- [x] Add Zod field + default false
- [x] Honor flag in matcher / pipeline fail-closed path
- [x] Align sandwich reason codes with SP-251 codes where applicable

Implementation (resumed session — work found on disk uncommitted, verified):
- `DegradedRouteConfigSchema.fail_closed_on_missing_weights` (Zod, default false)
  + `DEFAULT_DEGRADED_ROUTE_CONFIG` entry in `schemas.ts`.
- `HydraMatcherConfig.failClosedOnMissingWeights` + `MissingWeightsFailClosedError`
  (carries SP-251 `reasonCodes`); `match()` throws before paying embedding cost when
  flag set and requirement reason codes are non-empty.
- `RouterPipeline`: catches `MissingWeightsFailClosedError` → `degradedRouteStage(
  'neural_misconfigured', codes)`; pipeline-side check also honors the operator
  `degraded_route` flag even when the matcher was built fail-open. Decision
  `reason_code` surfaces the SP-251 codes; `route_path` records the sandwich branch.

## Step 2: Testing & Verification

**Status:** 🔄 In Progress

- [x] Unit tests: default fail-open; fail-closed when enabled
- [ ] Contract `testCommand` green
- [ ] #148 closable with SP-251

## Completion Criteria

- [ ] Fail-closed option + sandwich integration complete; #148 closable

## Discoveries

- Prior session completed Step 1 implementation + unit tests but exited before
  committing or updating STATUS. Verified on resume: typecheck green, contract
  testCommand green (89 tests), router-pipeline + schemas suites green (107 tests).
- GitNexus `detect_changes` (unstaged): 11 changed symbols, medium risk, confined
  to HydraMatcher construction/match flows — all within File Scope.
