# Task: SP-004 — Domain Types

**Created:** 2026-07-02
**Size:** S

## Review Level: 2

**Assessment:** Core domain type definitions.
**Score:** 3/8

## Mission

Define domain types and persistence port interface. Maps to T009, T015.

## Dependencies

- SP-003

## Context to Read First

- `specs/001-build-smart-router/data-model.md`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/types/**`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/types/` |
| fileScopeMustNotChange | `src/infrastructure/**` |
| completionCriteria | All entity types and store port defined. |

## Steps

### Step 1: Domain types

- [ ] T009: RoutingRequest, RoutingDecision, SessionPin, ModelProfile, PriceCatalog, RoutingTelemetry
- [ ] T015: store-port.ts interface

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-004): description`

## Do NOT

- Implement zod schemas (SP-005)

---

## Amendments (Added During Execution)
