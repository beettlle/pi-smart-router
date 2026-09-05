# Task: SP-274 — pipeline extract remaining 143

**Created:** 2026-09-05
**Size:** M

## Review Level: 2

**Assessment:** Extract remaining stages and shrink RouterPipeline orchestrator.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#143
- Bucket: feature
- Partial: #143
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #143 — extract remaining stages; shrink orchestrator. Target: no single pipeline file ≫800 lines after this phase when practical. Behavior-preserving.

## Dependencies

- **SP-273**

## Context to Read First

- SP-273
- Issue #143

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/` |
| May change | `tests/unit/**`, `src/domain/pipeline/router-pipeline.ts` |
| Must NOT change | `Policy changes`, `Encoder default flips` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | Remaining stages extracted; orchestrator shrunk; Partial #143 |

## Steps

### Step 0: Preflight

- [ ] List remaining stages in STATUS

### Step 1: Extract + shrink

- [ ] Move remaining stages
- [ ] Keep orchestrator as thin coordinator

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] npm run coverage:check

## Completion Criteria

- [ ] Remaining stages extracted; orchestrator shrunk; Partial #143

## Do NOT

- Change routing policy
- Skip tests
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `refactor(SP-274): extract remaining pipeline stages (#143)`
