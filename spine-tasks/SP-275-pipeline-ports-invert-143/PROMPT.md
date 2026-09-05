# Task: SP-275 — pipeline ports invert 143

**Created:** 2026-09-05
**Size:** M

## Review Level: 2

**Assessment:** Define infra ports and invert domain→infra coupling.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#143
- Bucket: feature
- Partial: #143
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #143 — define ports: `HardwareProbePort`, `LocalRuntimePort`, `TelemetryEmitterPort` — domain depends on interfaces only. Wire adapters in infrastructure. Behavior-preserving.

## Dependencies

- **SP-274**

## Context to Read First

- Issue #143
- src/infrastructure/hardware
- src/infrastructure/local
- src/infrastructure/telemetry

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/`, `src/domain/ports/` |
| May change | `src/infrastructure/** adapters`, `composition root / factory wiring`, `tests/**` |
| Must NOT change | `Policy behavior changes`, `package.json version` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/` |
| fileScopeMustNotChange | `package.json version field` |
| completionCriteria | Domain no longer imports infra concrete modules for those ports; Partial #143 |

## Steps

### Step 0: Preflight

- [ ] Inventory domain→infra imports
- [ ] Name port files

### Step 1: Ports + adapters

- [ ] Add port interfaces
- [ ] Wire adapters; remove concrete imports from domain

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] npm run coverage:check

## Completion Criteria

- [ ] Domain no longer imports infra concrete modules for those ports; Partial #143

## Do NOT

- Change routing outcomes
- Expand beyond the three ports without STATUS note
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `refactor(SP-275): invert pipeline infra ports (#143)`
