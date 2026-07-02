# Task: SP-031 — Pricing Engine

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Price broker and staleness monitor.
**Score:** 4/8

## Mission

Price broker (override → registry → fallback) and staleness warning. Maps to T053, T054 (FR-019, FR-020).

## Dependencies

- SP-030

## Context to Read First

- `specs/001-build-smart-router/spec.md (FR-019, FR-020)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/infrastructure/pricing/price-broker.ts`
- `src/infrastructure/pricing/pricing-monitor.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/pricing/price-broker.ts` |
| fileScopeMustNotChange | `src/infrastructure/gateway/gateway-dispatch.ts` |
| completionCriteria | Tri-tier price resolution; 14-day staleness warning. |

## Steps

### Step 1: Pricing

- [ ] T053: price-broker.ts
- [ ] T054: pricing-monitor.ts

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-031): description`

## Do NOT

- Implement gateway resilience (SP-032)

---

## Amendments (Added During Execution)
