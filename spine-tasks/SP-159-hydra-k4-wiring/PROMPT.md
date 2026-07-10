# Task: SP-159 — Wire K=4 heads into hydra matcher and SP-115 migration

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** #81 part 2 — integrate ModernBERT K=4 into hydra matcher; document SP-115 migration.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#81
- Release: v0.6.0
- Bucket: feature

## Mission

Wire ModernBERT K=4 heads into `hydra-matcher.ts` as alternative to SP-115 learned linear projection. Preserve placeholder and learned projection paths. Document migration from SP-115 artifact to K=4 heads. Catalog-decoupled shortfall gate unchanged.

## Dependencies

- SP-158

## Context to Read First

- `src/domain/matching/hydra-matcher.ts`
- `src/domain/matching/modernbert-heads.ts`
- `docs/routing-roadmap.md` §2 P3
- GitHub #81 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-matcher.ts` |
| May change | `tests/unit/hydra-matcher.test.ts`, `config/operator-config.json.example` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/matching/hydra-matcher.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | K=4 heads wired into matcher; SP-115 learned projection still works; migration doc; hydra matcher tests for both paths. |

## Steps

### Step 1: Matcher integration

- [ ] Branch `extractRequirements` on `hydra_heads` config
- [ ] Route `modernbert_k4` to ModernBERT heads module
- [ ] Keep `learned_projection` (SP-115) and placeholder paths

### Step 2: Migration documentation

- [ ] Document SP-115 → K=4 migration in operator config example
- [ ] Note K=4 debugging dimension and shortfall gate behavior

### Step 3: Testing and verification

- [ ] Hydra matcher tests for learned vs K=4 paths
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] K=4 heads wired into hydra matcher
- [ ] SP-115 learned projection path preserved
- [ ] Migration documentation from SP-115 artifact
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-159): description`

## Do NOT

- Retrain projection weights on raw prompts

---
