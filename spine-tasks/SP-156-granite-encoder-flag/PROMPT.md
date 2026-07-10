# Task: SP-156 — Feature-flag encoder selection and Granite ONNX embedder

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #80 part 1 — Granite 97M long-context encoder as 384-dim ONNX drop-in behind feature flag.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#80
- Release: v0.6.0
- Bucket: feature

## Mission

Add operator config feature flag for encoder selection (`minilm` | `granite`). Implement Granite 97M ONNX embedder factory (`ibm-granite/granite-embedding-97m-multilingual-r2`) as 384-dim drop-in compatible with SP-115 projection head. MiniLM remains default fallback. Wire factory into `embedding-provider.ts` and hydra matcher init.

## Dependencies

- SP-115 (landed — learned projection head)

## Context to Read First

- `src/domain/matching/embedding-provider.ts`
- `src/domain/matching/hydra-matcher.ts`
- `src/domain/types/schemas.ts`
- `docs/routing-roadmap.md` §2 P3
- GitHub #80 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/embedding-provider.ts`, `src/domain/types/schemas.ts` |
| May change | `config/operator-config.json.example`, `tests/unit/embedding-provider.test.ts`, `src/domain/matching/hydra-matcher.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/embedding-provider.ts`, `src/domain/types/schemas.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Feature-flag encoder selection; Granite ONNX factory; MiniLM fallback; 384-dim shape validation; integration test for encoder swap. |

## Steps

### Step 1: Operator config flag

- [ ] Add `encoder` field to operator config schema (`minilm` | `granite`, default `minilm`)
- [ ] Document flag in `config/operator-config.json.example`

### Step 2: Granite embedder factory

- [ ] Implement `createGraniteOnnxTextEmbedder()` in `embedding-provider.ts`
- [ ] Model: `ibm-granite/granite-embedding-97m-multilingual-r2` via ONNX runtime
- [ ] Enforce 384-dim output; share dispose pattern with MiniLM

### Step 3: Factory wiring and tests

- [ ] Export `createTextEmbedder(encoder, cachePath)` selector
- [ ] Wire hydra matcher to use encoder from config
- [ ] Integration test: encoder swap produces valid 384-dim embedding

## Testing

- [ ] Integration test: encoder swap produces valid 384-dim embedding
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Feature-flag encoder selection in operator config
- [ ] Granite ONNX artifact path with 384-dim compatibility
- [ ] MiniLM remains fallback default
- [ ] Encoder swap integration test
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-156): description`

## Do NOT

- K=4 heads (SP-158+)
- Re-open #1, #25, #26

---
