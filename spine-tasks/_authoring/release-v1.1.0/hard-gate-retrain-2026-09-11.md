# Hard-gate retrain failure — 2026-09-11 (close #168)

**Decision:** DO NOT SHIP candidate weights. Shipped `config/routing-calibration.json` and
`config/p-success-weights.json` remain `neutralized_for_v1_honesty`.

## Command

```bash
npx tsx scripts/calibration-aggregate.ts --contrib-dir data/contrib --ship-grade-only \
  > /tmp/ship-grade-agg.jsonl

npx tsx scripts/train-routing-calibration.ts \
  --input /tmp/ship-grade-agg.jsonl \
  --packs data/calibration/packs/adversarial-live-fit.jsonl \
          data/calibration/packs/adversarial-live-holdout.jsonl \
  --verifier-grade-only \
  --output data/calibration/candidate-routing-calibration.json \
  --p-success-output data/calibration/candidate-p-success-weights.json \
  --gate-report data/calibration/verifier-grade-gate-report.json \
  --require-hard-gates
```

## Result (`hard_gates_passed: false`)

| Gate | Result | Detail |
|------|--------|--------|
| `isotonic_y_span` | PASS | y_span=1.0000 (≥ 0.05) |
| `isotonic_ece_absolute` | PASS | ece_calibrated=0.0609 (≤ 0.10) |
| `isotonic_ece_improves` | **FAIL** | ece_calibrated=0.0609 vs ece_raw=0.0490 |

Pool (train that wrote the gate report): **231** pre-dedupe `human_feedback` lines
(+ overlap across two export files) + **22** `llm_judge` pack rows = **253** labeled.
After contrib dedupe by `row_id`: **147** unique `human_feedback` (still ≫20 / ≫60
with packs). Holdout n=51 (fit=202). Absolute ECE cleared the prior 0.27 failure;
isotonic no longer helps vs already-well-calibrated logistic on this corpus.

## Diagnostic (HF-only, not shipped)

Same improve-gate fail with stronger raw: ece_raw=0.0046, ece_cal=0.0290.
Confirms failure mode is **isotonic harming an already-calibrated logistic**, not
sample starvation.

## What we did not do

- No copy into `config/*`
- No ECE threshold relaxation
- No invented `human_feedback` on untagged legacy rows
- #168 left open until `hard_gates_passed: true`

## Next levers (no gate relaxation)

1. Live SP-282 (≥40 tasks) when API credentials available — diversify failure modes so raw ECE is imperfect and isotonic can help.
2. Identity / skip-isotonic ship path when cal ≥ raw (product change; needs explicit issue — not this train).
3. Broader #95 matrix sessions with deliberate hard failures (not only prior feedback_good-heavy exports).
4. Keep collecting until improve-gate passes; re-run verify + close #168 only on PASS.
