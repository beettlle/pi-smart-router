# Session-holdout retrain — 2026-09-12 (v1.1 A2)

**Decision:** Keep Sep 12 shipped `config/*` (hash-split isotonic ECE PASS).
Session-partition isotonic ECE **FAIL** absolute gate by 0.0005 — do not promote.

## What changed in code

`trainRoutingCalibrationBundleWithMetrics` now prefers campaign
`session_fit` / `session_holdout` pack signals for the isotonic fit/ECE split
when present (instead of re-hashing the merged pool).

## Command

```bash
npx tsx scripts/train-routing-calibration.ts \
  --input data/calibration/ship-grade-agg-20260912.jsonl \
  --packs data/calibration/packs/adversarial-live-fit.jsonl \
          data/calibration/packs/adversarial-live-holdout.jsonl \
  --verifier-grade-only \
  --output data/calibration/candidate-routing-calibration.json \
  --p-success-output data/calibration/candidate-p-success-weights.json \
  --gate-report data/calibration/session-holdout-retrain-gate-report-20260912.json \
  --require-hard-gates
```

Exit **1**. Report: `data/calibration/session-holdout-retrain-gate-report-20260912.json`.

## Result (`hard_gates_passed: false`)

| Gate | Result | Detail |
|------|--------|--------|
| `isotonic_y_span` | PASS | y_span=0.7500 (≥ 0.05) |
| `isotonic_ece_improves` | PASS | ece_calibrated=0.1005 ≤ ece_raw=0.1142 |
| `isotonic_ece_absolute` | **FAIL** | ece_calibrated=0.1005 (> 0.10) |

Split: fit=213 (147 HF + 66 session_fit), holdout=30 (session_holdout only).

## vs shipped Sep 12 PASS (hash split)

| | Shipped (hash) | Session holdout |
|--|----------------|-----------------|
| holdout n | 49 | 30 |
| ece_raw | 0.1142 | 0.1142 |
| ece_calibrated | **0.0645** | **0.1005** |
| hard_gates_passed | true | false |

True session holdout is stricter; absolute ECE misses the ceiling by ~5e-4.
Ship remains `verifier_grade_train_2026-09-12` with hash-split ECE evidence
in `data/calibration/verifier-grade-gate-report.json`.

## Follow-ups

- Grow session_holdout labeled volume / negatives, then re-run with
  `--require-hard-gates` and promote only on exit 0.
- Do not relax ECE ≤ 0.10 to clear this miss.
