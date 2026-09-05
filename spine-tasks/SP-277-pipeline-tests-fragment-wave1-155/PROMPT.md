# Task: SP-277 — pipeline tests fragment wave1 155

**Created:** 2026-09-05
**Size:** M

## Review Level: 1

**Assessment:** Fragment router-pipeline.test.ts into stage-focused modules (wave 1).
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#155
- Bucket: feature
- Partial: #155
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #155 — extract a first set of stage-focused test modules from `tests/unit/router-pipeline.test.ts` (~2200 lines). Prefer aligning with SP-273 stage modules. Keep full suite green; leave a thinner monolith or re-exports for remaining cases.

## Dependencies

- **SP-273**

## Context to Read First

- Issue #155
- tests/unit/router-pipeline.test.ts
- SP-273 stage modules

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/` |
| May change | `vitest.config.ts only if needed for includes` |
| Must NOT change | `src/domain/pipeline behavior changes`, `package.json version` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm test` |
| fileScopeMustChange | `tests/unit/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | Wave-1 stage test modules exist; suite green; Partial #155 |

## Steps

### Step 0: Preflight

- [ ] Map describe blocks to stage modules
- [ ] Choose first extract set

### Step 1: Extract wave-1 tests

- [ ] Move suites to stage-focused files
- [ ] Share fixtures helpers if needed

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Wave-1 stage test modules exist; suite green; Partial #155

## Do NOT

- Change production routing code except test imports
- Delete entire monolith before SP-278
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `test(SP-277): fragment pipeline tests wave 1 (#155)`
