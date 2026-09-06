# Shadow dogfood evidence — release gate decision artifact (v1.0.0 / #95)

**Date:** 2026-09-06
**Author:** spine worker SP-267 (autonomous scaffold; live session collection is human-owned)
**Issue:** [beettlle/pi-smart-router#95](https://github.com/beettlle/pi-smart-router/issues/95) — shadow quality/cost dogfood before relaxing frugality
**Protocol:** [`docs/qa/shadow-dogfood-protocol.md`](../../../docs/qa/shadow-dogfood-protocol.md) (hardened in SP-266)
**Verdict:** **sample floor UNMET — keep frugality; gate recommendation below**

---

## TL;DR gate recommendation

| Decision | Recommendation | Basis |
|----------|----------------|-------|
| Frugality defaults | **KEEP (do not relax)** | Zero human dogfood sessions collected; no evidence basis for relaxation. TwinRouterBench over-routing soft signal exists but protocol requires ≥2 independent human dogfood windows before it can motivate relaxation. |
| Quality-first posture | **Conditional — not proven, not contradicted** | Hard fixture gates pass (functional smoke green). No human evidence of under-routing or quality failures — but also no human evidence at all. |
| #95 closure | **Needs more data (no-go for closure on quality claims)** | Live session matrix (protocol rows 1–6) not executed by operator; no labeled exports present. |
| Absolute release gates | **No change** | Hard gates green; nothing in this artifact justifies touching `config/release-gates.json`. |

---

## Sample floor status (honest counts — no invented rows)

| Metric | Value | Floor | Met? |
|--------|-------|-------|------|
| Human dogfood sessions (matrix rows 1–6) | **0** | ≥5 sessions covering all rows | ❌ |
| Labeled economical-tier rows from human exports | **0** | ≥30 (`minimum_training_samples`) | ❌ |
| Track B labeled dogfood exports attached | **0** | ≥1 with `success_label`/`min_tier`/`min_model_id` | ❌ |
| Independent dogfood windows w/ soft-feed runs | **0** | ≥2 (for any frugality discussion) | ❌ |

What *does* exist in-repo:

- `data/contrib/example.json` — **1 row, synthetic placeholder** (all-zero session hash, `feedback_good` signal). Counted via `scripts/qa/count-labeled-econ.ts` (JSONL-converted copy): `labeled_econ=1, floor_met=false, need=29`. This is a checked-in format example, **not dogfood evidence**.
- `tests/eval/dogfood-track-b/synthetic-labeled-export.json` — synthetic test fixture (2 records). Used below only to prove the soft-feed CLI path works; contributes **zero** evidence rows.
- `.pi-smart-router/qa-runs/` — no operator QA run archives present in this checkout.

**Conclusion:** the #95 evidence floor is unmet. No quality claims are closed by this artifact.

## Commands run (worker-executed, offline/dry-run only)

All from package root of this worktree, 2026-09-06:

| # | Command | Result | Meaning |
|---|---------|--------|---------|
| 1 | `npm run release:functional-smoke` | **PASS** — `release-gates: PASS (baseline v0.6.0)` | Hard fixture gates green; quality-first posture holds on fixtures |
| 2 | `npm run routing:assert-release-gates:corpus-report` | Soft FAIL (report-only, exit 0): `mean_over_routing_rate 0.868056 > max 0.15`; baseline regression `+0.743056 > 0.05` | Expected TwinRouterBench over-routing soft signal — intentional per protocol; **not** a release blocker, **not** sufficient alone for frugality relaxation |
| 3 | `npm run qa:dogfood-soft-feed -- --export tests/eval/dogfood-track-b/synthetic-labeled-export.json` | PASS (exit 0); adapted 2 records → 1 session fixture; metrics `{capability 1, quality 1, over-routing 0, pin 1}`; archived to `.pi-smart-router/qa-runs/dogfood-soft-feed-20260906T173752Z/` | **Scaffold validation only** — proves the SP-266 soft-feed path works end-to-end on a synthetic labeled export. Synthetic fixture; excluded from evidence counts |
| 4 | `npx tsx scripts/qa/count-labeled-econ.ts <data/contrib/example.json as JSONL>` | exit 2 (floor unmet): `labeled_econ=1, need=29` | Only contrib data present is the synthetic example row |

Commands **not** run (human-owned, require live pi sessions): `/model smart-router/auto` session matrix, `/smart-router status|history|stats`, `/smart-router export dataset`, `/smart-router export telemetry-contrib`, `npm run qa:shadow-dogfood` against a live window, `qa:dogfood-soft-feed` against a real labeled export.

## Blocker statement (for #95)

> Live dogfood session collection is **human-owned** (SP-267 mission item 5) and has not been performed. There are no operator exports in `data/contrib/` or `.pi-smart-router/qa-runs/` in this checkout. Per the protocol and the #110 calibration floors, we do not invent labeled rows, do not count synthetic fixtures as evidence, and do not relax frugality without ≥2 independent human dogfood windows showing over-routing-only soft FAILs with hard gates green.

**What unblocks #95 closure:**

1. Operator runs the SP-266 session matrix (protocol § Session matrix, rows 1–6; ≥5 sessions).
2. `/smart-router export dataset` + `telemetry-contrib`; privacy check (no prompt bodies).
3. `npm run qa:shadow-dogfood` + `npm run qa:dogfood-soft-feed -- --export <labeled export>`.
4. Update this artifact (or a successor) with real counts; only then revisit gate recommendation.

## Honest interpretation of existing signals

- **Over-routing soft signal is real but corpus-derived.** TwinRouterBench reports `mean_over_routing_rate ≈ 0.868` vs gate `≤ 0.15`. The protocol explicitly classifies this as intentional soft signal, and the frugality-relaxation bar additionally requires human dogfood windows. Treating the corpus number alone as relaxation evidence would violate the protocol.
- **No quality regression signal.** Hard gates pass; capability adequacy / quality retention / pin preservation are green on fixtures and on the synthetic soft-feed dry-run. There is no evidence of under-routing — but absence of human sessions means this is unverified under real workloads.
- **Calibration floors unmet → downstream #110 impact.** SP-269 (aggregate, ≥30 labeled econ rows) and SP-270 (train P(success)/isotonic) depend on this volume. With 0 human rows, those packets should proceed on operator-local/synthetic provenance only, exactly as the v1.0.0 manifest risk table anticipates ("slip #110 ship if floors unmet").

## Sign-off

- [x] Evidence artifact written with honest counts; zero invented labels
- [x] Hard release gates verified green on this checkout
- [x] Gate recommendation: **keep frugality**; quality-first posture **conditional/unproven under live load**
- [ ] #95 closure — **blocked on human dogfood sessions** (needs more data)

---

*Worker scope note: per SP-267 mission item 5, this artifact is the autonomous scaffold + dry-run evidence. Live session collection, sign-off form, and any gate-relaxation decision remain operator-owned.*

---

## Operator follow-up (2026-09-06 land loop) — historical dogfood rediscovered

While waiting on SP-273, operator re-scanned **gitignored** `.pi-smart-router/` (SP-267 scaffold only searched git-tracked contrib):

| Source | Rows | labeled_econ | floor (≥30) |
|--------|------|--------------|-------------|
| `exports/dataset-2026-07-14T23-04-27-983Z.jsonl` | 79 | **31** | **met** |
| `exports/dataset-2026-07-14T22-53-22-549Z.jsonl` | 78 | 29 | unmet (−1) |
| `qa-runs/dogfood-gather-20260714T224155Z/` | matrix A–E session logs | mid/final export notes | historical window |

Offline companion re-run today:

- `npm run qa:shadow-dogfood` → hard gates PASS; corpus soft FAIL archived under `.pi-smart-router/qa-runs/20260906T175136Z/`
- `qa:dogfood-soft-feed` against the July **dataset JSONL** → **SKIP/error** (expects Track B document JSON, not dataset JSONL) — do not invent Track B labels from JSONL

### Updated recommendation

| Decision | Updated |
|----------|---------|
| Calibration sample floor (#110 path) | **Historical July export meets ≥30 labeled_econ** for aggregate/train packets (SP-269+) — use `dataset-2026-07-14T23-04-27-983Z.jsonl` with provenance `dogfood-export-2026-07-14` |
| Frugality defaults | **Still KEEP** — protocol still wants ≥2 *independent* soft-feed windows in Track B form; July data is one historical window and is not Track-B soft-feedable without adapter |
| #95 qualitative matrix (rows 1–6 today) | **Still needs more data for a fresh 1.0 window** — July gather logs exist but are not a 2026-09-06 matrix re-run |

*No invented labels. Counts from `scripts/qa/count-labeled-econ.ts` on existing exports.*

