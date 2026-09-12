# Hard-gate retrain PASS — 2026-09-12 (close #168 ship precondition)

**Decision:** SHIP candidate weights. `config/routing-calibration.json` and
`config/p-success-weights.json` promoted from verifier-grade train
(`provenance.source: verifier_grade_train_2026-09-12`).

## Command

```bash
npx tsx scripts/calibration-aggregate.ts \
  --contrib-dir data/contrib \
  --ship-grade-only \
  > data/calibration/ship-grade-agg-20260912.jsonl

npx tsx scripts/train-routing-calibration.ts \
  --input data/calibration/ship-grade-agg-20260912.jsonl \
  --packs data/calibration/packs/adversarial-live-fit.jsonl \
          data/calibration/packs/adversarial-live-holdout.jsonl \
  --verifier-grade-only \
  --output data/calibration/candidate-routing-calibration.json \
  --p-success-output data/calibration/candidate-p-success-weights.json \
  --gate-report data/calibration/verifier-grade-gate-report.json \
  --require-hard-gates
```

Train exit **0**. Gate report: `data/calibration/verifier-grade-gate-report.json`.

## Result (`hard_gates_passed: true`)

| Gate | Result | Detail |
|------|--------|--------|
| `isotonic_y_span` | PASS | y_span=1.0000 (≥ 0.05) |
| `isotonic_ece_absolute` | PASS | ece_calibrated=0.0645 (≤ 0.10) |
| `isotonic_ece_improves` | PASS | ece_calibrated=0.0645 ≤ ece_raw=0.1142 |

## Pool

| Input | Count |
|-------|-------|
| Contrib ship-eligible (`human_feedback`) | 147 |
| Live `llm_judge` packs (fit+holdout) | 96 |
| Labeled training pool | 243 |
| Isotonic fit / holdout | 194 / 49 |
| Triage samples | 57 |
| Hydra samples | 0 (honest-untrained projection defaults) |

Pack composition: 86 SP-282 campaign agreements + 10 panel-adjudicated disagreement rows
(`panel_adjudication` / `panel_majority`). No CI/synthetic packs mixed in.

## Verify

```bash
npx tsx scripts/verify-routing-calibration.ts \
  data/calibration/candidate-routing-calibration.json
# → 19/19 passed

npx tsx scripts/verify-routing-calibration.ts \
  config/routing-calibration.json
# → 19/19 passed (after promote)
```

## What we did

- Promoted candidates into `config/*` with provenance stamp
- Left ECE ≤ 0.10 and improve-gate thresholds unchanged
- Did not invent provenance on untagged legacy rows

## vs prior FAIL (2026-09-11)

Sep 11: absolute ECE PASS (0.0609) but improve FAIL (cal 0.0609 > raw 0.0490) on
147 HF + 22 pack rows. Sep 12 live corpus (96 packs, more diverse negatives /
panel rows) raised raw ECE to 0.1142 so isotonic improvement cleared the gate.

## Follow-ups (out of this note)

- Commit / PR for `config/*` + note when operator requests
- npm publish / v1.1.0 tag remains a separate release decision
- Comment/close GitHub #168 when the ship commit lands
