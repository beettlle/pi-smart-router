**Current Step:** Complete (all steps done)
**Status:** Complete
**Last Updated:** 2026-09-11
**Review Level:** 1
**Review Counter:** 2
**Iteration:** 1
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Read CONTEXT + linked issue + migration honesty section (CONTEXT Phase 57; docs/migration-v1.md §"What did *not* train (honest floors)" — honest-untrained, floors 0/≥30, hard ECE gates; README §calibration "Provenance today")
- [x] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts (read-only check: `config/p-success-weights.json` `trained_sample_count: 0`; `config/routing-calibration.json` `provenance.source: "neutralized_for_v1_honesty"`, labeled_samples_* all 0 — config/** untouched)

## Step 1: Implementation

**Status:** Complete

- [x] Deliver mission outcomes within File Scope

**Evidence:**

- **`scripts/qa/dogfood-gather.sh`** (gather path): new `tag_scripted_intent` function rewrites every row of each export output (mid-ab / mid-tx / final; dataset + telemetry-contrib JSONL) with `label_provenance: "scripted_intent"` at the export boundary. Tolerates stderr noise around the summary JSON; fails loud (exit 1) when a summary names missing paths; no-ops with a warning when the export produced no summary (prior `|| true` mid-export semantics preserved). Header comment updated. Verified in isolation: pure summary, noisy summary, failed export, missing path — 4/4 expected outcomes.
- **`scripts/calibration-aggregate.ts`** (export/aggregate path): `LABEL_PROVENANCE_VALUES` (`human_feedback|llm_judge|scripted_intent`), `SHIP_ELIGIBLE_LABEL_PROVENANCE` (`human_feedback|llm_judge`), `getLabelProvenance` / `validateLabelProvenance` / `isShipEligibleProvenance` / `countLabelProvenance` / `filterShipEligibleRecords`. `assertContribRecordSafe` now rejects unknown `label_provenance` values (absent/null = legacy untagged, allowed — provenance never invented). main() prints provenance breakdown; floor warning counts **ship-eligible rows only** (`scripted_intent` + untagged never count, #168); new `--ship-grade-only` flag emits only verifier-grade rows. CLI smoke-tested: 3-row mixed dir → breakdown `human=1, scripted=1(quarantined), untagged=1`, warning `1 of 3`; `--ship-grade-only` → 1 row; invalid grade `banana` → exit 1.
- **`scripts/lib/contrib-training-samples.ts`** (train skip rule, may-change scope used): `labeledSampleFromContribRecord` returns `null` for `scripted_intent` rows — scripted labels never train (extends the existing null-label skip rule). Propagates to BOTH trainers untouched: `train-p-success-weights.parseLabeledJsonl` and `train-routing-calibration.contribToLabeledSample` funnel through this helper. Untagged rows still train install-local (synthetic fixture path preserved).
- **`README.md`** calibration notes: new **Label provenance (SP-281 / #168)** paragraph (vocabulary, ship floors = human_feedback|llm_judge only, gather auto-tag, `--ship-grade-only`); provenance-today and aggregate step cross-links updated.
- **Tests** (`tests/unit/calibration-aggregate.test.ts`, `tests/unit/train-p-success-weights.test.ts`): 6 new cases — vocabulary/ship-eligibility, provenance preserved through parse, unknown grade rejected, floors ignore scripted+untagged (40 scripted rows → ship_eligible 0), `--ship-grade-only` filter, and trainer skip for scripted rows (human_feedback/llm_judge/untagged still train). 44/44 pass across the three directly-related suites; wider blast-radius suites (train-routing-calibration, verify-routing-calibration, calibration-dry-run, isotonic, label-pack-schema) 55/55 pass.
- **Blast radius (GitNexus MCP unavailable in worker session — grep-based fallback):** `labeledSampleFromContribRecord` callers = train-p-success-weights.parseLabeledJsonl + train-routing-calibration.contribToLabeledSample + tests (LOW risk; only explicitly-tagged rows change behavior; no existing fixture carries the field). `assertContribRecordSafe` callers = internal parse paths + tests (LOW risk; only fires on out-of-vocabulary values). No existing contributor of `data/contrib` or fixtures uses `label_provenance`.
- `config/routing-calibration.json` / `config/p-success-weights.json` untouched (Must-NOT scope); `npm run typecheck` clean.

## Step 2: Testing & Verification

**Status:** Complete

- [x] Run contract testCommand
- [x] Update STATUS with evidence

**Evidence:**

- Contract: `npx vitest run tests/unit/p-success-classifier.test.ts` → **27/27 passed** (exit 0).
- Full suite: `npm test` → **137 files / 2184 tests passed** (exit 0).
- Wider blast-radius suites: train-routing-calibration (19), verify-routing-calibration, calibration-dry-run-include-excluded, isotonic-calibrator, label-pack-schema → **55/55 passed**.
- Coverage gate: `npm run coverage:check` (`testing.testWithCoverage` from `.spine/spine-config.json`) → **exit 0**.
- Typecheck: `npm run typecheck` → clean.
- Bash: `bash -n scripts/qa/dogfood-gather.sh` → SYNTAX-OK; `tag_scripted_intent` verified in isolation across 4 cases (pure summary, noisy summary, failed export → warn+exit 0, missing path → fail exit 1).
- CLI smoke: aggregate with mixed provenance dir → breakdown + ship-eligible warning (1 of 3); `--ship-grade-only` → 1 verifier-grade row; unknown grade rejected with exit 1.
- Do-NOT guardrails honored: no scripted_intent row counted toward any floor (40 scripted → ship_eligible 0); no label invented (absent provenance stays untagged and non-ship-eligible; null success never coerced — existing skip tests still green); #96 / config defaults untouched (`git diff` shows only File-Scope paths + STATUS).
