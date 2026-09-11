# SP-284 — Hard-gate ship decision note (#168)

**Date:** 2026-09-11
**Task:** SP-284 (wave 4, release v1.1.0)
**Decision:** **DO NOT SHIP** the SP-283 verifier-grade candidate bundle. Shipped
`config/routing-calibration.json` + `config/p-success-weights.json` remain **honest-untrained**
(`neutralized_for_v1_honesty`). Issue [#168](https://github.com/beettlle/pi-smart-router/issues/168)
is **Partial** — the verifier-grade train pipeline and hard-gate ship path exist and were exercised
end-to-end, but the available corpus cannot clear the hard ECE gate.

---

## Gate evidence (SP-283 → SP-284 input)

Source: `data/calibration/verifier-grade-gate-report.json` (generated 2026-09-11T20:04:23Z by
`scripts/train-routing-calibration.ts --verifier-grade-only --packs ...`), independently confirmed
by `scripts/verify-routing-calibration.ts` on the candidate bundle (identical
`FAIL isotonic_ece_absolute`, 18/19 checks passed).

| Metric | Value |
|--------|-------|
| Contrib rows in scope | 0 / 258 (untagged legacy provenance → install-local only, SP-281) |
| Pack rows (weak excluded) | 32 / 32 (adversarial llm_judge campaign 22 + SWE-Gym CI 4 + FC-RewardBench CI 6) |
| Labeled training pool | 32 (≥ 30 floor → isotonic *trained*; fit=26 / holdout=6) |
| triage_thresholds / hydra_projection | 0 samples → honest-untrained / neutral defaults |
| holdout ECE raw | 0.3690 |
| holdout ECE calibrated | 0.2738 |
| y_knots span | 1.0000 |

| Hard gate | Threshold | Verdict |
|-----------|-----------|---------|
| `isotonic_y_span` | ≥ 0.05 | PASS (1.0000) |
| `isotonic_ece_improves` | cal ≤ raw | PASS (0.2738 ≤ 0.3690) |
| `isotonic_ece_absolute` | ≤ 0.10 | **FAIL (0.2738)** |
| **`hard_gates_passed`** | all of the above | **false** |

## Why the gate fails (honest limitations)

1. **CI-scale synthetic corpus.** The 32 verifier-grade rows are SWE-Gym / FC-RewardBench CI
   fixtures and a recorded-replay adversarial campaign on 12 synthetic tasks — not real dogfood
   outcomes. Holdout ECE on a 6-row holdout is high-variance by construction.
2. **Zero real ship-eligible contrib rows.** Both checked-in dogfood aggregates predate SP-281
   provenance tagging (untagged legacy); `/feedback` signals on them do not promote them to
   `human_feedback`. Provenance is never invented (#110 rule) — 258 rows were dropped, not
   relabeled.
3. **Triage / HyDRA untrained** under verifier-grade scoping (packs carry no triage verdicts or
   embeddings).

## What shipped instead (this task)

- `config/routing-calibration.json` — `provenance.source` stays `neutralized_for_v1_honesty`;
  `provenance.note` extended and `provenance.post_v1_verifier_grade_attempt` added recording the
  SP-283 gate failure and this keep-honest-untrained decision. Zero behavioral change
  (P(success) / isotonic / triage / hydra all remain untrained; centroids unchanged).
- `config/p-success-weights.json` — weights unchanged (all-zero, `trained_sample_count: 0`);
  additive `provenance` annotation recording the same decision (SemVer: additive keys only;
  serve-time schema strips it — behavior unchanged).
- `docs/migration-v1.md` — post-1.0 update subsection documenting the v1.1.0 gate-fail outcome,
  matching artifact provenance byte-for-byte (`neutralized_for_v1_honesty`).
- README — cross-link only (amendment 2026-09-11: README redirected out of must-change).

## Ship preconditions for a future train (closes #168)

Re-run when **≥ 30 real** `human_feedback` / `llm_judge` labeled rows exist (e.g. after #95 shadow
dogfood with SP-282 live graders — the current packs are CI fixtures):

```bash
npx tsx scripts/train-routing-calibration.ts \
  --input <aggregates.jsonl...> --packs <packs.jsonl...> \
  --verifier-grade-only \
  --output config/routing-calibration.json \
  --p-success-output config/p-success-weights.json \
  --gate-report data/calibration/verifier-grade-gate-report.json \
  --require-hard-gates
```

Ship only on **zero exit code + `hard_gates_passed: true`**, then
`npm run routing:verify-calibration` must pass on the shipped bundle and README / migration docs
must match artifact provenance byte-for-byte. Triage (≥ 50) and HyDRA (≥ 100) floors remain
separate — meeting the P(success)/isotonic floor alone does not claim those components trained.

## Issue bookkeeping

- **#168** — Partial (train pipeline + hard-gate ship path delivered; ship blocked on real
  verifier-grade corpus). Acceptance items "train on human_feedback/llm_judge only" and "no
  invented labels" are satisfied by construction; the hard-gates-pass item stays open.
- **#110** — parent epic remains open (real P(success) after verifier train is next-train slate).
- **#95 / #96** — untouched: no frugality relaxation, no encoder-default flip.
