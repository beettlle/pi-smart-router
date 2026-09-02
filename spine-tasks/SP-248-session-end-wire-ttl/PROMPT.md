# Task: SP-248 — Wire session_end + optional TTL fallback

**Created:** 2026-09-02
**Size:** S

## Review Level: 1

**Assessment:** Call SP-247 eviction from pi session_end; optional orphan TTL; extension tests.
**Score:** 3/8 — Blast radius: 2 (extension lifecycle), Pattern novelty: 1 (pi hook discovery), Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#145
- Bucket: feature
- Closes: #145
- Release: v0.21.0
- Manifest: `spine-tasks/_authoring/release-v0.21.0/manifest.md`

## Mission

Closes #145 — wire **session teardown** so long-running pi processes do not retain `sessionRouting`, `ExecutionLedger`, and lifecycle maps forever:

1. Discover the correct pi ExtensionAPI for session end (prefer existing patterns in `session-lifecycle.ts` / pi-coding-agent types). If the API is unclear, **stop with a clear blocker note** in STATUS — do not invent a fake hook.
2. On session end: call SP-247 eviction helper for the session id (clears `sessionRouting`, ledger, lifecycle).
3. Optional TTL fallback for orphaned sessions (document timeout constant; fail open).
4. Extension/unit tests: after `session_end` (or simulated hook), maps do not retain session keys.
5. Do **not** edit README long-session note (SP-253).

## Dependencies

- **Task:** SP-247 (eviction APIs + helper must exist)

## Context to Read First

- Issue #145 — session_end + TTL acceptance
- `Parent split: SP-247 — eviction APIs` (this packet = wire)
- SP-247 PROMPT + landed helper export path
- `.pi/extensions/smart-router/session-lifecycle.ts`, `extension-setup.ts`
- `@earendil-works/pi-coding-agent` ExtensionAPI types for session lifecycle

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/session-lifecycle.ts` |
| May change | `.pi/extensions/smart-router/extension-setup.ts`, `.pi/extensions/smart-router/types.ts`, `tests/unit/smart-router-extension.test.ts`, `tests/integration/pi-extension.test.ts`, `tests/unit/**` (adjacent) |
| Must NOT change | `src/api/middleware/pi-router-middleware.ts` (owned by SP-247), `README.md` (SP-253), `src/domain/pipeline/router-pipeline.ts`, `package.json` (version) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/integration/pi-extension.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/session-lifecycle.ts` |
| fileScopeMustNotChange | `src/api/middleware/pi-router-middleware.ts`, `README.md`, `package.json` |
| completionCriteria | session_end (or documented equivalent) evicts in-memory session state via SP-247 helper; optional TTL documented in code; tests prove keys gone; #145 closable |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-247 helper is importable
- [ ] Locate pi session-end / dispose lifecycle API

### Step 1: Wire session_end + optional TTL

- [ ] Register session-end handler; call eviction helper
- [ ] Optional orphan TTL with documented constant
- [ ] Fail open if session id missing

### Step 2: Testing & Verification

- [ ] Tests cover post-end eviction (and TTL if implemented)
- [ ] Contract `testCommand` green
- [ ] #145 closable with SP-247

## Completion Criteria

- [ ] Session teardown wired; #145 closable

## Do NOT

- Re-implement eviction maps in extension without calling SP-247 helper
- Edit README (SP-253)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version
- Invent a lifecycle hook if pi has no session-end API — record blocker instead

## Git Commit Convention

- `feat(SP-248): wire session_end eviction (#145)`

## Amendments

- None
