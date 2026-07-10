# SP-175: P(success) Trained Weights — Status

**Current Step:** 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Train path and ship weights

**Status:** ⬜ Not Started

- [ ] Ensure ≥30-sample train path (document or fixture/synthetic input)
- [ ] Commit non-example `config/p-success-weights.json` with trained_sample_count ≥ min
- [ ] Include isotonic when available; document gap otherwise
- [ ] Record provenance

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
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
