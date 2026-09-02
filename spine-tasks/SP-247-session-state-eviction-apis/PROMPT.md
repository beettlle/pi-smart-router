# Task: SP-247 — Session-state eviction APIs + unit tests

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Add explicit eviction APIs for in-memory session maps; unit-test only — no pi lifecycle hook yet.
**Score:** 3/8 — Blast radius: 2 (middleware + ledger), Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#145
- Bucket: feature
- Partial: #145 (wire + TTL is SP-248)
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Partial #145 — ship **testable eviction primitives** so long-lived pi processes can drop per-session routing state without waiting for process exit:

1. Add `LifecycleHookState.evict(sessionId)` that deletes the session bucket (not only consume one-shot flags).
2. Confirm / keep `ExecutionLedger.clear(sessionId)` as the ledger eviction entrypoint (already present — cover with tests if gaps).
3. Add a small pure helper (e.g. `evictInMemorySessionState`) that clears ledger + lifecycle + an optional `sessionRouting` `Map` for one session id — callable from extension code in SP-248.
4. Unit tests: after evict/clear, maps do not retain the session key.
5. Do **not** register pi `session_end` or TTL (SP-248). Do **not** edit README (SP-253).

## Dependencies

- **None**

## Context to Read First

- Issue #145 body — proposed solution + verification
- `Parent split: SP-247/248 — #145 session teardown` (this packet = APIs)
- `src/api/middleware/pi-router-middleware.ts` — `LifecycleHookState`
- `src/domain/delegation/execution-ledger.ts` — `clear`
- `.pi/extensions/smart-router/extension-setup.ts` — `sessionRouting` Map shape (read-only for this task)
- `tests/unit/execution-ledger.test.ts`, middleware/extension tests that touch lifecycle

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/api/middleware/pi-router-middleware.ts` |
| May change | `src/domain/delegation/execution-ledger.ts`, new helper under `src/domain/` or `src/api/` (session eviction util), `src/index.ts` (export if public), `tests/unit/execution-ledger.test.ts`, `tests/unit/pi-router-middleware.test.ts`, `tests/unit/**` (new adjacent) |
| Must NOT change | `.pi/extensions/smart-router/**` (wire in SP-248), `README.md` (SP-253), `src/domain/pipeline/router-pipeline.ts`, `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/execution-ledger.test.ts tests/unit/pi-router-middleware.test.ts` |
| fileScopeMustChange | `src/api/middleware/pi-router-middleware.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/**`, `README.md`, `package.json` |
| completionCriteria | LifecycleHookState.evict deletes session; helper clears ledger+lifecycle+sessionRouting map entry; unit tests prove keys gone after eviction |

## Steps

### Step 0: Preflight

- [ ] Read #145 + existing `LifecycleHookState` / `ExecutionLedger.clear`
- [ ] Confirm no existing `session_end` eviction path

### Step 1: Eviction APIs + helper

- [ ] Implement `LifecycleHookState.evict(sessionId)`
- [ ] Add helper that clears ledger + lifecycle + optional `sessionRouting` map for one id
- [ ] Export helper if needed for extension import in SP-248

### Step 2: Testing & Verification

- [ ] Unit tests: after `evict`/`clear`/helper, session keys absent
- [ ] Contract `testCommand` green
- [ ] `npm run typecheck` clean

## Completion Criteria

- [ ] Eviction APIs + helper landed with unit coverage
- [ ] Partial #145 (wire remains SP-248)

## Do NOT

- Register pi lifecycle hooks or TTL orphan cleanup (SP-248)
- Edit README / operator docs (SP-253)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-247): session-state eviction APIs (#145)`

## Amendments

- None
