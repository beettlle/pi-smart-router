# Task: SP-273 — pipeline extract first stages 143

**Created:** 2026-09-05
**Size:** M

## Review Level: 2

**Assessment:** Extract first stage cluster behind RoutingContext.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#143
- Bucket: feature
- Partial: #143
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #143 — extract first stage cluster (triage / pin / hydra seams as practical) into focused modules using `PipelineStage` + `RoutingContext`. Behavior-preserving refactor only.

## Dependencies

- **SP-272**

## Context to Read First

- SP-272
- Issue #143
- router-pipeline.ts

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/` |
| May change | `tests/unit/router-pipeline.test.ts (minimal import path fixes)`, `src/domain/pipeline/router-pipeline.ts` |
| Must NOT change | `src/infrastructure ports (SP-275)`, `Policy behavior changes` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | First stage cluster extracted; tests green; Partial #143 |

## Steps

### Step 0: Preflight

- [ ] Choose first cluster seams; list target files in STATUS

### Step 1: Extract stages

- [ ] Move logic to modules; wire orchestrator
- [ ] Preserve telemetry hooks

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] npm run coverage:check

## Completion Criteria

- [ ] First stage cluster extracted; tests green; Partial #143

## Do NOT

- Change route outcomes
- Full ports inversion
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `refactor(SP-273): extract first pipeline stages (#143)`
