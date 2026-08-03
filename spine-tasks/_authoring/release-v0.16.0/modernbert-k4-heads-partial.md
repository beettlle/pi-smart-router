# ModernBERT K=4 Heads — Partial (Operator-Local Blocker) — SP-218 / #114

**Date:** 2026-08-03
**Release:** v0.16.0
**Issue:** Partial [#114](https://github.com/beettlle/pi-smart-router/issues/114) (heads deliverable; measurement is SP-219)
**Soft parent:** [#96](https://github.com/beettlle/pi-smart-router/issues/96) (decision tracker — remains open)
**Defaults:** **not flipped** — `src/config/defaults.ts` and `config/release-gates.json` untouched
**Verdict:** `config/modernbert-k4-heads.json` **remains operator-local** — no checked-in artifact. `loadModernBertK4HeadWeights()` returns `null` at `DEFAULT_MODERNBERT_K4_HEADS_PATH`; the runtime correctly falls back to placeholder heads.

---

## Why no trained artifact ships in this release (honest blocker)

Training the K=4 heads means fitting a 4×768 linear layer (+ bias) from
ModernBERT-base `[CLS]` embeddings to per-dimension capability targets
(`reasoning`, `code_gen`, `tool_use`, `debugging`). Honest training requires
**both** of the following; this repository currently has **neither** in a
privacy-safe, committable form:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Privacy-safe **inputs**: prompt text or 768-dim `[CLS]` embeddings | **Missing** | Label packs (`tests/eval/corpus/label-packs/`) contain feature vectors + binary outcomes only — **no** embeddings, **no** prompt text (by design; taint keys rejected by `scripts/lib/label-pack-schema.ts`). TwinRouterBench (`ci-subset.json`, 148 records) stores `prefix_hash` + `prefix_token_estimate` only — text cannot be recovered, so `[CLS]` embeddings cannot be computed. |
| Privacy-safe **targets**: per-dimension K=4 capability labels | **Missing** | Pack labels are a single binary `success` (P(success) / tier-proxy signal), not 4-dim capability scores. No corpus anywhere in the repo maps prompts → `{reasoning, code_gen, tool_use, debugging}` ground truth. |

Additional gaps:

- **ModernBERT ONNX not cached locally** — `.pi-smart-router/models/` contains only the Xenova MiniLM encoder. Fetching `onnx-community/ModernBERT-base-ONNX` is possible but pointless without labeled inputs/targets.
- **`tests/fixtures/agent-turn-samples/agent-turn-samples.json`** has 20 `prompt_text` samples but **no K=4 labels**; 20 unlabeled prompts cannot train 3,076 head parameters, and inventing per-dimension labels for them would violate the "no invented weights" rule.
- Soft ECE PASS on verifier packs (SP-204 first full-pack run, `holdout_ece_calibrated=0.1480`) is **not** K=4 supervision — per #114 AC, "soft ECE PASS alone does not ship this artifact."

**Conclusion:** any checked-in `config/modernbert-k4-heads.json` produced today would be invented weights. Path (B) per the task contract: document the blocker, keep heads operator-local.

---

## What *does* ship in this Partial

1. This writeup — provenance / blocker record under the release authoring folder.
2. Loader verification: `loadModernBertK4HeadWeights()` returns `null` at the
   DEFAULT path in this repo state, and `projectClsToK4Capabilities()` falls
   back to the deterministic quarter-pooled placeholder heads. Covered by unit
   tests in `tests/unit/modernbert-heads.test.ts` (extended in SP-218).
3. No `config/modernbert-k4-heads.json`, no train script, no `package.json`
   alias — per contract, those belong to Path (A) only, and shipping an
   untrained exporter with no data source would be placeholder production code.

## Operator-local training path (how to produce the artifact later)

An operator (or a future task) can close this blocker **without** code changes:

1. **Assemble a labeled corpus** (local, never committed): prompts (or cached
   768-dim `[CLS]` embeddings) with per-dimension capability labels in `[0,1]`
   for `reasoning`, `code_gen`, `tool_use`, `debugging`. Candidate sources:
   expert-annotated dogfood exports (#95/#110 track related work) or a benchmark
   with per-capability annotations. Target: hundreds+ of labeled rows — the head
   has 4×768+4 parameters and CI fixtures are far below that floor.
2. **Fetch the encoder locally:** `onnx-community/ModernBERT-base-ONNX` into the
   artifact cache (`.pi-smart-router/models/`), then extract `[CLS]` embeddings
   via `createModernBertHeadsPredictor` / `@huggingface/transformers`
   (`pooling: 'cls'`, `normalize: false`).
3. **Fit** 4 independent logistic-regression heads (e.g. `sklearn.linear_model.LogisticRegression`
   per dimension on `[0,1]` targets, or gradient descent on BCE).
4. **Export** JSON matching `ModernBertK4HeadWeightsSchema`
   (`src/domain/matching/modernbert-heads.ts`): `{version: 1, cls_dim: 768,
   weights: [[768]×4], bias: [4]}` with finite numbers.
5. **Place** at `config/modernbert-k4-heads.json` (operator-local or checked in
   once provenance is clean). `loadModernBertK4HeadWeights()` picks it up with
   no code change; `resolveModernBertK4HeadWeights()` fails closed to placeholder
   heads on any schema violation.
6. **Then** run SP-219 measurement (Top-1 / shortfall error vs
   `MODERNBERT_K4_ENABLE_TOP1_ERROR_THRESHOLD = 0.1`, offline A/B vs
   `learned_projection`) before any #96 enablement discussion.

## Defaults / gates untouched (verify)

```bash
git diff -- src/config/defaults.ts config/release-gates.json
# expect empty
```

Current defaults (read-only): `hydra.encoder: 'minilm'`, `hydra.hydra_heads: 'learned_projection'`.

## Links

- Issue #114 (parent deliverable; SP-219 closes)
- Issue #96 (enablement decision tracker — remains open)
- Prior blocker / ECE evidence: `spine-tasks/_authoring/release-v0.11.0/encoder-gonogo-artifact.md`
- Pack provenance + privacy rules: `tests/eval/corpus/label-packs/PROVENANCE.md`
- Loader / schema: `src/domain/matching/modernbert-heads.ts`
