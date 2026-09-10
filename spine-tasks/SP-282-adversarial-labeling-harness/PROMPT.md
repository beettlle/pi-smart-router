# Task: SP-282 — adversarial labeling harness

**Created:** 2026-09-10
**Size:** M

## Review Level: 1

**Assessment:** Post-1.0 calibration follow-up; bounded file scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#169
- Release: v1.1.0
- Manifest: `spine-tasks/_authoring/release-v1.1.0/manifest.md`

## Mission

Build adversarial LLM labeling harness: multi-model generate, blinded graders, ≥20% negatives, session holdout. Output labeled JSONL with `llm_judge` provenance. Do not ship into production bundle in this packet.

## Dependencies

- SP-281

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.1.0/manifest.md`
- `docs/migration-v1.md` (honest-untrained 1.0 posture)
- Issue beettlle/pi-smart-router#169

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/qa/**` or `scripts/calibration/**` harness + tests |
| May change | `tests/eval/corpus/label-packs/**` fixtures (small) |
| Must NOT change | `config/p-success-weights.json`, `config/routing-calibration.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npx vitest run tests/unit/label-pack-schema.test.ts` |
| fileScopeMustChange | `scripts/qa/`, `scripts/calibration/` |
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

- Ship weak/scripted labels into production config/
- Pre-label packs as good/bad without graders

## Completion Criteria

- [ ] Mission complete without inventing labels or flipping #96 defaults
