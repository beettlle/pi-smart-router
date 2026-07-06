# Task: SP-094 — Session pin break on context overflow

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Break session pin when estimated tokens exceed pinned model window.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#50
- Bucket: feature

## Mission

Session pins persist across turns even when context grows beyond the pinned model's window. Add a new pin break rule when `estimated_input_tokens` exceeds pinned model's `max_input_tokens * safety_margin`:

- `action: 'break'`, `breakReason: 'context_overflow'`
- Extend `PinReason` type and SQLite CHECK constraint
- Distinct from compaction break; document precedence (compaction first, then overflow)

## Dependencies

- SP-091
- SP-092

## Context to Read First

- `src/domain/pinning/session-pinner.ts`
- `src/domain/types/entities.ts`, `schemas.ts`
- `src/infrastructure/persistence/sqlite-store.ts`
- `tests/unit/session-pinner.test.ts`
- Epic: beettlle/pi-smart-router#46

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/session-pinner.ts` |
| May change | `src/domain/types/entities.ts`, `src/infrastructure/persistence/sqlite-store.ts`, `tests/unit/session-pinner.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `src/domain/pinning/session-pinner.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Pin breaks on overflow; context_overflow persisted; unit tests cover overflow break. |

## Steps

### Step 1: Pin break rule and types

- [ ] Add `context_overflow` to PinReason and evaluateBreakRules
- [ ] Extend SQLite schema for new pin_reason value

### Step 2: Tests

- [ ] Unit tests in session-pinner.test.ts for overflow break
- [ ] Test precedence vs compaction break

### Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Pin breaks when tokens exceed pinned model limit
- [ ] New `pin_reason: context_overflow` persisted in SQLite
- [ ] Unit tests in session-pinner.test.ts for overflow break
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-094): description`

## Do NOT

- Re-open or implement #1, #25, #26 (operator excluded)

---
