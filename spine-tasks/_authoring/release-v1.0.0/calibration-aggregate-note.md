# Calibration aggregate note — dogfood export floor check (#110 / SP-269)

**Date:** 2026-09-06
**Author:** spine worker SP-269 (autonomous aggregation; data is operator-owned July dogfood)
**Issue:** [beettlle/pi-smart-router#110](https://github.com/beettlle/pi-smart-router/issues/110) — Partial (aggregate slice)
**Upstream evidence:** [`shadow-dogfood-evidence.md`](shadow-dogfood-evidence.md) (SP-267) — operator follow-up section
**Verdict:** **sample floor MET — 31 labeled economical-tier rows (floor ≥30); no labels invented**

---

## Source of truth

| Field | Value |
|-------|-------|
| Provenance | `dogfood-export-2026-07-14` (operator July dogfood window; SP-267 rediscovery) |
| Input export | `.pi-smart-router/exports/telemetry-contrib-2026-07-14T23-04-27-988Z.json` (operator main checkout; gitignored install-local data) |
| Input shape | telemetry-contrib v1 JSON array — the privacy-safe aggregation input (README "Community telemetry contribution") |
| Aggregate output | [`data/calibration/dogfood-20260714-aggregate.jsonl`](../../../data/calibration/dogfood-20260714-aggregate.jsonl) (committed; privacy-safe by construction) |

**Snapshot selection:** the July window produced 5 cumulative telemetry-contrib snapshots (29 → 36 → 60 → 78 → 79 rows at 19:08, 22:41, 22:48, 22:53, 23:04 UTC). Only the **latest** (79 rows) is aggregated — earlier snapshots are strict supersets-in-reverse and would double-count. Cross-snapshot union is 80 rows; 1 row present only in an earlier snapshot is not counted (honest under-count, no invention).

**Raw `dataset-*.jsonl` exports are not direct aggregate input:** dataset rows carry `prompt_fingerprint`, `prompt_length_chars`, and `message_count` keys that the ingest taint guard correctly rejects (`scripts/calibration-aggregate.ts`, SP-116). The telemetry-contrib export is the documented, purpose-built privacy-safe path and carries the same `tier` / `success_label` / `outcome_signals` fields.

## Command run (worker-executed, 2026-09-06)

```bash
# staging dir holds only the latest telemetry-contrib snapshot
npx tsx scripts/calibration-aggregate.ts --contrib-dir /tmp/sp269-contrib \
  > data/calibration/dogfood-20260714-aggregate.jsonl
# → calibration-aggregate: accepted 79 record(s) from 1 source(s)   (exit 0)
# note: invoked via tsx directly; `npm run` wraps stdout with an npm banner that corrupts JSONL redirection
```

Sanitization applied by the script (verified in output): `request_id` and pepper fields stripped; failure proxies derived (`tool_failure_chain_count`, `stop_reason_invalid`, `reprompt_rate`, `edit_distance_proxy`); taint guard active — zero rejected rows means zero prompt-bearing payloads reached ingest.

## Honest counts (no invented rows)

Counted with `npx tsx scripts/qa/count-labeled-econ.ts data/calibration/dogfood-20260714-aggregate.jsonl` (exit 0):

| Metric | Value |
|--------|-------|
| Total accepted rows | 79 |
| Tier split | zero-tier 39 / economical-cloud 32 / frontier-cloud 8 |
| **Labeled economical-tier rows** | **31** (floor ≥30 — **MET**) |
| — good | 26 |
| — bad | 5 |
| Unlabeled economical-tier rows | 40 (excluded from training labels; never fabricated) |
| Labeled frontier rows | 1 |
| Outcome signals present | `feedback_good` 27, `feedback_bad` 5 (operator used `/feedback` in July window) |

Cross-check: SP-267 operator follow-up counted `labeled_econ=31` on `dataset-2026-07-14T23-04-27-983Z.jsonl` — same window, same count, independent path. ✅

## Downstream impact (#110 train/ship slices)

- **SP-270 (train):** input ready at `data/calibration/dogfood-20260714-aggregate.jsonl` (79 enriched rows, 31 labeled econ). Train from this file; provenance is real dogfood, not synthetic fixtures. Note `MINIMUM_TRAINING_SAMPLES.hydra_projection = 100` is **not** met (79 rows) — hydra projection keeps defaults; `p_success_weights` / `isotonic_calibrator` floors (30) are met.
- **SP-271 (ship):** superseding synthetic `config/p-success-weights.json` is justified for P(success)/isotonic on these counts; the artifact provenance note above is the non-synthetic evidence trail.
- **Not done here (by design):** no weights trained, no `config/routing-calibration.json` changes (SP-271 must-not-change scope).

## Sign-off

- [x] Aggregate command run on operator telemetry-contrib export; counts recorded
- [x] Floor ≥30 labeled econ rows **met** (31); count script exit 0
- [x] Zero invented labels — unlabeled rows stay unlabeled; no synthetic fixtures counted
- [x] Privacy-safe output committed under `data/calibration/` (File Scope: `data/** privacy-safe aggregates`)
