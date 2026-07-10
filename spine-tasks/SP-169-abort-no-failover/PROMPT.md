# Task: SP-169 — Abort Must Not Trigger Failover

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** Fix abort-as-failover bug in routeAndDelegate catch path; shared helper + mid-stream abort test.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#89
- Parent: beettlle/pi-smart-router#87
- Bucket: bug
- Closes: #89
- Partial: #87

## Mission

When the user presses ESC mid-stream, `collectDelegatedStream` throws abort, but `routeAndDelegate`'s catch treats it as `STREAM_DELEGATION_ERROR` and calls `selectFailover` → retry. Fix so abort ends the outer stream with `reason: 'aborted'` and **never** calls `selectFailover`. Add shared `isAbortError` / `throwIfAborted` helper. Close SP-041 mid-stream abort review gap.

## Dependencies

- **None**

## Context to Read First

- `.pi/extensions/smart-router/route-and-delegate.ts` — failover catch (~STREAM_DELEGATION_ERROR)
- `.pi/extensions/smart-router/delegate-stream.ts` — abort throw path
- `.pi/extensions/smart-router/stream-delegation.ts`
- `tests/unit/smart-router-extension.test.ts` — existing pre-aborted test
- `spine-tasks/SP-041-stream-delegation/.reviews/3-20260704T182425.md` — mid-stream abort gap

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/route-and-delegate.ts` |
| May change | `.pi/extensions/smart-router/delegate-stream.ts`, `.pi/extensions/smart-router/stream-delegation.ts`, `.pi/extensions/smart-router/utils.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/**` |
| completionCriteria | Mid-stream abort ends with reason aborted and selectFailover not called; pre-aborted regression still passes; shared abort helper exists. |

## Steps

### Step 1: Abort helper and catch path

- [ ] Add shared helper e.g. `isAbortError(error, options)` and/or `throwIfAborted(options)`
- [ ] In `routeAndDelegate` catch: if abort, push `{ type: 'error', reason: 'aborted', ... }`, `outer.end()`, **do not** call `selectFailover`
- [ ] Keep STREAM_DELEGATION_ERROR failover path for non-abort failures

### Step 2: Mid-stream abort tests

- [ ] Unit test: mock emits 1–2 events then signal aborts; `selectFailover` **not** called; outer ends with `reason: 'aborted'`
- [ ] Unit test: pre-aborted signal still skips delegation (regression)

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Abort never triggers failover retry
- [ ] Mid-stream abort unit test passes
- [ ] Pre-aborted regression still passes
- [ ] Shared abort helper in place

## Git Commit Convention

- `fix(SP-169): description`

## Do NOT

- Refactor live piping (SP-170)
- Add pre-delegation abort checks beyond catch path (SP-171)
- Modify slash commands (SP-172)
- Change `src/domain/pipeline/**`

---

## Amendments (Added During Execution)
