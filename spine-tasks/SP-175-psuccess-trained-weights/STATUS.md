# SP-175: P(success) Trained Weights — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Train path and ship weights

**Status:** 🔄 In Progress

- [x] Ensure ≥30-sample train path (document or fixture/synthetic input)
- [x] Commit non-example `config/p-success-weights.json` with trained_sample_count ≥ min
- [x] Include isotonic when available; document gap otherwise
- [x] Record provenance

## Step 2: Load, explain, docs

**Status:** ⬜ Not Started

- [ ] Verify pipeline uses trained scores when artifact present
- [ ] Telemetry/explain shows raw vs used P(success); safe fallback
- [ ] Document operator train/reload without prompt text

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest for classifier / expected-cost / isotonic
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [ ] Dogfood path has non-example trained P(success) weights (≥30 samples)
- [ ] Pipeline uses trained scores when present; safe fallback when missing
- [ ] Raw vs used P(success) visible in telemetry/explain
- [ ] Operator train/reload docs without prompt text

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Isotonic loads only from `routing-calibration.json`; shipping a full undertrained bundle would activate example centroids — document gap, ship logistic weights only | Dogfood uses raw logistic until operators merge isotonic |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | start | Step 1 in progress — train path + ship weights |
| 2026-07-10 | train | Synthetic fixture 40 rows → config/p-success-weights.json (trained_sample_count=40) |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

- Provenance: synthetic_fixture (SP-175); see `scripts/fixtures/README-p-success-synthetic.md`
- Train: `npm run routing:train-p-success`
