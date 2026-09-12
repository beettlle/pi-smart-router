# Operator notes: issue linkage for release v1.1.0

**Date:** 2026-09-12 (updated after Sep 12 hard-gate PASS + quality-gap pass)
**Purpose:** Single operator-facing record of where each v1.1.0-tracked issue stands.
No label was invented; encoder/frugality defaults were not flipped.

---

## Issue status after this train

| Issue | State | This train delivered | What remains (next action) |
|-------|-------|----------------------|----------------------------|
| [#168](https://github.com/beettlle/pi-smart-router/issues/168) — verifier-graded dogfood retrain (post-1.0) | **Closable** — hard-gate ship precondition met | Provenance floors (SP-281), adversarial harness (SP-282/288), panel adjudication, verifier-grade train + hard gates (SP-283), Sep 12 PASS promote into `config/*` (ECE cal 0.0645). | Close when publish lands; session-holdout ECE path exists but is not yet ship-cleared ([`session-holdout-retrain-2026-09-12.md`](session-holdout-retrain-2026-09-12.md)). |
| [#169](https://github.com/beettlle/pi-smart-router/issues/169) — adversarial LLM labeling campaign | **Closable** | Multi-model generate, blinded graders, generator self-exclusion (id + provider/model), ≥20% negatives, session holdout, recorded + OpenAI-compat + pi-CLI live, panel adjudication with `--generations-in`. Live campaign: 86 labeled + 10 panel rows. | Close at publish; keep harness for ongoing dogfood. |
| [#170](https://github.com/beettlle/pi-smart-router/issues/170) — privacy-safe embeddings + prompt_length export | **Closable** (export path) | Double opt-in capture/export; aggregate ingest; default-off wire-identical. | HyDRA floor ≥100 still unmet — needs operator opt-in capture during #95 dogfood. |
| [#171](https://github.com/beettlle/pi-smart-router/issues/171) — serve-time loader for trained `cyclomatic_threshold` | **Closable** | Serve-time loader reads trained threshold (5) from bundle when floor met; tier-features normalization aligned. | Optional A/B vs prior hardcoded 15 after publish; not a ship blocker. |
| [#172](https://github.com/beettlle/pi-smart-router/issues/172) — optional baseline refresh 0.6.0 → current | OPEN — deferred (P3) | Nothing. | Unchanged. |
| [#110](https://github.com/beettlle/pi-smart-router/issues/110) — ship real P(success) + isotonic from behavioral dogfood | OPEN — **Partial** | P(success) + isotonic **shipped** on verifier-grade corpus. | HyDRA ≥100 embeddings; more #95 shadow volume; session-holdout ECE ship when absolute gate clears. |
| [#95](https://github.com/beettlle/pi-smart-router/issues/95) — shadow quality/cost dogfood | OPEN — human gate | Not in scope for code; existing exports fed the Sep 12 train. | Fresh human matrix per protocol; **no frugality relaxation**. |
| [#96](https://github.com/beettlle/pi-smart-router/issues/96) — enable `modernbert_k4` default | OPEN — deferred | Nothing; no flip. | Keep-default until trained heads + pack-holdout evidence. |

---

## Operator posture (2026-09-12)

- **Shipped calibration is trained:** `provenance.source: verifier_grade_train_2026-09-12`,
  `trained_sample_count: 243`, `hard_gates_passed: true` (hash-split ECE).
- **Triage threshold serve-active:** bundle value 5 loads when floor ≥50 (#171).
- **HyDRA remains honest-untrained** (0 samples).
- **Provenance is never invented.** Untagged legacy stays install-local only.
- **No default flips** for encoder / frugality / `#96`.

## References

- Manifest: [`manifest.md`](manifest.md)
- Ship PASS: [`hard-gate-pass-2026-09-12.md`](hard-gate-pass-2026-09-12.md)
- Session-holdout FAIL (not shipped): [`session-holdout-retrain-2026-09-12.md`](session-holdout-retrain-2026-09-12.md)
- Historical Sep 11 FAIL: [`hard-gate-ship-note.md`](hard-gate-ship-note.md)
- Migration: [`docs/migration-v1.md`](../../../docs/migration-v1.md#behavioral-calibration-artifacts-110--168)
