# Task: SP-090 — CI parity verify command and orchestrator alignment

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Fix #44 — add `verify:ci` script mirroring CI and update orchestrator/spine skills to require full verify before success.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#44
- Bucket: feature

## Mission

The backlog orchestrator and spine land loop verify with `npm run typecheck && npm test`, but CI also runs `build`, `lint`, and `coverage:check`. This gap allowed SP-088 to land with a lint failure on `main`.

Add a single local verify entrypoint matching `.github/workflows/ci.yml` order, and update orchestrator + spine operator skills and packet template defaults so future cycles cannot skip lint/coverage/build.

## Dependencies

- SP-089

## Context to Read First

- `.github/workflows/ci.yml`
- `package.json` scripts
- `skills/router-backlog-orchestrator/SKILL.md`
- `skills/spine-autonomous-operator/SKILL.md`
- `skills/router-backlog-orchestrator/references/packet-from-issue.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json` |
| May change | `skills/router-backlog-orchestrator/SKILL.md`, `skills/spine-autonomous-operator/SKILL.md`, `skills/router-backlog-orchestrator/references/packet-from-issue.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | `verify:ci` mirrors CI order; skills require full verify before orchestrator success; packet template default updated. |

## Testing

- Run `npm run verify:ci` on `main` after changes

## Steps

### Step 1: Add verify:ci script

- [ ] Add `verify:ci` to `package.json` running: `build` → `typecheck` → `lint` → `test` → `coverage:check` (same order as CI)

### Step 2: Update router-backlog-orchestrator skill

- [ ] Phase 6 land loop: after `spine integrate`, run full verify (not just `npm install`)
- [ ] Phase 8 final report: require full verify output; block success on failure
- [ ] Final report template: list each CI step pass/fail

### Step 3: Update spine-autonomous-operator skill

- [ ] Post-integrate verification uses `npm run verify:ci` (or equivalent full command)
- [ ] Default `testCommand` guidance includes lint and coverage where appropriate

### Step 4: Update packet template default

- [ ] `packet-from-issue.md`: default `testCommand` = `npm run verify:ci` (or document full CI parity chain)

### Step 5: Testing and verification

- [ ] Run `npm run verify:ci`
- [ ] Dry-run command list matches `.github/workflows/ci.yml`

## Completion Criteria

- [ ] Local verify command matches CI job order (build, typecheck, lint, test, coverage:check)
- [ ] `skills/router-backlog-orchestrator/SKILL.md` requires full verify before Phase 8 success
- [ ] `skills/spine-autonomous-operator/SKILL.md` aligned on post-integrate verify
- [ ] Packet template default `testCommand` updated
- [ ] `npm run verify:ci` passes on integrated `main`

## Git Commit Convention

- `feat(SP-090): description`

## Do NOT

- Re-open #1, #25, #26 (reserved for dogfooding)

---
