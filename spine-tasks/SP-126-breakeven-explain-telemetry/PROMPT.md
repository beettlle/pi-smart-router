# Task: SP-126 — Breakeven explain, telemetry, and v0.2.0 operator docs

**Created:** 2026-07-08
**Size:** S

## Review Level: 1

**Assessment:** #73 observability + v0.2.0 release docs — expose breakeven and SAAR decisions in explain/telemetry; document operator config knobs in README.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#73, beettlle/pi-smart-router#72
- Release: v0.2.0 Continuity
- Bucket: feature

## Mission

Complete v0.2.0 operator observability. Expose breakeven components (`marginal_savings`, `cache_reprime_cost`, `future_cache_value`, decision) and SAAR pin state (buffer window, hard-lock, idle timeout) in explain output, routing telemetry, and `SMART_ROUTER_LOG_ROUTING=1` JSON logs. Update README with SAAR and breakeven config knobs and dogfood verification steps per release plan exit criteria.

## Dependencies

- **Task:** SP-125 (breakeven pipeline gate)

## Context to Read First

- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/api/explain/router-explain.ts`
- `specs/001-build-smart-router/contracts/explain-endpoint.md`
- `spine-tasks/SP-110-context-fit-telemetry-explain/PROMPT.md` (pattern reference)
- `README.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/infrastructure/telemetry/routing-telemetry.ts`, `README.md` |
| May change | `src/api/explain/router-explain.ts`, `src/domain/types/entities.ts`, `tests/unit/routing-telemetry.test.ts`, `tests/unit/router-explain.test.ts`, `specs/001-build-smart-router/contracts/explain-endpoint.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `node --test tests/unit/routing-telemetry.test.ts tests/unit/router-explain.test.ts` |
| fileScopeMustChange | `src/infrastructure/telemetry/routing-telemetry.ts`, `README.md` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Explain shows breakeven decision and components; telemetry includes SAAR/breakeven fields; README documents v0.2.0 operator config. |

## Steps

### Step 1: Telemetry and decision records

- [ ] Add breakeven component fields to routing telemetry payload
- [ ] Add SAAR state fields (buffer_active, hard_lock, turn_index_in_session)
- [ ] Add reason codes: `breakeven_blocked`, `breakeven_pass`, `saar_buffer_active`, `saar_hard_lock`

### Step 2: Explain and routing logs

- [ ] Extend explain serializer with breakeven breakdown and SAAR pin summary
- [ ] Include breakeven/SAAR summary in `SMART_ROUTER_LOG_ROUTING=1` JSON log line
- [ ] Update explain contract doc if response shape changes

### Step 3: README operator section

- [ ] Document SAAR config env vars (`planning_turn_buffer`, `prefix_cache_weight`, idle timeout)
- [ ] Document breakeven behavior and dogfood verification steps (multi-turn planning session)
- [ ] Note v0.2.0 Continuity scope (#72, #73)

### Step 4: Testing and verification

- [ ] Unit tests for telemetry emitter and explain serializer
- [ ] Run `node --test tests/unit/routing-telemetry.test.ts tests/unit/router-explain.test.ts`
- [ ] Run `npm run verify:ci` as full-suite gate

## Completion Criteria

- [ ] Explain output shows breakeven decision and component values
- [ ] Telemetry rows include SAAR and breakeven metadata on gated decisions
- [ ] README operator section documents v0.2.0 config knobs
- [ ] Unit tests pass; `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-126): description`

## Do NOT

- Change pipeline routing logic (SP-123/125 own that)
- Bump npm version or push release tags (operator action at v0.2.0 ship)

---
