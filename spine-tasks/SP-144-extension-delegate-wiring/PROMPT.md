# Task: SP-144 — Pi extension planning delegate spawn wiring

**Created:** 2026-07-09
**Size:** M

## Review Level: 2

**Assessment:** #71 part 3 — wire pi extension to spawn compressed-context frontier sub-call when pipeline emits planning_delegate.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#71
- Release: v0.4.0 Delegate
- Bucket: feature

## Mission

Wire `.pi/extensions/smart-router/index.ts` (and related middleware) to act on `planning_delegate` routing decisions. Spawn an ephemeral frontier sub-agent call with compressed context (exclude full execution history per #71), inject results as observations, and keep the primary session on the pinned economical model. Implement documented fallback when pi cannot spawn sub-agents (direct route or operator-visible error).

## Dependencies

- SP-143

## Context to Read First

- `.pi/extensions/smart-router/index.ts`
- `src/api/middleware/pi-router-middleware.ts` (if delegate hooks live here)
- `spine-tasks/SP-143-turn-envelope-delegate-path/PROMPT.md`
- GitHub #71 compressed context spec and fallback requirements

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |
| May change | `tests/unit/smart-router-extension.test.ts`, `src/api/middleware/pi-router-middleware.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Extension handles planning_delegate signal; compressed sub-call runs on frontier; primary request stays on pinned tier; fallback when sub-agent spawn unavailable; extension unit tests cover happy path and fallback. |

## Steps

### Step 1: Delegate handler in extension

- [ ] Read planning_delegate from routing decision / middleware contract
- [ ] Build compressed context payload per SP-142 limits
- [ ] Spawn ephemeral sub-agent (or pi-supported delegate API) on frontier model

### Step 2: Primary path preservation and fallback

- [ ] Keep primary inference on pinned tier when delegate succeeds
- [ ] Inject sub-agent result as observation
- [ ] Fallback to direct route or clear operator message when spawn unavailable

### Step 3: Testing and verification

- [ ] Extension unit tests with mocked sub-agent spawn
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Extension wires planning delegate spawn per #71
- [ ] Compressed context and fallback documented in code paths
- [ ] Unit tests cover delegate and fallback
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-144): description`

## Do NOT

- Change turn_envelope pipeline logic (SP-143)
- Modify domain types (SP-142)

---
