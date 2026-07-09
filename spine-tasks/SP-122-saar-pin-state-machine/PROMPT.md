# Task: SP-122 — SAAR pin state machine

**Created:** 2026-07-08
**Size:** S

## Review Level: 2

**Assessment:** #72 core — implement turn-index-aware SAAR pin transitions (buffer, hard-lock, idle reopen) in session pinner without turn_envelope pipeline wiring.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#72
- Release: v0.2.0 Continuity
- Bucket: feature

## Mission

Implement SAAR pin state machine logic in the pinning domain layer. Turns 0 through `(planning_turn_buffer - 1)` may allow capability-gated frontier without permanently overwriting the economical pin. After the buffer: hard-lock the pin; allow tier upgrades only during active tool loops. Idle timeout reopens the routing decision per SAAR semantics. Unit-test all transitions in isolation — pipeline integration is SP-123.

## Dependencies

- **Task:** SP-121 (SAAR types and config defaults)

## Context to Read First

- `src/domain/pinning/session-pinner.ts`
- `src/domain/types/entities.ts`
- `tests/integration/session-pinning.test.ts` (read-only — future integration target)
- [SAAR blog](https://vllm.ai/blog/2026-06-02-session-aware-agentic-routing)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/session-pinner.ts` |
| May change | `src/domain/pinning/saar-session-state.ts`, `tests/unit/saar-session-state.test.ts`, `tests/unit/session-pinner.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test -- tests/unit/saar-session-state.test.ts tests/unit/session-pinner.test.ts` |
| fileScopeMustChange | `src/domain/pinning/session-pinner.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Buffer transitions, tool-loop hard-lock, and idle-timeout reopen covered by unit tests; no pipeline wiring yet. |

## Steps

### Step 1: SAAR state helper

- [ ] Add `saar-session-state.ts` (or equivalent) tracking turn index, buffer window, hard-lock, last-activity timestamp
- [ ] Methods: `recordTurn`, `isInBufferWindow`, `shouldHardLock`, `isIdleExpired`

### Step 2: SessionPinner SAAR integration

- [ ] Extend `SessionPinner` to consult SAAR state on pin lookup
- [ ] Buffer window: allow capability-gated model change without pin overwrite
- [ ] Post-buffer: hard-lock; tier upgrades only during tool loops
- [ ] Idle timeout: reset SAAR weight and reopen routing decision

### Step 3: Testing and verification

- [ ] Unit tests: buffer transitions (turns 0–1 with buffer=2)
- [ ] Unit tests: hard-lock during tool loop; tier upgrade allowed
- [ ] Unit tests: idle timeout reopen
- [ ] Run `npm run typecheck && npm test -- tests/unit/saar-session-state.test.ts tests/unit/session-pinner.test.ts`

## Completion Criteria

- [ ] SAAR state machine unit-tested in isolation
- [ ] SessionPinner exposes SAAR-aware pin actions
- [ ] No changes to `router-pipeline.ts`
- [ ] Targeted unit tests pass

## Git Commit Convention

- `feat(SP-122): description`

## Do NOT

- Change turn_envelope planning→frontier early-exit (SP-123)
- Implement cache breakeven (SP-124+)

---
