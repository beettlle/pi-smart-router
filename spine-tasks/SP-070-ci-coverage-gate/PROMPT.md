# Task: SP-070 — CI Coverage Gate

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Enforce `npm run coverage:check` in GitHub Actions after SP-069 local gate.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#29
- Bucket: bug

## Mission

GitHub CI runs `build`, `typecheck`, `lint`, and `test` but **not** `npm run coverage:check`, while `.spine/spine-config.json` defines `testWithCoverage: npm run coverage:check`. Coverage regressions can merge to `main` undetected.

SP-069 added the local coverage script and thresholds. This task wires CI to enforce the same gate.

## Dependencies

- SP-069

## Context to Read First

- `.github/workflows/ci.yml`
- `package.json` — `coverage:check` script
- `vitest.config.ts` — coverage thresholds and `include` paths
- `.spine/spine-config.json` — `testing.testWithCoverage`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/ci.yml` |
| May change | `vitest.config.ts` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test && npm run coverage:check` |
| fileScopeMustChange | `.github/workflows/ci.yml` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | CI workflow runs coverage:check after tests; vitest coverage.include limited to shippable paths (src/**); CI fails when thresholds not met. |

## Steps

### Step 1: Add CI coverage step

- [ ] Add `npm run coverage:check` step to `.github/workflows/ci.yml` after the Test step
- [ ] Ensure step runs on both push and pull_request to main

### Step 2: Restrict coverage scope

- [ ] Confirm `vitest.config.ts` `coverage.include` covers shippable paths (`src/**`) and excludes `spine-tasks/**`
- [ ] Adjust include/exclude if CI picks up non-shippable files

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test && npm run coverage:check`
- [ ] Confirm workflow YAML is valid (no syntax errors)

## Completion Criteria

- [ ] `.github/workflows/ci.yml` includes `coverage:check` after tests
- [ ] `vitest.config.ts` coverage scope limited to shippable paths
- [ ] Local `npm run coverage:check` passes
- [ ] No domain logic changes

## Git Commit Convention

- `fix(SP-070): description`

## Do NOT

- Lower coverage thresholds to pass CI without justification
- Change routing or domain behavior

---

## Amendments (Added During Execution)
