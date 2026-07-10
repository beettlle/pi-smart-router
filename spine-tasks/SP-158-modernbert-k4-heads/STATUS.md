**Current Step:** Step 3
**Status:** Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: ModernBERT heads module

**Status:** Complete

- [x] Implement `modernbert-heads.ts` with K=4 independent sigmoid heads on [CLS]
- [x] Dimensions: reasoning, code_gen, tool_use, debugging
- [x] ONNX/runtime integration following embedding-provider patterns

## Step 2: Config and shape tests

**Status:** Complete

- [x] Add `hydra_heads` config flag (`learned_projection` | `modernbert_k4`)
- [x] Unit tests: head output shape [4] with values in [0,1]
- [x] Document when K=4 warranted (calibration Top-1 error >~10%)

## Step 3: Testing and verification

**Status:** Complete

- [x] Run `npm run verify:ci`

---

## Completion Criteria

- [x] K=4 sigmoid heads module on ModernBERT [CLS]
- [x] Head output shape tests pass
- [x] Config flag for head mode selection
- [x] `npm run verify:ci` passes

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | `defaults.ts` needed `hydra_heads` after schema change | Required companion fix for typecheck |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
