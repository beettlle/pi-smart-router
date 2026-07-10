**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Operator config flag

**Status:** Complete

- [x] Add `encoder` field to operator config schema (`minilm` | `granite`, default `minilm`)
- [x] Document flag in `config/operator-config.json.example`

## Step 2: Granite embedder factory

**Status:** Complete

- [x] Implement `createGraniteOnnxTextEmbedder()` in `embedding-provider.ts`
- [x] Model: `ibm-granite/granite-embedding-97m-multilingual-r2` via ONNX runtime
- [x] Enforce 384-dim output; share dispose pattern with MiniLM

## Step 3: Factory wiring and tests

**Status:** Complete

- [x] Export `createTextEmbedder(encoder, cachePath)` selector
- [x] Wire hydra matcher to use encoder from config
- [x] Integration test: encoder swap produces valid 384-dim embedding
- [x] Run `npm run verify:ci`

---

## Completion Criteria

- [x] Feature-flag encoder selection in operator config
- [x] Granite ONNX artifact path with 384-dim compatibility
- [x] MiniLM remains fallback default
- [x] Encoder swap integration test
- [x] `npm run verify:ci` passes

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | APPROVE |
| 2026-07-10 | 2 | plan | APPROVE |
| 2026-07-10 | 3 | plan | APPROVE |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Granite ONNX loads via `onnx-community/granite-embedding-97m-multilingual-r2-ONNX` (Transformers.js artifact for ibm-granite weights) | Runtime model ID differs from HF source repo name |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | verify:ci | All tests and coverage gate passed |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

`createHydraMatcherFromHydraConfig` wires encoder from operator hydra config; extension `initHydraMatcher` in fleet-bootstrap remains MiniLM-default until a follow-up passes `DEFAULT_OPERATOR_CONFIG.hydra.encoder` (out of SP-156 file scope).
