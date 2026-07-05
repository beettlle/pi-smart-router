# Task: SP-051 — Lifecycle Hook Wiring

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Wire pi lifecycle hooks for compaction and model override to pin-break rules (FR-008).
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#16
- Bucket: bug

## Mission

FR-008 pin-break rules for compaction and user model override are implemented in domain/tests but never fire in the pi extension path.

- `buildRoutingRequest()` in the extension never sets `compaction_flag` or `force_model_id`
- `session_compact` / `session_before_compact` handlers in `pi-router-middleware.ts` are empty no-ops
- No extension handlers register for pi `model_select` / compaction events

Unit and integration tests pass because they inject these flags directly — production behavior differs.

## Dependencies

- SP-049

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — hook registration, `buildRoutingRequest()`
- `src/api/middleware/pi-router-middleware.ts`
- `src/domain/pinning/session-pinner.ts` — break rules already implemented
- `tests/integration/session-pinning.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts`, `src/api/middleware/pi-router-middleware.ts` |
| May change | `tests/integration/session-pinning.test.ts` |
| Must NOT change | `src/domain/pinning/session-pinner.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pinning/session-pinner.ts` |
| completionCriteria | Compaction and model_select events set compaction_flag or force_model_id on next routing request; extension-path integration test asserts pin breaks without manual flag injection. |

## Steps

### Step 1: Implement compaction hook wiring

- [ ] On `session_compact` / `session_before_compact`, next routing request includes `compaction_flag: true` or session pin broken per FR-008 rule #1
- [ ] Wire handlers in extension or middleware (not no-op)

### Step 2: Implement model_select override wiring

- [ ] On user `/model` override (model_select), next request includes `force_model_id` and pin break rule #2 applies
- [ ] Update `buildRoutingRequest()` to propagate flags from hook state

### Step 3: Extension-path integration tests

- [ ] Extend `tests/integration/session-pinning.test.ts` for extension path
- [ ] Assert `/smart-router status` reflects pin state after compaction break

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Compaction and model override break pins in extension path
- [ ] No exported no-op hook handlers remain
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-051): description`

## Do NOT

- Change SessionPinner domain logic (already implemented)
- Full middleware ghost-layer removal (SP-019 deferred) — wire behavior first

---

## Amendments (Added During Execution)

- **2026-07-04:** SP-049 prelanded dispatch wiring in `index.ts` (hardware, local, loop escalation, rate limiter). This task adds lifecycle hooks only — do not revert SP-049 wiring.
