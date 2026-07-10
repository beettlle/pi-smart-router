# Task: SP-158 — ModernBERT K=4 capability heads module

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #81 part 1 — ModernBERT-base encoder with K=4 independent sigmoid heads on [CLS].
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#81
- Release: v0.6.0
- Bucket: feature

## Mission

Implement optional ModernBERT-base encoder with K=4 independent sigmoid heads on [CLS] for true HyDRA-style capability prediction (reasoning, code_gen, tool_use, debugging). Module only — wiring in SP-159. Catalog-decoupled shortfall unchanged.

## Dependencies

- SP-157

## Context to Read First

- `src/domain/matching/hydra-matcher.ts`
- `src/domain/matching/embedding-provider.ts`
- `docs/routing-roadmap.md` §2 P3
- GitHub #81 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/modernbert-heads.ts` |
| May change | `tests/unit/modernbert-heads.test.ts`, `src/domain/types/schemas.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/modernbert-heads.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | K=4 sigmoid heads module; head output shape tests; operator config flag for modernbert mode; debugging dimension included. |

## Steps

### Step 1: ModernBERT heads module

- [ ] Implement `modernbert-heads.ts` with K=4 independent sigmoid heads on [CLS]
- [ ] Dimensions: reasoning, code_gen, tool_use, debugging
- [ ] ONNX/runtime integration following embedding-provider patterns

### Step 2: Config and shape tests

- [ ] Add `hydra_heads` config flag (`learned_projection` | `modernbert_k4`)
- [ ] Unit tests: head output shape [4] with values in [0,1]
- [ ] Document when K=4 warranted (calibration Top-1 error >~10%)

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] K=4 sigmoid heads module on ModernBERT [CLS]
- [ ] Head output shape tests pass
- [ ] Config flag for head mode selection
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-158): description`

## Do NOT

- Retraining on raw prompts
- Wire into matcher (SP-159)

---
