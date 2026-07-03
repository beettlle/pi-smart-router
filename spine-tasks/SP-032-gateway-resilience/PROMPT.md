# Task: SP-032 — Gateway Resilience

**Created:** 2026-07-02
**Size:** M

## Review Level: 3

**Assessment:** Circuit breaker, failover, rate limiting.
**Score:** 5/8

## Mission

Circuit breaker, gateway failover chains, per-key rate limits with 429 response. Maps to T055, T056, T057.

## Dependencies

- SP-031
- SP-030
- SP-018

## Context to Read First

- `specs/001-build-smart-router/data-model.md`
- `specs/001-build-smart-router/spec.md (FR-017, FR-018)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/infrastructure/gateway/circuit-breaker.ts`
- `src/infrastructure/gateway/gateway-dispatch.ts`
- `src/infrastructure/persistence/sqlite-store.ts`
- `src/domain/pipeline/router-pipeline.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `spine-tasks/SP-032-gateway-resilience/STATUS.md` |
| fileScopeMustNotChange | `src/domain/matching/hydra-matcher.ts` |
| completionCriteria | Infra-only failover; 429 + Retry-After on rate limit. |

## Steps

### Step 1: Gateway resilience

- [ ] T055: circuit-breaker.ts (infra errors only)
- [ ] T056: Weighted distribution + failover
- [ ] T057: Rate limiting with 429/retry-after body

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-032): description`

## Do NOT

- Modify HyDRA matcher core

---

## Amendments (Added During Execution)

- **2026-07-03:** `gateway-dispatch.ts` already changed on `main` from SP-012. Worker adds circuit breaker + resilience and updates STATUS.md; `fileScopeMustChange` points at delivery artifact.
