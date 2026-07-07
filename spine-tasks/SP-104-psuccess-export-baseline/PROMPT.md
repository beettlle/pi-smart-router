# Task: SP-104 — P(success) training export and baseline classifier

**Created:** 2026-07-06
**Size:** M

## Review Level: 2

**Assessment:** #61 Phase A — export JSONL from dataset+outcomes and baseline logistic/weighted P(success) scorer.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#61
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Train a lightweight success-probability router from privacy-safe telemetry. Phase A: export JSONL from `dataset` + `outcomes` join, implement baseline classifier (logistic regression or weighted score — no heavy ML deps required initially), output `P_success_cheap` in [0,1]. Document `SMART_ROUTER_DATASET=1` requirement.

Success label: no provider failover, no user model override within N turns, no stopReason:length or infra error.

## Dependencies

- SP-062

## Context to Read First

- `src/cli/smart-router-cli.ts` — export dataset command (SP-060)
- `src/infrastructure/telemetry/dataset-recorder.ts`
- `src/domain/routing/tier-features.ts` (SP-102 when available; stub features OK for export)
- `docs/deep-research.md` § telemetry-driven decision trees

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/p-success-classifier.ts` |
| May change | `src/cli/smart-router-cli.ts`, `config/p-success-weights.json.example`, `tests/unit/p-success-classifier.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/routing/p-success-classifier.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Export script documented; baseline classifier with coefficients artifact; unit tests with fixture JSONL; graceful fallback when insufficient samples. |

## Steps

### Step 1: Export and label join

- [ ] Ensure `/smart-router export dataset` joins outcomes for success/failure labels
- [ ] Document SMART_ROUTER_DATASET=1 and minimum sample guidance in README

### Step 2: Baseline classifier

- [ ] Implement `p-success-classifier.ts` with train-from-export and predict(features) API
- [ ] Output coefficients to `config/p-success-weights.json.example`
- [ ] Unit tests with mocked training data

### Step 3: Testing and verification

- [ ] Test insufficient-data fallback (< N samples returns neutral P)
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Training export script documented with SMART_ROUTER_DATASET=1
- [ ] Baseline classifier produces P_success_cheap in [0,1]
- [ ] Falls back gracefully when insufficient training data
- [ ] No prompt plaintext in training export
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-104): description`

## Do NOT

- Wire online inference into pipeline (SP-105)
- Re-open or implement #1, #25, #26

---
