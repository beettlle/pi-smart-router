# Task: SP-086 — Map and route cursor/* models explicitly

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Complete #40 — explicit cursor/auto and composer-* mapper rules, delegation tests, README two-auto-models section.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#40
- Bucket: feature

## Mission

Cursor provider models (`cursor/auto`, `cursor/composer-latest`, etc.) fall through to `UNKNOWN_DEFAULTS` in `mapPiModelToProfile()`. Dogfooding showed `cursor/auto` in fleet but HyDRA never selected it. Add explicit mapper rules, verify delegation when router selects cursor models, and document `cursor/auto` vs `smart-router/auto` in README.

## Dependencies

- SP-085

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `tests/unit/pi-model-mapper.test.ts`
- `.pi/extensions/smart-router/route-and-delegate.ts`
- `tests/unit/smart-router-extension.test.ts`
- `README.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts` |
| May change | `tests/unit/pi-model-mapper.test.ts`, `tests/unit/smart-router-extension.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` (SP-085) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | cursor/auto and composer-* have explicit mapper rules; delegation integration test; README clarifies two auto models. |

## Testing

- Unit: `tests/unit/pi-model-mapper.test.ts` — cursor/composer mapping
- Extension: `tests/unit/smart-router-extension.test.ts` — cursor/auto delegation when selected
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Cursor mapper rules

- [ ] Add pattern rules for `cursor/*` and `composer-*` ids
- [ ] Define tier/capability defaults with documented rationale
- [ ] Handle zero/unknown registry cost for cursor models explicitly
- [ ] Unit tests in `tests/unit/pi-model-mapper.test.ts`

### Step 2: Delegation verification

- [ ] Verify `resolveRegistryModel()` + stream delegation for `cursor/auto` and `composer-latest`
- [ ] Integration or extension test: fleet includes cursor/auto → routed request delegates successfully

### Step 3: Operator docs

- [ ] README section: `cursor/auto` vs `smart-router/auto`
- [ ] When to pin `/model cursor/auto` directly vs use router
- [ ] Cross-link #23, #37, #38
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] `cursor/auto` and at least one `composer-*` variant have explicit mapper rules (not UNKNOWN_DEFAULTS)
- [ ] Unit tests cover cursor/composer mapping
- [ ] Integration or extension test proves delegation to cursor model when router selects it
- [ ] README clarifies the two auto models and recommended dogfood setup
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-086): description`

## Do NOT

- Change turn envelope or tool-history guard (prior tasks)
- Re-decompose extension god file (SP-081)

---
