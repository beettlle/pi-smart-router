# ModernBERT K=4 Top-1 + Offline A/B — Decision Artifact (SP-219 / #114 → #96)

**Date:** 2026-08-03
**Release:** v0.16.0
**Closes:** [#114](https://github.com/beettlle/pi-smart-router/issues/114)
**Soft parent:** [#96](https://github.com/beettlle/pi-smart-router/issues/96) (enablement decision tracker — **remains open**)
**Defaults:** **not flipped** — `src/config/defaults.ts` and `config/release-gates.json` untouched
**Depends on:** SP-218 Partial — `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`

---

## Recommendation (operator action for #96)

| Decision | Verdict | Rationale |
|----------|---------|-----------|
| Keep `learned_projection` as default (`hydra.hydra_heads`) | **YES — keep** | No measured Top-1 / shortfall breach of the 0.1 gate on real embeddings; enablement criteria in #96 Phase 3 are unmet |
| Opt-in dogfood cohort for `modernbert_k4` | **NO — not yet** | There is nothing meaningful to dogfood: `config/modernbert-k4-heads.json` does not exist (SP-218 Partial), so `modernbert_k4` today runs deterministic quarter-pooled **placeholder** heads |
| Flip default to `modernbert_k4` | **NO — blocked** | Trained heads missing + no privacy-safe [CLS] inputs or per-dimension K=4 labels (SP-218); Top-1 gate cannot be honestly evaluated |
| Overall | **Keep default — insufficient evidence for opt-in or flip** | Explicit: soft ECE PASS on verifier packs (`holdout_ece_calibrated=0.1480`, SP-204 first full-pack run) does **not** by itself warrant K=4; the Top-1 gate must be measured, and it is currently **not measurable** |

**Explicit:** This task does **not** modify `src/config/defaults.ts` or `config/release-gates.json` (verified: `git diff` empty — see below).

---

## Gate status: Top-1 vs `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD` (0.1)

| Requirement for an honest measurement | Status | Evidence |
|---------------------------------------|--------|----------|
| Trained `config/modernbert-k4-heads.json` loadable at `DEFAULT_MODERNBERT_K4_HEADS_PATH` | **Missing** | Verified 2026-08-03: `loadModernBertK4HeadWeights()` returns `null`; runtime falls back to placeholder heads (SP-218 Partial) |
| Privacy-safe inputs (prompt text or 768-dim `[CLS]` embeddings) to run real ModernBERT inference | **Missing** | Label packs + TwinRouterBench store `prefix_hash` / `prefix_token_estimate` only — text unrecoverable by design (`scripts/lib/label-pack-schema.ts` rejects taint keys) |
| Per-dimension K=4 capability labels (`reasoning`, `code_gen`, `tool_use`, `debugging`) | **Missing** | Pack labels are single binary `success`; no corpus maps prompts → 4-dim capability ground truth (SP-218 Partial) |
| Outcome-linked operator corpus for an error proxy (#96 Phase 1: `SMART_ROUTER_DATASET=1`) | **Missing locally** | Worktree `.pi-smart-router/state.db`: `dataset` / `outcomes` / `telemetry` all **0 rows** |

**Verdict:** the Top-1 / shortfall error gate **cannot be measured** in this repo state. No number is reported as "the Top-1 error" — inventing one is explicitly out of bounds (#114 AC, PROMPT "Do NOT").

---

## Offline A/B beyond fixture QR (what *was* run)

**New tooling (this task):** `scripts/eval/counterfactual-replay.ts --k4-ab [--corpus TRACK.json] [--out PATH]`
(package alias: `npm run routing:eval-k4-ab`). Extends the SP-160 fixture QR smoke with
per-step **Top-1 / shortfall / over-route / cost-regret** stats per head mode, and runs on
TwinRouterBench static tracks via `adaptTwinRouterBenchStaticTrack` — not fixture QR alone.

**Formula (documented per #96 Phase 1 AC):** for each step, derive requirements from the
head mode (`deriveRequirementsFromHeadMode`), map to an implied tier
(`impliedTierFromRequirements`), then compare against the verified `min_tier`:
`top1_error = 1 − P(implied_tier = min_tier)`; `shortfall = P(implied < min)`;
`overroute = P(implied > min)`; `cost_regret = implied-tier cost − hindsight-optimal cost`
on the frozen catalog.

**Sources & sample sizes:**

| Source | Fixtures | Steps | Labels |
|--------|----------|-------|--------|
| `tests/eval/fixtures/` (top-level trace fixtures) | 2 | 5 | fixture `step_outcome.min_tier` |
| `tests/eval/corpus/twinrouterbench/ci-subset.json` (SWE-bench-verified + terminal-bench + custom) | 68 sessions | 148 | execution-verified target tiers (downgrade-and-cascade) |

**Results (archive, gitignored):** `.pi-smart-router/measurements/sp-219/k4-head-mode-ab.json` (+ `.stdout.txt`), generated 2026-08-03.

| Source | Head mode | Top-1 error | Shortfall | Over-route | QR (mean) | Cost regret (USD) |
|--------|-----------|-------------|-----------|------------|-----------|-------------------|
| Trace fixtures (5 steps) | `learned_projection` | 0.400 | 0.200 | 0.200 | 0.833334 | −0.013560 |
| Trace fixtures (5 steps) | `modernbert_k4` | 0.400 | 0.200 | 0.200 | 0.833334 | −0.013560 |
| TRB ci-subset (148 steps) | `learned_projection` | 0.885135 | 0.222973 | 0.662162 | per-fixture QR in archive | −0.250541 |
| TRB ci-subset (148 steps) | `modernbert_k4` | 0.885135 | 0.222973 | 0.662162 | `qr_delta: 0` | −0.250541 |

Head-mode tier agreement: **1.0** on both sources (every step implies the same tier under
both modes). `k4_uses_placeholder_heads: true` in the archived report.

### Why these numbers cannot evaluate the 0.1 gate (read before citing)

1. **Synthetic embeddings.** Packs contain hashes, not text, so both head modes run on
   deterministic hash-derived pseudo-embeddings (`hashPrefixToEmbedding`). The 0.885
   "Top-1 error" on the TRB subset measures *a hash function's* agreement with verified
   tiers — it carries no signal about MiniLM/ModernBERT routing quality and must not be
   quoted as an SP-115 error rate.
2. **Placeholder K=4 heads.** Without `config/modernbert-k4-heads.json`, the K=4 side is
   the quarter-pooled placeholder; identical stats for both modes are expected and are
   **not** evidence of parity between trained implementations.
3. **Fixture parity remains insufficient.** `qr_delta: 0` on fixtures was already known
   (SP-160 / #96 background) and is not flip evidence — reconfirmed, not re-used.

**What the run *does* establish:** the extended A/B harness works end-to-end on
verifier-grade static tracks (148 execution-verified steps), so the moment trained heads
and a real `[CLS]`-computable corpus exist, the same command produces a decision-grade
Top-1 / shortfall / cost comparison with one flag (`--corpus`).

---

## Path to a measurable gate (next actions for #96)

1. **Trained heads** — operator-local training per SP-218 Partial §"Operator-local training
   path" (labeled corpus → fit 4 logistic heads → export `ModernBertK4HeadWeightsSchema`
   JSON to `config/modernbert-k4-heads.json`).
2. **Real inputs** — opt-in embedding export (never raw prompts) or an internal labeled set
   with text / cached `[CLS]` vectors, per #96 Phase 2.
3. **Outcome corpus** — `SMART_ROUTER_DATASET=1` on dogfood installs to collect
   override / pin-break labels (#96 Phase 1); local DB here had 0 rows.
4. **Re-run** `npm run routing:eval-k4-ab -- --corpus <packs>` with heads present
   (`k4_uses_placeholder_heads: false`) and compare `learned_projection.top1_error_rate`
   against `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD = 0.1` before any enablement ask.

## Defaults / gates untouched (verify)

```bash
git diff -- src/config/defaults.ts config/release-gates.json
# expect empty
```

Current defaults (read-only): `hydra.encoder: 'minilm'`, `hydra.hydra_heads: 'learned_projection'`.

## Links

- Issue #114 (closed by this task); Issue #96 (decision tracker — remains open)
- SP-218 Partial: `spine-tasks/_authoring/release-v0.16.0/modernbert-k4-heads-partial.md`
- Prior evidence: `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md` (SP-204 / #113)
- A/B tooling: `scripts/eval/counterfactual-replay.ts` (`--k4-ab`), tests `tests/unit/k4-head-mode-ab.test.ts`
- Gate constant: `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD` in `src/domain/matching/modernbert-heads.ts`
- Measurement archive (local, gitignored): `.pi-smart-router/measurements/sp-219/`
