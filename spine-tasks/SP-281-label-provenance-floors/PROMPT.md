# Task: SP-281 — label provenance floors

**Created:** 2026-09-10
**Size:** M

## Review Level: 1

**Assessment:** Post-1.0 calibration follow-up; bounded file scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#168
- Release: v1.1.0
- Manifest: `spine-tasks/_authoring/release-v1.1.0/manifest.md`

## Mission

Add label provenance tagging (`human_feedback` | `llm_judge` | `scripted_intent`) on gather/export paths. Sample floors for ship claims must ignore `scripted_intent`. Quarantine already on dogfood-gather; extend aggregate/train skip rules.

## Dependencies

- SP-280

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.1.0/manifest.md`
- `docs/migration-v1.md` (honest-untrained 1.0 posture)
- Issue beettlle/pi-smart-router#168

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/qa/dogfood-gather.sh`, `scripts/calibration-aggregate.ts`, related unit tests |
| May change | `scripts/lib/contrib-training-samples.ts`, README calibration notes |
| Must NOT change | `config/routing-calibration.json` (until SP-284) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npx vitest run tests/unit/p-success-classifier.test.ts` |
| fileScopeMustChange | `scripts/qa/dogfood-gather.sh`, `scripts/calibration-aggregate.ts` |
| completionCriteria | Mission outcomes met; STATUS honest |

## Steps

### Step 0: Preflight

- [ ] Read CONTEXT + linked issue + migration honesty section
- [ ] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts

### Step 1: Implementation

- [ ] Deliver mission outcomes within File Scope

### Step 2: Testing & Verification

- [ ] Run contract testCommand
- [ ] Update STATUS with evidence


## Do NOT

- Count scripted_intent rows toward ship floors
- Invent labels or coerce null success to true

## Completion Criteria

- [ ] Mission complete without inventing labels or flipping #96 defaults
