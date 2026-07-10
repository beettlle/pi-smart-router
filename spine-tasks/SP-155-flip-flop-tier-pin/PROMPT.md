# Task: SP-155 — Flip-flop shadow log and session tier pin

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** #82 part 2 — shadow log for 3 consecutive tier flips → pin tier for session.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#82
- Release: v0.6.0
- Bucket: feature

## Mission

Implement flip-flop shadow logging: when routing tier flips 3 consecutive times within a session, pin the tier for the remainder of the session. Document false-positive rate approach on dogfood corpus. Wire telemetry for flip-flop events.

## Dependencies

- SP-154

## Context to Read First

- `src/domain/pinning/session-pinner.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/domain/pipeline/router-pipeline.ts`
- GitHub #82 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/flip-flop-guard.ts`, `src/domain/pinning/session-pinner.ts` |
| May change | `tests/unit/session-pinner.test.ts`, `src/infrastructure/telemetry/routing-telemetry.ts` |
| Must NOT change | `src/domain/triage/triage-engine.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pinning/flip-flop-guard.ts`, `src/domain/pinning/session-pinner.ts` |
| fileScopeMustNotChange | `src/domain/triage/triage-engine.ts` |
| completionCriteria | 3 consecutive tier flips trigger session tier pin; shadow log events; unit tests; dogfood false-positive doc note. |

## Steps

### Step 1: Flip-flop guard module

- [ ] Implement `flip-flop-guard.ts` tracking consecutive tier flips per session
- [ ] Define pin action when threshold (3) reached
- [ ] Integrate with session pinner pin-break evaluation

### Step 2: Telemetry and docs

- [ ] Emit flip-flop shadow log events in routing telemetry
- [ ] Document false-positive rate monitoring on dogfood corpus

### Step 3: Testing and verification

- [ ] Unit tests: 2 flips no pin, 3 flips pin tier
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] 3 consecutive tier flips → pin tier for session
- [ ] Shadow log telemetry for flip-flop events
- [ ] Unit tests for threshold behavior
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-155): description`

## Do NOT

- Modify triage entropy module (SP-154 scope)

---
