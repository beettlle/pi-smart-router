# Task: SP-123 — Turn envelope and session_pin SAAR wiring

**Created:** 2026-07-08
**Size:** S

## Review Level: 2

**Assessment:** #72 integration — wire SAAR pin policy into turn_envelope and session_pin pipeline stages so planning turns stop blind-frontier cache misses.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#72
- Release: v0.2.0 Continuity
- Bucket: feature

## Mission

Integrate SP-122 SAAR pin state machine into the routing pipeline. Fix the SP-064 failure mode where `turn_envelope` early-exits `planning` → `frontier-cloud` while pin metadata stays economical — causing inference-path cache misses. Planning turns inside the buffer may reach frontier when capability requires it, but must not permanently break warm economical pins. Execution turns after the buffer must respect hard-lock.

## Dependencies

- **Task:** SP-122 (SAAR pin state machine)

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — `turnEnvelope`, `sessionPin`
- `src/domain/pinning/session-pinner.ts`
- `tests/integration/session-pinning.test.ts`
- `docs/routing-roadmap.md` §2 P0, §8 anti-pattern "Planning regex → frontier mid-session"

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `tests/integration/session-pinning.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `src/domain/triage/turn-envelope.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test -- tests/integration/session-pinning.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/domain/triage/turn-envelope.ts` |
| completionCriteria | Planning-then-execution sequence respects SAAR buffer and hard-lock; integration test proves no unplanned model switch after buffer on warm pin. |

## Steps

### Step 1: Turn envelope SAAR guard

- [ ] Consult SAAR state before planning→frontier early-exit in `turnEnvelope`
- [ ] Inside buffer: allow capability-gated frontier without pin overwrite
- [ ] After buffer: defer to session_pin hard-lock instead of unconditional frontier override

### Step 2: Session pin stage alignment

- [ ] Ensure `sessionPin` records turn index and tool-loop state for SAAR
- [ ] Preserve existing break rules (#32 warmup, loop escalation, context overflow)

### Step 3: Testing and verification

- [ ] Extend `session-pinning.test.ts`: planning turn then execution turns respect pin after buffer
- [ ] Regression: loop escalation and context overflow pin breaks still work
- [ ] Run `npm run typecheck && npm test -- tests/integration/session-pinning.test.ts`

## Completion Criteria

- [ ] SAAR buffer and hard-lock visible in pipeline behavior
- [ ] Integration test: planning→execution on warm economical pin does not silently switch models after buffer
- [ ] No regression on existing pin break rules
- [ ] Targeted integration tests pass

## Git Commit Convention

- `feat(SP-123): description`

## Do NOT

- Implement cache breakeven gate (SP-125)
- Add explain/telemetry fields (SP-126)
- Modify turn classifier regex in `turn-envelope.ts`

---
