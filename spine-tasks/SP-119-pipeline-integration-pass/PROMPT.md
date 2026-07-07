# Task: SP-119 — Pipeline integration pass for routing stages

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** #69 — final integration pass wiring all context-fit and tier-selection stages in documented order with shared sidecar and combined tests.
**Score:** 6/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#69
- Bucket: feature
- Epic: beettlle/pi-smart-router#63

## Mission

Wire all routing stages into `RouterPipeline` and pi extension with target order: `hardware_probe → turn_envelope → context_fit → low_intensity_gate → session_pin → triage → local_zero → hydra_match → safe_default → overflow fallback`. Pass shared sidecar (`estimated_input_tokens`, `tier_hint`, `cluster_match`, `context_fit_viable`, `p_success_cheap`). Combined integration tests for 34K-token overflow scenario and fresh-session local_zero Q&A. Update stage order docs. `pi router explain` shows combined rationale from SP-110 + SP-113.

## Dependencies

- SP-111
- SP-112
- SP-115
- SP-110
- SP-113

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`
- `.pi/extensions/smart-router/route-and-delegate.ts`
- `tests/integration/full-pipeline.test.ts`
- `tests/integration/pi-extension.test.ts`
- `specs/001-build-smart-router/`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `.pi/extensions/smart-router/route-and-delegate.ts`, `tests/integration/full-pipeline.test.ts`, `tests/integration/pi-extension.test.ts`, `README.md`, `specs/001-build-smart-router/` |
| Must NOT change | `src/infrastructure/delegation/provider-error.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/infrastructure/delegation/provider-error.ts` |
| completionCriteria | Full pipeline test covers context-fit + tier interaction; no stale sidecar fields; explain shows combined rationale; stage order documented and matches code. |

## Steps

### Step 1: Stage registration and sidecar

- [ ] Register all stages with correct `decided` / fall-through semantics per target order
- [ ] Pass shared sidecar fields between stages
- [ ] Ensure context_fit before session_pin; local_zero reads low_intensity output

### Step 2: Extension and integration tests

- [ ] Extension `buildRoutingRequest` supplies all required fields
- [ ] Integration test: 34K-token session + short prompt → overflow or larger model
- [ ] Integration test: fresh session + `"what is 2+2 ?"` + local ready → local_zero

### Step 3: Testing and verification

- [ ] Verify `pi router explain` shows combined context-fit + tier rationale
- [ ] Update README and specs stage order docs if drifted
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Full pipeline test covers context-fit + tier selection interaction
- [ ] No stage reads stale/missing sidecar fields
- [ ] `pi router explain` shows combined rationale from #53 + #62
- [ ] Stage order documented in README and matches code
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-119): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
