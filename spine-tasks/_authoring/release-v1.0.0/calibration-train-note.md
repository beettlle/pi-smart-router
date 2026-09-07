# Calibration train + verify note — dogfood P(success) + isotonic (#110 / SP-270)

**Date:** 2026-09-06
**Author:** spine worker SP-270 (autonomous train + verify; data is operator-owned July dogfood)
**Issue:** [beetttle/pi-smart-router#110](https://github.com/beettlle/pi-smart-router/issues/110) — Partial (train + verify slice)
**Upstream evidence:** [`calibration-aggregate-note.md`](calibration-aggregate-note.md) (SP-269) — floor check on the same aggregate
**Verdict:** **train + verify GREEN on real aggregates — 32 labeled samples (floor ≥30 MET); zero labels invented**

---

## Commands run (worker-executed, 2026-09-06)

```bash
# 1. Standalone P(success) weights from the real dogfood aggregate
npm run routing:train-p-success -- --input data/calibration/dogfood-20260714-aggregate.jsonl
# → wrote 32 sample weights to config/p-success-weights.json   (exit 0)

# 2. Full calibration bundle (hydra/triage/centroids + p_success + isotonic)
npm run routing:train-calibration -- --input data/calibration/dogfood-20260714-aggregate.jsonl
# → wrote bundle v2 (79 training row(s)) to config/routing-calibration.json
# → p_success samples=32, triage samples=0, hydra samples=0, isotonic samples=32
# → isotonic holdout ECE: raw=0.0695, calibrated=0.0208, fit=26, holdout=6, knots=18

# 3. Standalone re-run (last) so p-success-weights.json keeps honest provenance
#    (train-calibration's standalone refresh writes bundle p_success_weights
#     without the provenance block; weights are identical — deterministic
#     hash-split on aggregate-row-N ids)
npm run routing:train-p-success -- --input data/calibration/dogfood-20260714-aggregate.jsonl

# 4. Contract testCommand — full verify (tsc build + verifier)
npm run routing:verify-calibration
# → verify-routing-calibration: 15/15 passed (bundle v2)   (exit 0)

# 5. Soft ECE / dry-run packs (SP-191 semantics preserved)
npm run routing:calibration-dry-run                       # → SAMPLE_STARVED report-only (exit 0)
npx tsx scripts/verify-routing-calibration.ts --dry-run-packs --ci-fixtures --enforce-soft-ece
# → SAMPLE_STARVED report-only — no soft pass/fail, exit 0 (starved packs never fail)

npm run routing:verify-calibration -- --skip-embed        # → 2 passed (release:functional-smoke subset)
```

## Metrics (recorded in SP-270 STATUS)

| Metric | Value |
|--------|-------|
| Training rows (aggregate) | 79 |
| Labeled samples trained | **32** (27 good / 5 bad) |
| — econ tiers (zero-tier + economical-cloud) | 31 (26 good / 5 bad) — matches SP-269 counter exactly |
| — frontier-cloud | 1 (good) |
| Unlabeled rows | 47 — **skipped, never coerced** |
| P(success) floor | ≥30 — **MET** (32) |
| Isotonic holdout ECE | raw 0.0695 → calibrated **0.0208** (fit 26 / holdout 6, 18 knots) |
| Triage thresholds floor | ≥50 labeled — NOT met → defaults kept (trained_sample_count 0) |
| Hydra projection floor | ≥100 rows — NOT met → defaults kept (trained_sample_count 0) |
| Routing centroids | bootstrap 4 clusters (verify PASS) |
| verify-calibration | **15/15 PASS** (bundle v2) |

Label reconciliation: SP-269's `qa/count-labeled-econ.ts` reports 31 labeled econ (its `ECON_TIERS` = zero-tier + economical-cloud, 26 good/5 bad) + 1 labeled frontier = 32 — identical row set to the production `deriveSuccessLabelFromExportRow` derivation used by the trainers. No verifier-proxy-only labels were invented: every trained row carries an explicit boolean `success_label` or a feedback signal.

## Script changes (train path was broken for real aggregates)

Aggregate output from `routing:calibration-aggregate` strips `request_id` (install-local pepper policy), but `parseTrainingExportLine` hard-required it — real aggregates trained **zero** samples before this fix. `scripts/**` is in-scope for exactly this case ("if train path broken").

1. **`scripts/lib/contrib-training-samples.ts` (new)** — shared contrib-row → labeled-sample parser. Accepts request_id-less rows via a deterministic `aggregate-row-<index>` fallback id (keeps isotonic hash splits reproducible without reintroducing an identifier). Rows whose derived label is `null` are skipped — never coerced (#110 rule).
2. **`scripts/train-p-success-weights.ts`** — `parseLabeledJsonl` routes through the shared helper; provenance now records the actual training input (`training_input`, `task` SP-175 only for the synthetic fixture) instead of hardcoding SP-175.
3. **`scripts/train-routing-calibration.ts`** — `contribToLabeledSample` routes through the same helper (same fallback-id semantics).
4. **`tests/unit/train-p-success-weights.test.ts`** — coverage for aggregate-row parsing: unlabeled rows skipped, fallback ids deterministic, explicit ids preserved.

GitNexus impact before edit: `train-p-success-weights.ts` upstream = 0 callers, **LOW risk**.

## Artifacts staged on this lane (for SP-271 — wave 4)

| Artifact | State | Notes |
|----------|-------|-------|
| `config/routing-calibration.json` | new (untracked → committed on lane) | bundle v2, 79 rows, verify 15/15 |
| `config/p-success-weights.json` | tracked, superseded synthetic → real dogfood | 32 samples ≥30 floor; provenance `{source: operator_export, training_input: dogfood-20260714-aggregate.jsonl, task: SP-270}`; weights byte-identical to bundle's `p_success_weights` |

Per mission item 4, artifacts stay local/worktree (committed on lane only for handoff) — **SP-271 ships the checked-in files** (its Must-change scope) and owns the README + final provenance notes. The bundle itself carries no `provenance` key (Zod-validated schema; the standalone file's provenance is stripped on load by design).

## SP-271 handoff pointers

- Bundle floors not met (triage ≥50, hydra ≥100) — defaults kept; SP-271 should NOT advertise triage/hydra as dogfood-trained.
- Standalone `config/p-success-weights.json` must be written by `train-p-success` **last** (or SP-271 adds provenance to the bundle's standalone refresh) — otherwise the provenance block is dropped by `train-calibration`'s refresh.
- Soft ECE packs remain SAMPLE_STARVED report-only (13 rows / 10 ECE-eligible < 30) — enforcement (`--enforce-soft-ece`) correctly does not fail starved packs; no labels were invented to un-starve them.
- **Test isolation must land before SP-271 commits the bundle repo-wide.** SP-147's default `routingCalibrationPath` (`config/routing-calibration.json`) is picked up by `loadClusterMatcherCatalog` / isotonic loading / `RouterPipeline` whenever a bundle file exists. With a trained bundle present in the working tree, 9 tests fail (3× `cluster-matcher.test.ts` — bundle centroid ids validated against each test's temp catalog; 6× `router-pipeline.test.ts` SP-105/106/175/223 — retrained bundle shifts P(success) routing behavior). Isolation-verified 2026-09-07: base commit 70/70 green; new `p-success-weights.json` alone still 70/70; failures appear **only** when the local bundle exists. Canonical state (untracked file, absent on CI/fresh clones) is fully green: **2171/2171** + coverage gates pass (91.57% lines). Not a product bug — bundle centroid ids match the shipped catalog exactly. Fix belongs to tests/src (out of SP-270 File Scope): pin `routingCalibrationPath` in affected tests, or add an env-var override for the default bundle path.

## Sign-off

- [x] train-p-success green on real aggregate (32 samples, exit 0)
- [x] train-calibration green on real aggregate (bundle v2, 79 rows, exit 0)
- [x] verify-calibration 15/15 PASS (contract testCommand)
- [x] dry-run packs + `--enforce-soft-ece` correct (SAMPLE_STARVED report-only, exit 0)
- [x] Zero invented labels — 47 unlabeled rows skipped by parser and trainers
- [x] No encoder default flips (#96 untouched); artifacts staged for SP-271 only
- [x] Full suite green in canonical state: npm test 2171/2171, coverage:check pass (2026-09-07; local bundle set aside, md5-verified restore)
