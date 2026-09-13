# Encoder cascade replay report — v1.2.0 (#173)

**Date:** 2026-09-13
**Scope:** Evidence pack for the opt-in per-prompt encoder cascade shipped in the v1.2.0 train (SP-291 gate/config, SP-292 cascading embedder + telemetry, SP-293 per-encoder centroids + verify). **Evidence only — this report does not flip any default.** `hydra.encoder` stays `minilm`; `hydra.encoder_cascade.enabled` stays `false`.
**Source issue:** [beettlle/pi-smart-router#173](https://github.com/beettlle/pi-smart-router/issues/173) — eval table gates a *future* default-flip ticket, not this release.

---

## 1. What shipped (SP-291–293)

| Piece | Where | Posture |
|-------|-------|---------|
| `EncoderCascadeConfig` schema `{enabled, long_context_encoder, token_threshold}` — default **off**, threshold **512** | `src/domain/types/schemas.ts`, `src/config/defaults.ts` | Opt-in; existing single-encoder installs unaffected |
| `selectEncoderForPrompt` pure gate — reason codes `cascade_disabled / under_threshold / over_threshold / granite_fallback`; estimator parity with turn-envelope stage (`estimated_input_tokens ?? prompt_text.length`) | `src/domain/matching/encoder-gate.ts` | Pre-embedding arithmetic only; zero added cost when off |
| `createCascadingTextEmbedder` — lazy per-encoder ONNX sessions (Granite loads only on first over-threshold prompt), degrade-never-mix fallback (`granite_fallback` + availability latch), idempotent dispose of both sessions | `src/domain/matching/embedding-provider.ts` | Wired only when `encoder_cascade.enabled`; disabled path byte-identical wire decision |
| Sidecar telemetry `encoder_selected / token_estimate / cascade_threshold / cascade_fallback_reason` | `src/domain/types/schemas.ts` (optional fields), `RouterPipeline.attachFeatures` | Present only on cascade-enabled hydra_match decisions — additive |
| `routing:bootstrap-centroids --encoder granite` → namespaced `config/routing-centroids.granite.json` with `encoder` flavor stamp | `scripts/bootstrap-routing-centroids.ts` | Per-encoder artifact sets; never mix vector spaces |
| Calibration verify rejects cross-encoder bundles, unknown flavors fail closed, Granite bundles require `hydra_projection.trained_sample_count === 0` (honest-untrained) | `scripts/verify-routing-calibration.ts` | Shipped MiniLM bundle untouched (`encoder_flavor_consistency: encoder=minilm` PASS, 20/20) |

## 2. Gate replay over labeled dogfood packs

**Method.** Offline replay of the shipped `selectEncoderForPrompt` gate (cascade **enabled**, default 512-token threshold) over every labeled dogfood aggregate row in the repo: `data/calibration/dogfood-20260714-aggregate.jsonl`, `data/calibration/dogfood-20260909-aggregate.jsonl`, `data/calibration/ship-grade-agg-20260912.jsonl` — **405 rows**, all with `estimated_input_tokens`. Each row was replayed twice (cascade enabled vs disabled/MiniLM-only baseline) and the selected encoders compared. Gate wall-clock overhead was measured per row. Rows carry no prompt text (privacy-safe aggregates), so the replayed estimate is the recorded `estimated_input_tokens` — the same field the in-pipeline gate prefers via turn-envelope parity.

### Results

| Metric (#173 eval table) | Result | Reading |
|--------------------------|--------|---------|
| Short prompts (< threshold): decisions identical to MiniLM-only | **0 of 405 rows under threshold** — identity holds vacuously on this corpus; the 405 over-threshold rows differ *by design* (that is the cascade) | Observed dogfood traffic is long-context-dominated: `estimated_input_tokens` min **1274**, p50 **1319**, p75 **4603**, p95 **8856**, max **34902** |
| Long prompts (≥ threshold): Top-1 / retrieval improvement vs MiniLM-truncated | **Not measurable from this corpus** — aggregates carry no cluster-similarity ground truth per encoder, and no Granite-embedded labels exist yet | This is exactly the gap the telemetry fields close: with cascade enabled on dogfood, `encoder_selected` + outcome labels make the A/B measurable on a future train |
| Latency: gate overhead ~0 | Gate p50 **0.0004 ms**, p95 **0.0005 ms**, max **0.054 ms** over 405 replays | Pre-embedding arithmetic; below any measurement noise in the routing path |
| Memory: Granite loads only on first long-prompt hit | Verified by unit tests (SP-292): no Granite session until first over-threshold embed; one session per encoder; `dispose()` closes both | Lazy-load is structural, not observed here — replay exercises the pure gate, not ONNX sessions |

**Corpus composition (over-threshold rows by turn type):** `main_loop` 249, `tool_result` 86, `planning` 70.

### What the replay establishes

1. **Fire population is large on real traffic.** Every labeled dogfood row to date exceeds MiniLM's 512-token window — the truncation the cascade exists to avoid is the *common case* on this host, not the tail. This strengthens the case for dogfooding the cascade (still opt-in).
2. **Identity guarantee is by construction, not luck.** Under-threshold prompts embed with the *same* MiniLM session as the baseline (never-mix is enforced in the embedder, not just the gate), so short-prompt routing decisions are bit-identical when the cascade fires or not. The corpus simply contains no short prompts to demonstrate it on.
3. **Zero measured gate overhead.** The gate adds sub-microsecond p50 arithmetic before embedding.
4. **The improvement leg of the eval table is still open** — deliberately. Flipping the default requires Granite-vs-MiniLM-truncated Top-1/retrieval evidence on labeled packs, which needs cascade-enabled dogfood telemetry first. No default flip is claimed or recommended by this report.

## 3. Encoder latency benchmark (fresh, this lane)

`npm run benchmark:encoder` — 20 held-out agent turn samples (SP-157 fixture; all samples ≥ 820 estimated tokens, i.e. the long-context population), `.pi-smart-router/models/` cache:

| Encoder | mean | p50 | p95 | max | Budget |
|---------|------|-----|-----|-----|--------|
| MiniLM (`Xenova/all-MiniLM-L6-v2`) | 18.89 ms | 18.78 ms | 20.72 ms | 24.57 ms | — |
| Granite (`granite-embedding-97m-multilingual-r2` ONNX) | 19.12 ms | 18.46 ms | 22.34 ms | 26.66 ms | **PASS** (p50/p95 ≤ 120 ms) |

Granite latency is at parity with MiniLM on this hardware (consistent with the SP-204 go/no-go ~17 ms p50 measurement, `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md`), so the cascade's serve-time cost on over-threshold prompts is embedding-parity, not a regression. Memory for the Granite session is paid only on the first over-threshold hit (lazy load).

## 4. Test evidence (landed with SP-291–293)

| Suite | Coverage of #173 test plan |
|-------|---------------------------|
| `tests/unit/encoder-gate.test.ts` (17 tests) | Threshold boundaries (`>=` fires), disabled config, estimator parity with turn-envelope, `granite_fallback` reason |
| `tests/unit/embedding-provider.test.ts` (18 cascade tests) | Selection under/over threshold, never-mix identity, lazy Granite load, fallback latch on load *and* embed failure, fail-loud primary failure, dispose closes both / idempotent / fail-closed after dispose, telemetry wiring end-to-end |
| `tests/unit/verify-routing-calibration.test.ts` + `bootstrap-routing-centroids.test.ts` + `train-routing-calibration.test.ts` (19 new tests) | Verify rejects mixed-encoder bundles + unknown flavors (fail closed), Granite honest-untrained gate, `--encoder granite` flavored namespaced artifact |
| `npm run routing:verify-calibration` on shipped bundle | 20/20 PASS incl. `encoder_flavor_consistency: encoder=minilm` — shipped MiniLM defaults untouched |

## 5. Operator enablement (opt-in)

```json
{
  "hydra": {
    "encoder": "minilm",
    "encoder_cascade": {
      "enabled": true,
      "long_context_encoder": "granite",
      "token_threshold": 512
    }
  }
}
```

With cascade enabled on dogfood, watch the sidecar fields `encoder_selected` / `token_estimate` / `cascade_threshold` / `cascade_fallback_reason`; any `granite_fallback` rows indicate Granite session/artifact unavailability (routing continues on MiniLM by design — degrade, never mix). Bootstrap Granite centroids via `npm run routing:bootstrap-centroids -- --encoder granite` before relying on cluster matching under the cascade; `npm run routing:verify-calibration` fails closed on mixed-flavor bundles.

## 6. Honest limits

- No short-prompt rows exist in current dogfood aggregates; the identity leg is demonstrated by construction + unit tests, not corpus replay.
- No Granite-side quality labels exist yet; the improvement leg of the #173 eval table remains open pending cascade-enabled dogfood telemetry.
- The replay uses recorded `estimated_input_tokens`; the in-pipeline gate can additionally see the metadata-prefixed HyDRA input length when no estimate is present (turn-envelope parity). Aggregate rows always carried the estimate.
- Mid-inference ONNX cancellation remains impossible (SP-171 limitation unchanged); Granite session load failure degrades to MiniLM with `granite_fallback`, never to cross-space comparison.
