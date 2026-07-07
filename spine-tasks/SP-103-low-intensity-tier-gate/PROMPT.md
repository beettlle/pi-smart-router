# Task: SP-103 — Low-intensity tier gate pipeline stage

**Created:** 2026-07-06
**Size:** M

## Review Level: 2

**Assessment:** #58 — pipeline stage that sets tier_hint from cluster match + structural low-intensity score before session pin and HyDRA.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#58
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Add `low_intensity` pipeline stage after `turn_envelope` and before `session_pin`:

```
turn_envelope → low_intensity_gate → session_pin → triage → local_zero → hydra_match
```

When `low_intensity_score >= HIGH_THRESHOLD`, set `tier_hint` to zero-tier (if local ready) else economical-cloud. When `<= LOW_THRESHOLD`, set frontier-cloud. Otherwise defer (tier_hint null). Attach tier_hint to routing decision features for explain (#62). Configurable thresholds in operator config.

## Dependencies

- SP-102
- SP-093

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`
- `src/domain/routing/tier-features.ts` (SP-102)
- `src/domain/matching/cluster-matcher.ts` (SP-101)
- `tests/unit/router-pipeline.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/config/defaults.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | New low_intensity stage with tests; high-confidence low_stakes cluster → local_zero eligible; ambiguous prompts fall through; tier_hint on decision features. |

## Steps

### Step 1: low_intensity stage implementation

- [ ] Insert stage after turn_envelope, before session_pin
- [ ] Compute low_intensity_score from tier features + cluster match
- [ ] Set tier_hint and reason_code (cluster_${id} or low_intensity_structural / high_intensity_structural)
- [ ] Constrain subsequent HyDRA fleet to tier when hint set with high confidence

### Step 2: Testing and verification

- [ ] High-confidence low_stakes_general → economical/zero tier hint
- [ ] Ambiguous prompt → tier_hint null (no regression)
- [ ] tier_hint attached to decision features
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] New stage `low_intensity` in pipeline with tests
- [ ] High-confidence low_stakes_general cluster → local_zero path eligible
- [ ] Ambiguous prompts fall through without deciding
- [ ] tier_hint attached to routing decision features
- [ ] Configurable thresholds in operator config
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-103): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)
- Implement P(success) or expected-cost (SP-105, SP-106)

---
