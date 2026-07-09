# Task: SP-121 — SAAR types, schema, and operator config

**Created:** 2026-07-08
**Size:** S

## Review Level: 1

**Assessment:** #72 foundation — add SAAR pin fields to domain types, Zod schemas, and operator config defaults without pipeline behavior changes.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#72
- Release: v0.2.0 Continuity (docs/release-plan-sonnet.md §3)
- Bucket: feature

## Mission

Add Session-Aware Agentic Routing (SAAR) configuration surface for v0.2.0. Introduce typed fields for `planning_turn_buffer` (default 2), `prefix_cache_weight` (default 0.20), `idle_timeout_seconds`, and `switch_threshold` on session/pin state types. Wire defaults through `src/config/defaults.ts` and Zod schemas so later tasks can implement pin policy without further schema churn.

## Dependencies

- **None**

## Context to Read First

- `docs/routing-roadmap.md` §2 P0 (SAAR pin)
- `src/domain/types/entities.ts`
- `src/domain/types/schemas.ts`
- `src/config/defaults.ts`
- `src/domain/pinning/session-pinner.ts` (read-only — understand existing pin types)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`, `src/config/defaults.ts` |
| May change | `tests/unit/schemas.test.ts`, `tests/unit/defaults.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/session-pinner.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test -- tests/unit/schemas.test.ts tests/unit/defaults.test.ts` |
| fileScopeMustChange | `src/domain/types/schemas.ts`, `src/config/defaults.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | SAAR fields validated by Zod; defaults match roadmap (buffer=2, prefix_cache_weight=0.20); schema unit tests pass. |

## Steps

### Step 1: Domain types and schemas

- [ ] Add SAAR fields to session/pin-related types in `entities.ts`
- [ ] Extend Zod schemas with SAAR defaults and bounds (positive integers, weight 0–1)
- [ ] Export types for use by session pinner in SP-122

### Step 2: Operator config defaults

- [ ] Add SAAR defaults to `defaults.ts` with env override hooks consistent with existing config patterns
- [ ] Document env var names in code comments (README update deferred to SP-126)

### Step 3: Testing and verification

- [ ] Unit tests: schema accepts valid SAAR config; rejects invalid bounds
- [ ] Unit tests: defaults match `planning_turn_buffer=2`, `prefix_cache_weight=0.20`
- [ ] Run `npm run typecheck && npm test -- tests/unit/schemas.test.ts tests/unit/defaults.test.ts`

## Completion Criteria

- [ ] SAAR fields present on session/pin types and validated by Zod
- [ ] Defaults match roadmap SAAR recommendations
- [ ] No behavior change to routing pipeline (types/config only)
- [ ] Targeted unit tests pass

## Git Commit Convention

- `feat(SP-121): description`

## Do NOT

- Implement pin state transitions (SP-122)
- Wire SAAR into `router-pipeline.ts` (SP-123)
- Re-open or implement #1, #25, #26 (hardware — operator excluded)

---
