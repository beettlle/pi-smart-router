# Task: SP-142 — Planning delegate contract types and explain output

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #71 part 1 — define planning_delegate routing signal, config knobs, and explain/telemetry contract.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#71
- Release: v0.4.0 Delegate
- Bucket: feature

## Mission

Introduce `planning_delegate` (or equivalent) as a first-class routing decision signal for planning turns. Add domain types, Zod schema defaults, operator config, and explain/telemetry fields so downstream pipeline and pi extension can distinguish **delegate path** (frontier sub-call, primary stays pinned) from **direct frontier route**. Document compressed-context requirements at the contract level without implementing spawn yet.

## Dependencies

- SP-123 (SAAR turn_envelope wiring landed)

## Context to Read First

- `docs/routing-roadmap.md` §2 P0, §4 turn_envelope policy
- `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `spine-tasks/SP-123-turn-envelope-saar-wiring/PROMPT.md`
- GitHub #71 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts` |
| May change | `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/routing-telemetry.test.ts`, `specs/001-build-smart-router/contracts/` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/types/entities.ts`, `src/domain/types/schemas.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts`, `.pi/extensions/smart-router/index.ts` |
| completionCriteria | planning_delegate types and config exist; explain output schema documents delegate vs direct; unit tests cover schema defaults and telemetry serialization. |

## Steps

### Step 1: Domain types and schema

- [ ] Add `planning_delegate` decision fields to routing entities
- [ ] Add operator config knobs (enable, compressed context limits) with Zod defaults
- [ ] Extend routing explain/telemetry payload types

### Step 2: Explain contract documentation

- [ ] Document delegate vs direct route in explain serializer
- [ ] Add unit tests for schema validation and telemetry fields

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Contract types and config for planning delegate exist
- [ ] Explain/telemetry documents delegate vs direct
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-142): description`

## Do NOT

- Implement turn_envelope routing logic (SP-143)
- Wire pi sub-agent spawn (SP-144)

---
