# Task: SP-069 — Coverage Check Script

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Add npm run coverage:check script referenced by spine buildGate testWithCoverage.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#27
- Bucket: bug

## Mission

`.spine/spine-config.json` sets `testWithCoverage` to `npm run coverage:check`, but `package.json` has no such script. Spine workers and reviewers repeatedly note this as a pre-existing gap. Coverage gates are skipped instead of enforced.

Fix:
- Add `@vitest/coverage-v8` devDependency
- Add `coverage:check` script (e.g. `vitest run --coverage` with sensible thresholds)
- Optionally add coverage step to `.github/workflows/ci.yml` after SP-067 Node fix

Use pragmatic thresholds — avoid blocking on unrealistic coverage for legacy or integration-heavy modules.

## Dependencies

- SP-068

## Context to Read First

- `package.json` — scripts and devDependencies
- `vitest.config.ts` — test config
- `.spine/spine-config.json` — buildGate.testWithCoverage

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `vitest.config.ts` |
| May change | `.github/workflows/ci.yml` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test && npm run coverage:check` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | `npm run coverage:check` exits 0; spine testWithCoverage gate runnable. |

## Steps

### Step 1: Add coverage dependency and script

- [ ] Add `@vitest/coverage-v8` to devDependencies
- [ ] Add `coverage:check` script to `package.json`
- [ ] Configure coverage in `vitest.config.ts` with sensible thresholds

### Step 2: Verify coverage gate

- [ ] Run `npm run coverage:check` — exits 0
- [ ] Confirm thresholds are achievable without gaming

### Step 3: Optional CI integration

- [ ] Add coverage step to CI workflow if appropriate

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test && npm run coverage:check`

## Completion Criteria

- [ ] `npm run coverage:check` exists and passes
- [ ] Spine testWithCoverage gate no longer skipped
- [ ] No domain logic changes

## Git Commit Convention

- `fix(SP-069): description`

## Do NOT

- Set unrealistic 100% coverage thresholds
- Change routing or domain behavior

---

## Amendments (Added During Execution)
