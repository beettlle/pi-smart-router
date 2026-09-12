# SP-286 — Operator notes: issue linkage for release v1.1.0

**Date:** 2026-09-11
**Task:** SP-286 (wave 5, release v1.1.0)
**Purpose:** Single operator-facing record of where each v1.1.0-tracked issue stands after
the post-1.0 verifier-graded calibration train (SP-280–SP-285). No label was invented, no
shipped default was flipped, and no issue is closed by this note — closure wording below
describes what each task *delivered toward*, not GitHub state.

---

## Issue status after this train

| Issue | State | This train delivered | What remains (next action) |
|-------|-------|----------------------|----------------------------|
| [#168](https://github.com/beettlle/pi-smart-router/issues/168) — verifier-graded dogfood retrain (post-1.0) | OPEN — **Partial** | Provenance floors (SP-281), verifier-grade train path with hard gates (SP-283), hard-gate ship path exercised end-to-end (SP-284). Candidate **failed** `isotonic_ece_absolute` (0.2738 > 0.10); ship correctly refused. | ≥30 **real** `human_feedback` / `llm_judge` labeled rows (e.g. #95 shadow dogfood with SP-282 live graders), then re-run `train-routing-calibration.ts --verifier-grade-only --require-hard-gates`; ship only on exit 0 + `hard_gates_passed: true`. See [`hard-gate-ship-note.md`](hard-gate-ship-note.md). |
| [#169](https://github.com/beettlle/pi-smart-router/issues/169) — adversarial LLM labeling campaign | OPEN (closure pending at publish) | SP-282 harness: multi-model generation, blinded pinned-temperature graders, generator self-exclusion, disagreement exclusion (never coerced), ≥20% negative floor + ≥5 distinct failure scores, seeded session holdout, recorded-replay + OpenAI-compat live + **SP-288 pi-CLI live** (`--pi-cli --from-scoped-models` from `enabledModels`; `cursor/auto` forbidden as grader). CI campaign: 22 labeled, negative fraction 0.2273. | Operator runs **`--pi-cli --from-scoped-models`** (or OpenAI-compat live) against real ≥40-task JSONL to produce ship-eligible `llm_judge` packs at scale; adjudicate disagreements via SP-287 review CLI. |
| [#170](https://github.com/beettlle/pi-smart-router/issues/170) — privacy-safe embeddings + prompt_length export | OPEN (closure pending at publish) | SP-285: optional embedding capture (decision sidecar), export `--embeddings`, aggregate ingest/dedup, SQLite v8 roundtrip; wire contract byte-identical when capture is disabled (default off). | Operator opt-in capture during #95 dogfood so HyDRA (floor ≥100) can train from real exports. |
| [#171](https://github.com/beettlle/pi-smart-router/issues/171) — serve-time loader for trained `cyclomatic_threshold` | OPEN — deferred | Nothing (out of scope by manifest). Triage thresholds shipped **untrained** (0 samples under verifier-grade scoping; live engine keeps hardcoded 15). | Post-train serve-time A/B once real labels exist; next-train slate. |
| [#172](https://github.com/beettlle/pi-smart-router/issues/172) — optional baseline refresh 0.6.0 → current | OPEN — deferred (P3) | Nothing (optional baseline; operator-approved only). | Unchanged; schedule only if operator approves. |
| [#110](https://github.com/beettlle/pi-smart-router/issues/110) — ship real P(success) + isotonic from behavioral dogfood | OPEN — parent epic, **Partial** via this train | Bookkeeping scaffold (SP-280) + the verifier-grade pipeline above. `config/p-success-weights.json` stays all-zero (`trained_sample_count: 0`); `config/routing-calibration.json` stays `neutralized_for_v1_honesty` with the `post_v1_verifier_grade_attempt` record. | Real P(success)/isotonic after the #168 ship precondition is met; on next-train slate. |
| [#95](https://github.com/beettlle/pi-smart-router/issues/95) — shadow quality/cost dogfood before relaxing frugality | OPEN — human gate | Nothing this train (explicitly out of scope). TwinRouterBench corpus soft-fail remains a **harness adapter artifact** (#112), not live over-routing. | Human shadow dogfood per `docs/qa/shadow-dogfood-protocol.md`; its exports are the corpus that unblocks #168/#110. **No frugality relaxation.** |
| [#96](https://github.com/beettlle/pi-smart-router/issues/96) — enable `modernbert_k4` default | OPEN — deferred, **no flip this train** | Nothing (explicitly out of scope). Shipped encoder default unchanged; `config/operator-config.json.example` untouched. | Keep-default recommendation from SP-219 stands; decide only with trained heads + pack-holdout evidence. |

---

## Operator posture (unchanged)

- **Honest-untrained remains the shipped calibration.** Verified 2026-09-11:
  `config/routing-calibration.json` → `provenance.source: neutralized_for_v1_honesty`
  (+ `post_v1_verifier_grade_attempt` gate-fail record); `config/p-success-weights.json` →
  `trained_sample_count: 0`. Serve-time behavior is identical to 1.0.0.
- **Provenance is never invented.** 258 legacy dogfood rows were dropped from the
  verifier-grade train (untagged legacy → install-local only, SP-281) rather than relabeled.
- **No default flips.** Encoder (`modernbert_k4`), frugality, and triage threshold defaults
  are untouched; `config/operator-config.json.example` was not modified.
- **Next unblock order:** #95 shadow dogfood (human) → SP-285 embedding capture on →
  SP-282 live-grader campaigns (**SP-288 pi-CLI scoped models** or OpenAI-compat key) →
  SP-283/SP-284 re-run with `--require-hard-gates` →
  #168 closes when gates pass; #110 closes when real P(success)/isotonic ship.

## References

- Manifest: [`manifest.md`](manifest.md)
- Train evidence: [`verifier-grade-train-note.md`](verifier-grade-train-note.md)
- Ship decision: [`hard-gate-ship-note.md`](hard-gate-ship-note.md)
- Migration guide honesty section: [`docs/migration-v1.md`](../../../docs/migration-v1.md#post-10-verifier-grade-attempt-v110--hard-gates-failed-honest-untrained-remains)
