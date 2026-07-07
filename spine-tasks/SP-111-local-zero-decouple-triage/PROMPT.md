# Task: SP-111 — Decouple local_zero from trivial-only triage

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** #59 — expand local zero-tier eligibility beyond triage `trivial` verdict using low-intensity gate and cluster signals.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#59
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Replace trivial-only guard in `localZeroTierStage` with a disjunction: triage trivial OR (`low_intensity_gate.tier_hint === 'zero-tier'` with high confidence) OR (`clusterMatch.clusterId === 'mechanical_edit'` with high confidence). Preserve existing guards: `hardware_probe === full_local`, local model ready, context fit, SC-007 `classification_only` skip. Emit distinct reason codes: `triage_trivial`, `cluster_low_stakes_general`, `low_intensity_structural`.

## Dependencies

- SP-103
- SP-101

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — `localZeroTierStage`
- `src/domain/matching/cluster-matcher.ts`
- `tests/integration/full-pipeline.test.ts`
- `tests/integration/pi-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `tests/integration/full-pipeline.test.ts`, `tests/integration/pi-extension.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | `"what is 2+2 ?"` routes local when ready; trivial path preserved; complex prompts skip local; distinct reason codes; unit + integration tests pass. |

## Steps

### Step 1: Local eligibility disjunction

- [ ] Implement `localEligible` helper combining triage, low-intensity gate, and cluster signals
- [ ] Wire into `localZeroTierStage` replacing trivial-only guard
- [ ] Preserve hardware, readiness, context-fit, and SC-007 guards

### Step 2: Reason codes and sidecar

- [ ] Emit `local_eligible_reason` on routing decision
- [ ] Ensure low-intensity gate output read before local_zero stage

### Step 3: Testing and verification

- [ ] Integration test: fresh session + `"what is 2+2 ?"` + local ready → local_zero
- [ ] Regression: trivial keyword path and complex prompt rejection
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `"what is 2+2 ?"` routes to local when Ollama/LM Studio has model loaded
- [ ] Existing trivial keyword path still works
- [ ] Complex/architecture prompts still skip local even if phrasing is short
- [ ] Reason codes distinguish `triage_trivial` vs `cluster_low_stakes_general` vs `low_intensity_structural`
- [ ] Unit + integration tests pass
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-111): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
