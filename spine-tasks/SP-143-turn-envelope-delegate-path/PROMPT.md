# Task: SP-143 — Turn envelope planning delegate path

**Created:** 2026-07-09
**Size:** M

## Review Level: 2

**Assessment:** #71 part 2 — turn_envelope emits planning_delegate when warm pin would otherwise switch primary to frontier for planning turns.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#71
- Release: v0.4.0 Delegate
- Bucket: feature

## Mission

Implement the pipeline-side planning delegate path in `turnEnvelope`. When a planning turn would route primary inference to frontier while a warm economical pin is active, prefer `planning_delegate`: keep primary on pinned tier and emit delegate metadata for a compressed frontier sub-call. Respect SAAR buffer/hard-lock from SP-123. Fall back to direct frontier route when delegate is disabled or unavailable (document fallback reason in explain).

## Dependencies

- SP-142

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — `turnEnvelope`
- `src/domain/pinning/session-pinner.ts`, `src/domain/pinning/saar-session-state.ts`
- `spine-tasks/SP-123-turn-envelope-saar-wiring/PROMPT.md`
- `docs/routing-roadmap.md` §8 anti-pattern "Planning regex → frontier mid-session"

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `tests/unit/router-pipeline.test.ts`, `tests/integration/session-pinning.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Planning turn with warm pin emits planning_delegate instead of primary model switch; SAAR buffer rules preserved; explain shows delegate vs direct; unit/integration tests cover delegate and fallback paths. |

## Steps

### Step 1: Delegate decision in turnEnvelope

- [ ] Detect planning turn + warm economical pin + capability need for frontier reasoning
- [ ] Emit `planning_delegate` decision with compressed-context hints per SP-142 contract
- [ ] Preserve SAAR buffer deferral and hard-lock behavior

### Step 2: Fallback and explain

- [ ] When delegate disabled/unavailable, use direct route with documented reason
- [ ] Wire explain/telemetry fields from SP-142

### Step 3: Testing and verification

- [ ] Unit tests: delegate path keeps primary pin tier
- [ ] Integration test: planning turn does not switch primary inference model when delegate active
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] turn_envelope implements planning delegate path per #71
- [ ] Primary stays pinned when delegate active
- [ ] Tests cover delegate and fallback
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-143): description`

## Do NOT

- Implement pi sub-agent spawn (SP-144)
- Change domain types beyond consuming SP-142 contract

---
