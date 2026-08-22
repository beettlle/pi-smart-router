## Summary

Evict in-memory routing state on session end so long-lived pi processes do not leak `sessionRouting`, `ExecutionLedger`, and lifecycle hook maps.

## Priority

P1

## Pipeline stages

`.pi/extensions/smart-router/extension-setup.ts`, `session-lifecycle.ts`, `execution-ledger.ts`, `pi-router-middleware.ts`

## Problem / motivation

`sessionRouting` (extension-setup), `ExecutionLedger.bySession`, and `LifecycleHookState.sessions` grow for the life of the pi process. SQLite has eviction; process memory does not. No `session_end` handler evicts entries (Grok audit P1).

## Proposed solution

- [ ] Add `session_end` hook in `.pi/extensions/smart-router/session-lifecycle.ts` (or pi lifecycle API equivalent).
- [ ] On session end: delete `sessionRouting[sessionId]`, `ExecutionLedger` session bucket, consumed lifecycle state.
- [ ] Optional TTL fallback for orphaned sessions (document timeout).
- [ ] Unit tests: after `session_end`, maps do not retain session keys.
- [ ] Dogfood note in README for long-running pi sessions.

## Evidence

- `.pi/extensions/smart-router/extension-setup.ts` — `sessionRouting`
- `src/domain/delegation/execution-ledger.ts` — `bySession`
- `src/api/middleware/pi-router-middleware.ts` — `LifecycleHookState`

## Dependencies

None.

## Out of scope

- SQLite row eviction (already implemented)
- A8 SQLite blocking

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/smart-router-extension.test.ts -t "session"
npx vitest run tests/unit/execution-ledger.test.ts
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Implement + test | Autonomous |
