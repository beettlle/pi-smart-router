# SP-175: P(success) Trained Weights — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Train path and ship weights

**Status:** ✅ Complete

- [x] Ensure ≥30-sample train path (document or fixture/synthetic input)
- [x] Commit non-example `config/p-success-weights.json` with trained_sample_count ≥ min
- [x] Include isotonic when available; document gap otherwise
- [x] Record provenance

## Step 2: Load, explain, docs

**Status:** ✅ Complete

- [x] Verify pipeline uses trained scores when artifact present
- [x] Telemetry/explain shows raw vs used P(success); safe fallback
- [x] Document operator train/reload without prompt text

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Run scoped vitest for classifier / expected-cost / isotonic
- [x] Run full `npm test`
- [x] Run coverage gate

---

## Completion Criteria

- [x] Dogfood path has non-example trained P(success) weights (≥30 samples)
- [x] Pipeline uses trained scores when present; safe fallback when missing
- [x] Raw vs used P(success) visible in telemetry/explain
- [x] Operator train/reload docs without prompt text

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-10 | 2 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-10 | 3 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Isotonic loads only from `routing-calibration.json`; shipping a full undertrained bundle would activate example centroids — document gap, ship logistic weights only | Dogfood uses raw logistic until operators merge isotonic |
| 2026-07-10 | Shipped weights auto-load in tests; structural suite needs `pSuccessWeights: untrained`; pi-extension infoSpy must allow Expected-cost logs | Minimal out-of-scope touch: `tests/integration/pi-extension.test.ts` |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | start | Step 1 in progress — train path + ship weights |
| 2026-07-10 | train | Synthetic fixture 40 rows → config/p-success-weights.json (trained_sample_count=40) |
| 2026-07-10 | commit | feat(SP-175): complete Step 1 — Train path and ship weights |
| 2026-07-10 | start | Step 2 in progress — load, explain, docs |
| 2026-07-10 | verify | Pipeline loads shipped weights; raw==calibrated without isotonic bundle; missing path → 0.5 |
| 2026-07-10 | commit | feat(SP-175): complete Step 2 — Load, explain, docs |
| 2026-07-10 | start | Step 3 in progress — testing and verification |
| 2026-07-10 | verify | typecheck + scoped vitest + npm test (1482) + coverage:check passed |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

- Provenance: synthetic_fixture (SP-175); see `scripts/fixtures/README-p-success-synthetic.md`
- Train: `npm run routing:train-p-success`
