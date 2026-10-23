# Task: SP-303 — HyDRA loop flag reuses loop-escalation failure detection

**Created:** 2026-10-22
**Size:** S

## Review Level: 1

**Assessment:** Heuristic bug — the HyDRA `loop:1` flag uses a raw substring grep that misfires on benign text and ignores structured `is_error` / `status` signals.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#186
- Release: v1.2.2
- Bucket: bug
- Closes: #186

## Mission

`resolveLoopPressure` in `src/domain/matching/hydra-input.ts` calls a local `looksLikeToolFailure` that lowercases the body and checks `FAILURE_PATTERNS` substrings. `"Build finished: no errors, 0 warnings."` yields `loop:1`.

`src/domain/pinning/loop-escalation.ts` already has the correct precedence in its private `isToolFailure(msg)`: `is_error` → `status >= 400` → `looksLikeFailure` (benign negations excluded; failure, rate-limit and auth-denied patterns).

- Extract `isToolFailure` and its pattern lists into one shared domain module (e.g. `src/domain/pinning/tool-failure.ts`); export `isToolFailure(msg: Message): boolean`.
- `loop-escalation.ts` imports it (behavior unchanged).
- `hydra-input.ts` uses it for the latest tool message and deletes its local `FAILURE_PATTERNS` / `looksLikeToolFailure`.
- No duplicated failure heuristics remain between the two files.

## Dependencies

- None

## Context to Read First

- `src/domain/matching/hydra-input.ts`
- `src/domain/pinning/loop-escalation.ts` (`isToolFailure`, `looksLikeFailure`, pattern constants)
- `tests/unit/hydra-input.test.ts`, `tests/unit/loop-escalation.test.ts`
- Issue beettlle/pi-smart-router#186

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/matching/hydra-input.ts`, `src/domain/pinning/loop-escalation.ts`, `tests/unit/hydra-input.test.ts` |
| May change | new `src/domain/pinning/tool-failure.ts`, `tests/unit/loop-escalation.test.ts` |
| Must NOT change | `package.json`, `.pi/extensions/**`, `src/infrastructure/**`, `src/domain/delegation/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/hydra-input.test.ts tests/unit/loop-escalation.test.ts` |
| fileScopeMustChange | `src/domain/matching/hydra-input.ts`, `tests/unit/hydra-input.test.ts` |
| fileScopeMustNotChange | `package.json`, `.pi/extensions/` |
| completionCriteria | Shared helper; HyDRA loop flag follows is_error → status → tightened body; #186 acceptance cases green; loop-escalation tests unchanged and green |

## Steps

### Step 0: Preflight

- [ ] Confirm `Message` exposes `is_error` / `status` on tool messages in the routing types

### Step 1: Implementation

- [ ] Extract shared `isToolFailure`
- [ ] Use it in `loop-escalation.ts` and `hydra-input.ts`; remove local heuristics

### Step 2: Testing & Verification

- [ ] `is_error: true` or `status >= 400` → `loop:1` regardless of body
- [ ] `is_error: false` or `status < 400` → `loop:0` without body grep
- [ ] `"no errors"`, `"without failure"` → `loop:0`
- [ ] `"HTTP 429 Rate limit exceeded"` with no structured signal → `loop:1`
- [ ] Run Contract `testCommand`

## Do NOT

- Change loop-escalation thresholds or signatures
- Change other HyDRA metadata flags

## Completion Criteria

- [ ] #186 acceptance criteria met
- [ ] Contract tests green
