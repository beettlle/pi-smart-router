# Task: SP-167 — @release vitest matrix and test:release script

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** Tag ~10 integration/contract/eval test files with @release wrapper and add test:release npm script.
**Score:** 3/8

## Source

- Epic: Pre-Release Functional Gates (post-v0.6.0)
- Bucket: infra

## Mission

Document the release functional matrix without new test logic. Wrap each target file's existing `describe` tree in a top-level `describe('@release', () => { ... })` so `vitest --testNamePattern '@release'` selects them. Add `test:release` script to package.json. Optional scenario comment at top of each file (stages covered).

## Dependencies

- None

## Context to Read First

- `vitest.config.ts` — include pattern
- `tests/integration/*.test.ts` — 8 integration files
- `tests/contract/routing-schemas.test.ts`
- `tests/eval/harness-tracks.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json` |
| May change | `tests/integration/full-pipeline.test.ts`, `tests/integration/session-pinning.test.ts`, `tests/integration/pi-extension.test.ts`, `tests/integration/pipeline-mvp.test.ts`, `tests/integration/routing-latency.test.ts`, `tests/integration/explain-parity.test.ts`, `tests/integration/cost-baseline.test.ts`, `tests/integration/planning-delegate.test.ts`, `tests/contract/routing-schemas.test.ts`, `tests/eval/harness-tracks.test.ts` |
| Must NOT change | `scripts/eval/assert-release-gates.ts`, `.github/workflows/release.yml` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run test:release && npm run verify:ci` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `scripts/eval/assert-release-gates.ts`, `.github/workflows/release.yml` |
| completionCriteria | test:release script runs @release matrix; all 10 files wrapped; no assertion changes; verify:ci passes. |

## Steps

### Step 1: @release wrappers

- [ ] Wrap 8 integration test files in top-level `describe('@release', ...)`
- [ ] Wrap `tests/contract/routing-schemas.test.ts` and `tests/eval/harness-tracks.test.ts`
- [ ] Add optional scenario matrix comment at file top where helpful

### Step 2: test:release script

- [ ] Add `"test:release": "vitest run --testNamePattern '@release'"` to package.json

### Step 3: Testing and verification

- [ ] Run `npm run test:release` — confirms matrix subset runs
- [ ] Run `npm run verify:ci`

## Testing

- [ ] `npm run test:release` selects only @release suites
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] 10 test files wrapped with @release
- [ ] `test:release` script in package.json
- [ ] No changes to test assertions
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-167): description`

## Do NOT

- Add new test scenarios or assertions
- Wire test:release into release:check yet (optional follow-up)
- Modify assert-release-gates or release workflow

---
