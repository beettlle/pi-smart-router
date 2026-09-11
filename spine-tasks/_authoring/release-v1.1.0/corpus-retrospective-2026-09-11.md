# Corpus retrospective — close #168 train (2026-09-11)

## Verdict

**Go/no-go on publish:** **no-go.** Hard gates still FAIL (`isotonic_ece_improves`).
Absolute ECE is now in budget (0.0609 ≤ 0.10) — progress vs the n=6 / ECE 0.27
partial — but isotonic does not beat raw logistic on this dogfood-heavy set.
Shipped config stays honest-untrained. Do not publish npm `1.1.0` on this HEAD
for #168 closure.

## Provenance mix

| Source | Count | Notes |
|--------|------:|-------|
| `human_feedback` (ship-grade contrib) | 147 unique | SP-287 review of Sep 9 telemetry-contrib via `--from-existing-feedback` (deduped by `row_id`) |
| `llm_judge` packs | 22 | Recorded CI campaign re-run (`adversarial-live-*`); live API unavailable |
| `scripted_intent` / untagged | 0 / 1 | Quarantined / dropped by `--ship-grade-only` |
| Combined labeled train pool | 253 (pre-dedupe train) / ≥169 unique | ≥60 plan floor met; ≥20 human_feedback met |

Negative / class balance: dogfood feedback skews toward prior operator labels;
live adversarial negatives still thin (CI pack only).

## Calibration metrics (ship attempt)

- Holdout ECE raw **0.0490** → cal **0.0609** (improve FAIL)
- y_span **1.0** PASS; absolute ECE PASS
- Holdout n=**51** (was 6) — size no longer the binding constraint
- HF-only diagnostic: raw **0.0046** / cal **0.0290** — same improve FAIL, stronger signal that logistic is already calibrated

## Disagreements / human overrides

- Live SP-282: **not run** (`ADVERSARIAL_LABEL_API_KEY` unset) — see `live-sp282-fallback-note.md`
- CI report: 2 disagreements left unadjudicated (synthetic fixture text only)
- Shadow path: reaffirmed existing `feedback_good`/`feedback_bad` through review CLI (no polarity invention)

## Coverage vs #95 matrix

| Matrix cell | Status |
|-------------|--------|
| Trivial | Likely present in Sep 9 exports; not freshly re-run this session |
| Code + tools | Present in exports |
| Planning | Present (`turn_type: planning` in aggregate sample) |
| Multi-turn pin | Unknown / not freshly verified |
| Hard task / deliberate failures | Under-represented — raw ECE≈0 suggests few hard negatives |

Operator should still run ≥5 live pi sessions per `docs/qa/shadow-dogfood-protocol.md`
for a clean #95 sign-off; this train used existing exports as human-only fallback.

## Floors still blocked

| Artifact floor | Need | Have | Status |
|----------------|-----:|-----:|--------|
| Isotonic / P(success) ship | hard gates | FAIL improve | blocked |
| Triage thresholds | ≥50 | 89 samples trained | **met sample count**; not shipped while hard gates fail |
| HyDRA projection | ≥100 embeddings | **0** | blocked — SP-285 `--embeddings` export needed on labeled dogfood |

## Next-train slate (operator)

1. **Live SP-282** — supply `ADVERSARIAL_LABEL_API_KEY` + ≥2 generators + ≥2 graders; ≥40 tasks / ≥8 sessions; adjudicate disagreements in review CLI.
2. **#95 fresh matrix** — 5 sessions with deliberate hard failures + `/smart-router feedback`; review → `human_feedback` (prefer interactive over `--from-existing-feedback` for new turns).
3. **#171 cyclomatic A/B** — after a PASS train, serve-time A/B; do not raise profile caps.
4. **Soft-feed #95** — TwinRouterBench soft signal archive; no release-gate edit.
5. **HyDRA ≥100** — re-export telemetry-contrib with `--embeddings` on labeled sessions (SP-285); never invent embeddings.
6. **Hygiene** — do not auto-promote untagged legacy; do not relax ECE≤0.10 or improve-gate.
7. **Optional product follow-on (new issue)** — identity isotonic / skip-calibrator when `ece_cal ≥ ece_raw` so already-calibrated logistics can ship without harmful knots — only with explicit approval; out of scope for this train.

## Artifacts

- Gate report: `data/calibration/verifier-grade-gate-report.json`
- Candidates (evidence only): `data/calibration/candidate-*.json`
- Failure note: `hard-gate-retrain-2026-09-11.md`
- Live fallback: `live-sp282-fallback-note.md`
