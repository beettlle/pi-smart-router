# Live SP-282 campaign — fallback note

**Date:** 2026-09-11
**Status:** Live campaign not run — `ADVERSARIAL_LABEL_API_KEY` unset; no generator/grader endpoints in env.

## Fallback (per close-#168 plan)

Expand human-only labels until ≥60 ship-eligible rows. Shadow review CLI
(`--from-existing-feedback` on Sep 9 telemetry-contrib exports) produced
**147** unique `human_feedback` ship-grade contrib rows in
`data/contrib/shadow-human-20260911.jsonl` (deduped by `row_id`).

Recorded CI campaign re-run (for pack + disagreement report shape):
`data/calibration/packs/adversarial-live-{fit,holdout,report}.*` —
`campaign_valid: true`, 22 `llm_judge` labeled, 2 disagreements left
**unadjudicated** (synthetic fixture text; no live responses to judge).

Combined ship-eligible ahead of train: human_feedback ≥231 + llm_judge packs 22 ≫ 60.

## Resume live when ready

```bash
export ADVERSARIAL_LABEL_API_KEY=…
npx tsx scripts/calibration/adversarial-label-campaign.ts \
  --input <tasks.jsonl≥40> \
  --generator … --generator … \
  --grader … --grader … \
  --output data/calibration/packs/adversarial-live-fit.jsonl \
  --holdout-output data/calibration/packs/adversarial-live-holdout.jsonl \
  --report data/calibration/packs/adversarial-live-report.json
```

Then adjudicate `report.disagreements` via `human-label-review.ts --report … --tasks …`.
