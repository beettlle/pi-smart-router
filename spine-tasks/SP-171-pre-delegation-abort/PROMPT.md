# Task: SP-171 — Pre-Delegation Abort Checks

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** Add throwIfAborted at phase boundaries before fleet refresh, dispatch, planning delegate, and failover loop.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#90
- Parent: beettlle/pi-smart-router#87
- Bucket: bug
- Closes: #90
- Partial: #87

## Mission

Long work runs before any events reach pi with no signal check: `ensureFleetFresh`, `dispatch`, planning delegate. Add `throwIfAborted(options)` at top of `routeAndDelegate`, before fleet refresh, before dispatch, before planning delegate, and each failover loop iteration. Document limitation: HyDRA/routing cannot cancel mid-ONNX (fail-fast before/after only).

## Dependencies

- **Task:** SP-170 (live piping + abort path must exist so early abort UX is coherent)

## Context to Read First

- `.pi/extensions/smart-router/route-and-delegate.ts`
- `.pi/extensions/smart-router/planning-delegate.ts`
- `.pi/extensions/smart-router/utils.ts` — abort helpers from SP-169
- `tests/unit/smart-router-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/planning-delegate.ts` |
| May change | `.pi/extensions/smart-router/route-and-delegate.ts`, `.pi/extensions/smart-router/delegate-stream.ts`, `tests/unit/smart-router-extension.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/planning-delegate.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/**` |

## Steps

### Step 1: Phase-boundary abort checks

- [ ] `throwIfAborted(options)` at top of `routeAndDelegate`
- [ ] Before `ensureFleetFresh`, before `dispatch`, before planning delegate
- [ ] At each failover loop iteration
- [ ] Document HyDRA mid-ONNX cancel limitation (comment or README)

### Step 2: Pre-delegation abort test

- [ ] Unit test: abort during mocked slow `dispatch` — delegation never starts

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Abort checks at all listed phase boundaries
- [ ] Slow-dispatch abort test passes
- [ ] HyDRA limitation documented
- [ ] Parent #87 closable when #88–#91 done (this task closes #90)

## Git Commit Convention

- `fix(SP-171): description`

## Do NOT

- Change slash-command handlers (SP-172)
- Revert live piping from SP-170
- Change `src/domain/pipeline/**`

---

## Amendments (Added During Execution)

### Amendment 1 — 2026-07-10

**Issue:** Preflight `prelanded-file-scope` — SP-169 already changed `route-and-delegate.ts` on main.
**Resolution:** Redirected `fileScopeMustChange` to `.pi/extensions/smart-router/planning-delegate.ts` (abort wiring on planning sub-call). Worker may still edit `route-and-delegate.ts` under May change for phase-boundary `throwIfAborted`; contract proof is `planning-delegate.ts` diff.
