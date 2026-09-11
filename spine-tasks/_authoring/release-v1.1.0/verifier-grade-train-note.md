# SP-283 — Verifier-grade train notes (#168)

**Date:** 2026-09-11
**Task:** SP-283 (wave 3, release v1.1.0)
**Outcome:** Train pipeline delivered and exercised end-to-end; **hard ECE gates FAIL** on the
available verifier-grade corpus → candidate artifacts are **evidence only, not ship-grade**.
SP-284 keeps honest-untrained per the manifest risk plan (Partial #168).

---

## What was built

`scripts/train-routing-calibration.ts` now supports verifier-grade ship trains:

| Addition | Behavior |
|----------|----------|
| `--packs <jsonl...>` | Joins privacy-safe label packs (`scripts/lib/label-pack-schema.ts`) into the P(success)/isotonic labeled pool |
| `--verifier-grade-only` | Contrib rows train **only** with `label_provenance: human_feedback \| llm_judge` (SP-281); untagged legacy rows and `scripted_intent` rows are dropped from every pool (labeled samples, triage fit, hydra, centroids) |
| Weak-label guard | Pack rows tagged `exclude_from_holdout_ece` (SP-190 weak labels) **never** join a ship train — they may warm-start dry-run fits only (SP-201) |
| `--p-success-output <path>` | Redirects the standalone P(success) weights write (default stays `config/p-success-weights.json` for back-compat) |
| `--gate-report <path>` | Writes the SP-283 hard-gate JSON report (inputs accounting, trained counts, ECE, per-gate verdicts, `hard_gates_passed`) |
| `--require-hard-gates` | Exit 1 when gates fail (artifacts + report still written as evidence) |

Hard-gate thresholds mirror `verify-routing-calibration.ts`
(`CALIBRATION_HARD_ECE_THRESHOLD = 0.10`, `CALIBRATION_MIN_Y_KNOT_SPAN = 0.05`,
`exclude_from_holdout_ece` signal) — parity locked by unit tests in
`tests/unit/train-routing-calibration.test.ts`. `hard_gates_passed` is true **only** when the
isotonic artifact is trained (≥ floor) AND every hard gate passes; honest-untrained is never a
ship pass.

## Aggregate + train run (offline, no services)

1. **Adversarial llm_judge campaign** (SP-282 harness, recorded CI replay):
   `adversarial-label-campaign.ts` → `data/calibration/packs/adversarial-llm-judge-{fit,holdout}.jsonl`
   — campaign VALID: 22 labeled (11 fit / 11 holdout), 2 disagreements excluded,
   negative fraction 0.2273 ≥ 0.20, 5 distinct failure scores.
2. **SWE-Gym verifier pack** (SP-189 converter):
   `ingest-swe-gym-labels.ts` → `data/calibration/packs/swe-gym-ci.jsonl` — 4 accepted / 2 skipped.
3. **FC-RewardBench pack** (SP-190 converter):
   `ingest-fc-rewardbench-labels.ts` → `data/calibration/packs/fc-rewardbench-ci.jsonl` — 6 accepted / 2 skipped.
4. **Verifier-grade train** over the two checked-in dogfood aggregates (258 contrib rows) + 32 pack rows:

```bash
npx tsx scripts/train-routing-calibration.ts \
  --input <dogfood-20260714+20260909 aggregates> \
  --packs data/calibration/packs/adversarial-llm-judge-fit.jsonl \
          data/calibration/packs/adversarial-llm-judge-holdout.jsonl \
          data/calibration/packs/swe-gym-ci.jsonl \
          data/calibration/packs/fc-rewardbench-ci.jsonl \
  --verifier-grade-only \
  --output data/calibration/verifier-grade-routing-calibration.json \
  --p-success-output data/calibration/verifier-grade-p-success-weights.json \
  --gate-report data/calibration/verifier-grade-gate-report.json
```

## Results (`data/calibration/verifier-grade-gate-report.json`)

| Metric | Value |
|--------|-------|
| Contrib rows in scope | **0 / 258** (all untagged legacy provenance → install-local only, SP-281) |
| Pack rows (weak excluded) | 32 / 32 (0 weak) |
| Labeled training pool | **32** (≥ 30 floor → isotonic *trained*) |
| triage_thresholds | 0 samples → honest-untrained (threshold 15 default) |
| hydra_projection | 0 samples → neutral defaults |
| holdout split | fit=26, holdout=6 |
| holdout ECE raw | 0.3690 |
| holdout ECE calibrated | 0.2738 |
| y_knots span | 1.0000 |

| Hard gate | Verdict |
|-----------|---------|
| `isotonic_y_span` ≥ 0.05 | PASS (1.0000) |
| `isotonic_ece_improves` (cal ≤ raw) | PASS (0.2738 ≤ 0.3690) |
| `isotonic_ece_absolute` ≤ 0.10 | **FAIL** (0.2738) |
| **`hard_gates_passed`** | **false** |

Independent confirmation: `verify-routing-calibration.ts` on the candidate bundle reports the
identical failure (`FAIL isotonic_ece_absolute: ece_calibrated=0.2738 (max 0.1)`, 18/19 passed) —
the ship-path verify gate will reject this candidate.

## Honest limitations (for SP-284 / #168)

1. **CI-scale synthetic corpus.** The 32 verifier-grade rows are SWE-Gym / FC-RewardBench CI
   fixtures and a recorded-replay adversarial campaign on 12 synthetic tasks — not real dogfood
   outcomes. ECE on a 6-row holdout is high-variance by construction.
2. **Zero real ship-eligible contrib rows exist.** Both dogfood aggregates predate SP-281
   provenance tagging (untagged legacy) and `/feedback` signals on them do not promote them to
   `human_feedback` — provenance is never invented (#110 rule).
3. **Triage / hydra untrained** under verifier-grade scoping (0 ship-eligible contrib rows; packs
   carry no triage verdicts or embeddings).
4. Candidate artifacts under `data/calibration/` are **evidence only** — `config/*.json` ship
   artifacts were not touched (Must-NOT scope; `git status` clean on `config/`).

## Recommendation to SP-284

Do **not** ship the candidate bundle. Keep v1.0 honest-untrained defaults, document Partial #168,
and leave the verifier-grade train path (this task) as the operator entry point for when ≥30 real
`human_feedback` / `llm_judge` rows exist (e.g. after #95 shadow dogfood with SP-282 live
graders). Re-run the command above with `--require-hard-gates`; a zero exit code plus
`hard_gates_passed: true` is the ship precondition.
