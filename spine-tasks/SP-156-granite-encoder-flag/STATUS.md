**Current Step:** Step 1
**Status:** Pending
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Operator config flag

**Status:** Pending

- [ ] Add `encoder` field to operator config schema (`minilm` | `granite`, default `minilm`)
- [ ] Document flag in `config/operator-config.json.example`

## Step 2: Granite embedder factory

**Status:** Pending

- [ ] Implement `createGraniteOnnxTextEmbedder()` in `embedding-provider.ts`
- [ ] Model: `ibm-granite/granite-embedding-97m-multilingual-r2` via ONNX runtime
- [ ] Enforce 384-dim output; share dispose pattern with MiniLM

## Step 3: Factory wiring and tests

**Status:** Pending

- [ ] Export `createTextEmbedder(encoder, cachePath)` selector
- [ ] Wire hydra matcher to use encoder from config
- [ ] Integration test: encoder swap produces valid 384-dim embedding
- [ ] Run `npm run verify:ci`

---

## Completion Criteria

- [ ] Feature-flag encoder selection in operator config
- [ ] Granite ONNX artifact path with 384-dim compatibility
- [ ] MiniLM remains fallback default
- [ ] Encoder swap integration test
- [ ] `npm run verify:ci` passes

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
