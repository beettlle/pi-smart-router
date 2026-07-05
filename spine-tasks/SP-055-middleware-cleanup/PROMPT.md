# Task: SP-055 — Middleware Cleanup

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Resolve stub pi-router-middleware ghost layer — deprecate or wire real behavior; document embedder path.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#19
- Bucket: bug

## Mission

Brutal audit flagged `createPiRouterMiddleware()` as a ghost layer: compaction hooks now work (SP-051) but `getLastDecision()` always returns `undefined`, `void options.fleet` discards input, and real routing lives in `.pi/extensions/smart-router/index.ts`.

**Recommended approach (Option B):** Deprecate stub middleware for embedders; document extension-only integration path; remove no-op exports/handlers; update `src/index.ts` and README.

If Option A is clearly simpler after reading code, wire middleware for real instead — but do not duplicate extension routing logic.

Acceptance criteria:
- No exported API that registers hooks which intentionally do nothing
- Embedder path documented: extension vs library middleware
- If kept: middleware tests assert non-no-op behavior for compaction hooks and getLastDecision
- If removed/deprecated: update exports in `src/index.ts` and README

## Dependencies

- SP-054

## Context to Read First

- `src/api/middleware/pi-router-middleware.ts`
- `src/index.ts` — public exports
- `.pi/extensions/smart-router/index.ts` — production routing path
- `tests/unit/pi-router-middleware.test.ts`
- `README.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/api/middleware/pi-router-middleware.ts`, `src/index.ts` |
| May change | `.pi/extensions/smart-router/index.ts`, `tests/unit/pi-router-middleware.test.ts`, `tests/contract/`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/api/middleware/pi-router-middleware.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | No ghost-layer no-op middleware API; embedder integration path documented; exports and tests updated. |

## Steps

### Step 1: Choose and implement Option A or B

- [ ] Read current middleware vs extension responsibilities after SP-051
- [ ] Implement deprecation/removal (preferred) or full wiring
- [ ] Remove `void options.fleet` and no-op `getLastDecision` if keeping middleware

### Step 2: Update public exports and docs

- [ ] Update `src/index.ts` exports (deprecation JSDoc if retained)
- [ ] Document extension-only vs library middleware path in README

### Step 3: Update tests

- [ ] Adjust or remove stale middleware contract tests
- [ ] Assert non-no-op behavior if middleware kept

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run build` (public API surface changed)
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Ghost layer resolved (no intentional no-op hook registration)
- [ ] Embedder path documented
- [ ] Tests and build pass

## Git Commit Convention

- `fix(SP-055): description`

## Do NOT

- Duplicate full extension routing in middleware
- Break SP-051 lifecycle hook behavior
- Change SessionPinner persistence (SP-054)

---

## Amendments (Added During Execution)

- **2026-07-04:** SP-054 may preland pin wiring in `index.ts`. Middleware cleanup must not revert SP-054 SessionPinner wiring.
