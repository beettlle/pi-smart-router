# Task: SP-100 — Extract shared HyDRA embedder for cluster matching

**Created:** 2026-07-06
**Size:** S

## Review Level: 1

**Assessment:** Prerequisite for #56 — extract reusable EmbeddingProvider from HyDRA matcher so cluster matcher shares ONNX session.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#56
- Bucket: feature
- Epic: beettlle/pi-smart-router#54

## Mission

Extract the MiniLM embedding pipeline from `hydra-matcher.ts` into a shared embedder module usable by both HyDRA and the upcoming cluster matcher. No second model load; shared lifecycle and `dispose()`.

## Dependencies

- SP-099

## Context to Read First

- `src/domain/matching/hydra-matcher.ts`
- `tests/unit/hydra-matcher.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-matcher.ts` |
| May change | `src/domain/matching/embedding-provider.ts`, `tests/unit/hydra-matcher.test.ts`, `tests/unit/embedding-provider.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/hydra-matcher.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Shared embedder extracted; HyDRA matcher uses it; existing HyDRA tests pass; dispose lifecycle shared. |

## Steps

### Step 1: Extract embedder

- [ ] Create `embedding-provider.ts` (or equivalent) with embed(text) API
- [ ] Refactor hydra-matcher to use shared provider
- [ ] Export provider for cluster-matcher consumption

### Step 2: Testing and verification

- [ ] Existing hydra-matcher tests pass unchanged behavior
- [ ] Unit test for embedder isolation (mocked ONNX optional)
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] HyDRA and future cluster matcher can share one embedder instance
- [ ] `dispose()` shares lifecycle with HyDRA matcher
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-100): description`

## Do NOT

- Implement cluster-matcher.ts (SP-101)

---
