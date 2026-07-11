# NEW ISSUE — Behavioral calibration adoption (non-synthetic)

**Suggested title:** Ship real P(success) + isotonic calibration from behavioral dogfood signals

**Suggested labels:** enhancement, routing, calibration

**Action:** Create a new GitHub issue. If #74 is still open only for “implementation code,” comment-close #74 and point here for adoption. If #74 is already closed, this is the follow-on.

---

## Problem

Checked-in `config/p-success-weights.json` is synthetic-fixture trained. Serve-time isotonic expects `config/routing-calibration.json`, but only `.example` is checked in — pipeline falls back to raw logistic / identity calibrator. Quality thresholds and over-routing behavior remain uncalibrated on real pi traces. Manual `/smart-router feedback` is optional intrusion; passive signals should be the primary bootstrap path.

## Acceptance criteria

- [ ] Document zero-manual-label bootstrap: which outcome fields (model override, compaction pin break, loop-escalation proxies, stop_reason) are sufficient to train without `/feedback`.
- [ ] Aggregate dogfood exports (`routing:calibration-aggregate` / dataset export) meeting ≥30 sample floor where applicable.
- [ ] Train and verify: `npm run routing:train-p-success` + `npm run routing:train-calibration` (or documented equivalents).
- [ ] Ship checked-in `config/routing-calibration.json` (or document why it remains operator-local) with provenance noting non-synthetic sources.
- [ ] Replace or clearly supersede synthetic-only weights when real sample floors are met (CI verify path still green).
- [ ] README calibration section updated for the behavioral-first path.
- [ ] Soft ECE / dry-run packs still enforced per existing scripts — no inventing labels.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Collect exports via shadow dogfood | Human QA |
| Aggregate, train, verify, PR artifacts | Autonomous |

## Commands / files

- `SMART_ROUTER_DATASET=1`
- `/smart-router export dataset`
- `npm run routing:calibration-aggregate`
- `npm run routing:train-p-success`
- `npm run routing:train-calibration`
- `npm run routing:verify-calibration`
- `config/p-success-weights.json`
- `config/routing-calibration.json.example`
- `docs/qa/shadow-dogfood-protocol.md`

## Out of scope

- FrugalGPT cascades
- Re-implementing isotonic/PAV code (#74 implementation)
- Flipping encoder defaults (#96)

## Links

- Depends on dogfood volume from #95 / QA protocol
- Related: #74 (implementation), #102 (label packs)
