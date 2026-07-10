# Task: SP-175 — P(success) Trained Weights

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Ship/load non-example P(success) weights so expected-cost gating activates in dogfood; document train/reload without prompt text.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#93
- Bucket: feature
- Closes: #93

## Mission

P(success) classifier + expected-cost + isotonic infrastructure landed, but dogfood still runs on `config/p-success-weights.json.example` with `trained_sample_count: 0` (neutral ≈ 0.5). Deliver a path where `SMART_ROUTER_DATASET=1` + feedback (or a documented install-local train path) reaches the ≥30 labeled-sample gate, and ship/load a non-example `p-success-weights` artifact (and isotonic when available) so the pipeline uses trained scores in dogfood. Missing/untrained artifacts must still fall back safely. Telemetry/explain should show raw vs used P(success). Document how operators train/reload weights without committing prompt text.

Fixture- or synthetic-labeled training is acceptable for the checked-in dogfood artifact when real community contrib volume is insufficient — provenance must be documented.

## Dependencies

- **Task:** SP-174 (serialize README / docs edits after fleet-profile docs)

## Context to Read First

- `src/domain/routing/p-success-classifier.ts` — `loadPSuccessWeights`, train helpers, min-sample gate
- `scripts/train-routing-calibration.ts` — `trainPSuccessWeights`
- `config/p-success-weights.json.example`
- `config/routing-calibration.json.example`
- `src/domain/pipeline/router-pipeline.ts` — low-intensity / expected-cost path (read-only unless tiny explain field)
- README calibration / P(success) sections
- `tests/unit/p-success-classifier.test.ts`, `tests/unit/expected-cost.test.ts`, `tests/unit/isotonic-calibrator.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/p-success-weights.json`, `README.md` |
| May change | `scripts/train-routing-calibration.ts`, `scripts/**` train helpers, `config/routing-calibration.json`, `config/p-success-weights.json.example`, `tests/unit/p-success-classifier.test.ts`, `tests/unit/expected-cost.test.ts`, `tests/unit/isotonic-calibrator.test.ts`, `tests/unit/router-pipeline.test.ts`, `package.json` (train script only if needed) |
| Must NOT change | `.pi/extensions/smart-router/**`, `src/config/pi-model-mapper.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/p-success-classifier.test.ts tests/unit/expected-cost.test.ts tests/unit/isotonic-calibrator.test.ts` |
| fileScopeMustChange | `config/p-success-weights.json` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/**` |

## Steps

### Step 1: Train path and ship weights

- [ ] Ensure install-local / dataset train path can produce ≥30 labeled samples (document or add fixture/synthetic train input)
- [ ] Produce and commit non-example `config/p-success-weights.json` with `trained_sample_count >= min_training_samples`
- [ ] Include isotonic in calibration bundle when available; otherwise document gap
- [ ] Record provenance (fixture/synthetic vs community) in README or artifact comment/header if schema allows

### Step 2: Load, explain, docs

- [ ] Verify pipeline loads shipped weights and uses trained scores (not neutral 0.5) when above min samples
- [ ] Telemetry/explain shows raw vs used P(success); missing artifact still falls back safely
- [ ] Document operator train/reload without committing prompt text

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/p-success-classifier.test.ts tests/unit/expected-cost.test.ts tests/unit/isotonic-calibrator.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Dogfood path has non-example trained P(success) weights (≥30 samples)
- [ ] Pipeline uses trained scores when artifact present; safe fallback when missing
- [ ] Raw vs used P(success) visible in telemetry/explain
- [ ] Operator train/reload docs without prompt text

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Must Update | `README.md` (P(success) / calibration train-reload) |

## Git Commit Convention

- `feat(SP-175): description`

## Do NOT

- Commit raw prompts, messages, or tool args
- Modify extension SAAR wiring (#92 / SP-173)
- Modify fleet capability mapper (#94 / SP-174)
- Lower `min_training_samples` below 30 to fake readiness

---

## Amendments (Added During Execution)

- **2026-07-10 (pre-wave-1):** `README.md` removed from `fileScopeMustChange` — SP-174 already changed README on main (pre-landed contract risk). Contract proof is `config/p-success-weights.json` only; README remains in File Scope Must change / Documentation Requirements for P(success) train-reload docs.
