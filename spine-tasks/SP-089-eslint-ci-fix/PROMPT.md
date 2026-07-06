# Task: SP-089 — Fix ESLint CI blocker (no-unused-vars)

**Created:** 2026-07-06
**Size:** S

## Review Level: 1

**Assessment:** Fix #45 — remove unused `sessionId` destructuring so `npm run lint` passes CI.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#45
- Bucket: bug

## Mission

CI lint fails on `main` with `@typescript-eslint/no-unused-vars` in `tests/unit/smart-router-extension.test.ts:1168`. The test **"does not clear pins for other sessions"** destructures `sessionId` from `createCommandHarness('sess-current')` but uses the string literal `'sess-current'` in assertions instead.

Use `sessionId` consistently in that test (preferred — keeps harness contract). Run full lint after fix.

## Dependencies

- SP-088

## Context to Read First

- `tests/unit/smart-router-extension.test.ts` — unpin command tests around line 1167
- `.github/workflows/ci.yml` — lint step order

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run lint && npm run typecheck && npm test` |
| fileScopeMustChange | `tests/unit/smart-router-extension.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | `npm run lint` exits 0; typecheck and tests pass; CI verify lint step green. |

## Testing

- Run `npm run lint && npm run typecheck && npm test`

## Steps

### Step 1: Fix unused variable

- [ ] In **"does not clear pins for other sessions"**, use `sessionId` instead of `'sess-current'` literals in `recordPin` and `getPin` calls

### Step 2: Testing and verification

- [ ] Run `npm run lint && npm run typecheck && npm test`
- [ ] Confirm zero `@typescript-eslint/no-unused-vars` in touched file

## Completion Criteria

- [ ] `npm run lint` exits 0 locally
- [ ] `npm run typecheck && npm test` still pass
- [ ] No new unused-var regressions in touched tests

## Git Commit Convention

- `fix(SP-089): description`

## Do NOT

- Re-open #1, #25, #26 (reserved for dogfooding)

---
