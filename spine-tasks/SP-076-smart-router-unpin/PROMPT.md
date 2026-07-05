# Task: SP-076 — Smart Router Unpin Command

**Created:** 2026-07-05
**Size:** S

## Review Level: 1

**Assessment:** Add `/smart-router unpin` to clear current session pin for dogfooding.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#35
- Bucket: feature

## Mission

Session pins persist in `.pi-smart-router/state.db` and survive `/reload`. Operators testing routing must use `/new` or manual SQLite deletes. Add `/smart-router unpin` to clear the current session pin in-memory and SQLite so the next request runs the full pipeline.

## Dependencies

- SP-074

## Context to Read First

- `.pi/extensions/smart-router/commands.ts` — completions and usage string
- `.pi/extensions/smart-router/index.ts` — `registerSmartRouterCommand`, `session_start` restore
- `src/domain/pinning/session-pinner.ts` — `breakPin()`
- `tests/unit/smart-router-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/index.ts` |
| May change | `tests/unit/smart-router-extension.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | /smart-router unpin clears current session pin only; next route not session_pinned; completions and README updated. |

## Testing

- Extension: `smart-router-extension.test.ts` — unpin clears pin, no-op without pin
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Command parsing and completions

- [ ] Add `unpin` to `parseSmartRouterArgs`, `TOP_LEVEL` completions, `SMART_ROUTER_USAGE`

### Step 2: Handler

- [ ] Resolve `ctx.sessionManager.getSessionId()`
- [ ] Call `runtime.streamDeps.sessionPinner.breakPin(sessionId)` (or equivalent access)
- [ ] Notify success or no-op if no pin

### Step 3: Tests and docs

- [ ] Extension unit test for unpin handler
- [ ] README operator commands table
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] `/smart-router unpin` works without SQLite manual edits
- [ ] Current session only; other sessions untouched
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-076): description`

## Do NOT

- Add `unpin all` in this task
- Change pin break rules in SessionPinner

---

## Amendments (Added During Execution)
