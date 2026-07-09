# Task: SP-125 — Cache breakeven pipeline gate

**Created:** 2026-07-08
**Size:** S

## Review Level: 2

**Assessment:** #73 integration — apply breakeven gate before turn_envelope tier overrides and session pin breaks (beyond #32 warmup).
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#73
- Release: v0.2.0 Continuity
- Bucket: feature

## Mission

Gate turn_envelope sub-routes and session pin breaks with SP-124 breakeven math. Block switches where `marginal_savings + future_cache_value <= cache_reprime_cost` — preventing the $0.30-save / $3-cache-miss anti-pattern. Apply before turn_envelope tier override and before pin-break decisions beyond the existing #32 cache-warmup rule. Integration tests must prove `tool_result` sub-routes are blocked when breakeven fails.

## Dependencies

- **Task:** SP-123 (SAAR pipeline wiring — pin policy must exist)
- **Task:** SP-124 (breakeven formula module)

## Context to Read First

- `src/domain/pinning/cache-breakeven.ts`
- `src/domain/pipeline/router-pipeline.ts` — `turnEnvelope`, `sessionPin`
- `src/domain/pinning/session-pinner.ts`
- `src/domain/pinning/cache-economics.ts` (existing #32 warmup — compose, do not replace)
- `tests/integration/session-pinning.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/session-pinner.ts` |
| May change | `tests/integration/session-pinning.test.ts`, `tests/unit/session-pinner.test.ts` |
| Must NOT change | `src/domain/pinning/cache-breakeven.ts` (unless bugfix) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `node --test tests/integration/session-pinning.test.ts tests/unit/session-pinner.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/domain/triage/turn-envelope.ts` |
| completionCriteria | tool_result sub-route blocked when breakeven fails; pin-break gated beyond #32 warmup; integration tests pass. |

## Steps

### Step 1: Turn envelope breakeven gate

- [ ] Before turn_envelope tier override, call `evaluateCacheBreakeven`
- [ ] Block override when breakeven fails; emit internal reason code for SP-126 explain wiring
- [ ] Allow override when breakeven passes

### Step 2: Pin-break breakeven gate

- [ ] Apply breakeven before pin-break proposals (beyond #32 warmup economics)
- [ ] Block `tool_result` sub-route when breakeven fails
- [ ] Preserve qualified break events (compaction, overflow, loop escalation, operator override)

### Step 3: Testing and verification

- [ ] Integration: tool_result sub-route blocked when breakeven fails on warm prefix
- [ ] Integration: breakeven pass allows legitimate sub-route
- [ ] Regression: #32 warmup and loop escalation breaks still work
- [ ] Run `node --test tests/integration/session-pinning.test.ts tests/unit/session-pinner.test.ts`

## Completion Criteria

- [ ] Breakeven gate active on turn_envelope overrides and pin breaks
- [ ] Integration test proves blocked sub-route on failed breakeven
- [ ] Existing pin break rules preserved
- [ ] Targeted tests pass

## Git Commit Convention

- `feat(SP-125): description`

## Do NOT

- Add explain/telemetry serialization (SP-126)
- Implement virtual cost quota λ (#78 — v0.5.0)

---
