# Task: SP-272 — pipeline stage context 143

**Created:** 2026-09-05
**Size:** S

## Review Level: 2

**Assessment:** Introduce PipelineStage interface and shared RoutingContext.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#143
- Bucket: feature
- Partial: #143
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #143 — introduce `PipelineStage` interface + shared `RoutingContext` (per A7) without extracting all stages yet.

1. Add types/modules under `src/domain/pipeline/` for stage contract + context.
2. Optionally thin-wrap one existing stage call site to prove the interface compiles.
3. No behavior change to routing policy.
4. Do not invert ports yet (SP-275).

## Dependencies

- **None**

## Context to Read First

- Issue #143
- src/domain/pipeline/router-pipeline.ts
- docs/PRD.md pipeline stages

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/` |
| May change | `tests/unit/** for new types`, `src/domain/pipeline/router-pipeline.ts (minimal adapter only)` |
| Must NOT change | `src/infrastructure/** port inversion (SP-275)`, `Behavior/policy changes` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | PipelineStage + RoutingContext exist and typecheck; Partial #143 |

## Steps

### Step 0: Preflight

- [ ] Map current stage order in router-pipeline.ts
- [ ] Draft RoutingContext fields

### Step 1: Add stage + context types

- [ ] Implement PipelineStage + RoutingContext
- [ ] Minimal compile proof

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] coverage:check if app code changed

## Completion Criteria

- [ ] PipelineStage + RoutingContext exist and typecheck; Partial #143

## Do NOT

- Extract all stages in this packet
- Change routing decisions
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `refactor(SP-272): PipelineStage and RoutingContext (#143)`
