# Task: SP-170 — Live Stream Event Piping

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Refactor buffered collect/flush to live outer.push; update failover notice and tests.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#88
- Parent: beettlle/pi-smart-router#87
- Bucket: bug
- Closes: #88
- Partial: #87

## Mission

Stream delegation buffers all provider events until the turn completes, then flushes — UI looks frozen. Refactor so events forward to pi **live** (`for await (const event of innerStream) outer.push(event)`). Adapt `injectFailoverNotice` for live piping (synthetic `text_delta` before retry). Keep `delegateWithOutcome` recording after stream ends. Planning delegate may stay buffered (document choice).

## Dependencies

- **Task:** SP-169 (abort-no-failover must land first so live abort UX is correct)

## Context to Read First

- `.pi/extensions/smart-router/delegate-stream.ts` — `collectDelegatedStream`
- `.pi/extensions/smart-router/delegation-runtime.ts` — `flushDelegatedEvents`, `injectFailoverNotice`
- `.pi/extensions/smart-router/route-and-delegate.ts`
- Pi GitLab Duo example: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-provider-gitlab-duo/index.ts`
- `tests/unit/smart-router-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/delegate-stream.ts`, `.pi/extensions/smart-router/route-and-delegate.ts` |
| May change | `.pi/extensions/smart-router/delegation-runtime.ts`, `.pi/extensions/smart-router/planning-delegate.ts`, `tests/unit/smart-router-extension.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegate-stream.ts`, `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/**` |
| completionCriteria | Consumer receives text_delta or start before done on mocked slow stream; existing failover tests updated and pass. |

## Steps

### Step 1: Live pipe to outer

- [ ] Refactor happy path to push events to `outer` as they arrive (no full-turn buffer)
- [ ] Adapt `injectFailoverNotice` for live piping (push synthetic notice before retry stream)
- [ ] Keep `delegateWithOutcome` outcome recording after stream ends without re-buffering happy path
- [ ] Document planning-delegate buffer vs discard choice in code comment or README

### Step 2: Live-forwarding tests

- [ ] Unit test: consumer receives `text_delta` or `start` **before** `done` on mocked slow stream
- [ ] Update existing delegation/failover tests — do not remove coverage

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Live event forwarding on delegated streams
- [ ] Failover notice works without array mutation of buffered events
- [ ] Live-forwarding unit test passes
- [ ] Existing delegation/failover tests pass

## Git Commit Convention

- `fix(SP-170): description`

## Do NOT

- Revert SP-169 abort handling
- Add slash-command signal wiring (SP-172)
- Change `src/domain/pipeline/**`

---

## Amendments (Added During Execution)
