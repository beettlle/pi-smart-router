# Task: SP-116 — Calibration data aggregate and validate pipeline

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** #66 part 1 — aggregate privacy-safe telemetry contributions and validate schema before training.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#66
- Bucket: feature
- Epic: beettlle/pi-smart-router#63

## Mission

Implement calibration pipeline stages 1–2: aggregate anonymized JSONL from `data/contrib/` (or stdin), validate against schema, reject records with forbidden fields (prompt text, secrets, message keys). Define `routing-calibration.schema.json` for the multi-artifact bundle format. Strip install-local pepper fields (`dataset_key`). Document minimum sample size requirements for training.

## Dependencies

- SP-104
- SP-114
- SP-115

## Context to Read First

- `src/cli/smart-router-cli.ts` — existing export commands
- `scripts/` — existing training/export scripts from SP-104
- `config/routing-clusters.yaml`
- Closed #36 spec references in `specs/`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/calibration-aggregate.ts` |
| May change | `specs/001-build-smart-router/contracts/routing-calibration.schema.json`, `config/routing-calibration.json.example`, `package.json`, `data/contrib/.gitkeep`, `tests/unit/calibration-aggregate.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/calibration-aggregate.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Aggregate script collects contrib JSONL; validation rejects tainted payloads; schema documents bundle format; no prompt text in pipeline; minimum sample docs. |

## Steps

### Step 1: Schema and bundle format

- [ ] Define `routing-calibration.schema.json` for multi-artifact bundle (hydra_projection, triage_thresholds, p_success_weights, routing_centroids)
- [ ] Create `config/routing-calibration.json.example` with version field
- [ ] Document minimum sample size requirements

### Step 2: Aggregate and validate scripts

- [ ] Implement `scripts/calibration-aggregate.ts` — collect from `data/contrib/`
- [ ] Implement validation: schema check, reject prompt/message pattern keys, strip pepper fields
- [ ] Add `npm run routing:calibration-aggregate` script entry

### Step 3: Testing and verification

- [ ] Unit tests: valid contrib passes; tainted payload rejected
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Training script documented with minimum sample size requirements
- [ ] Artifact version field defined in schema
- [ ] No prompt text in training pipeline — feature vectors only
- [ ] Validation rejects tainted payloads
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-116): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
