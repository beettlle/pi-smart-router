# Task: SP-088 — Gate LMU status on active smart-router provider

**Created:** 2026-07-06
**Size:** S

## Review Level: 1

**Assessment:** Fix #43 — LMU footer line must show only when active model is smart-router/auto.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#43
- Bucket: bug

## Mission

The smart-router extension sets `smart-router-lmu` status after delegation and restores it on `session_start`, but never clears it when the operator switches to a non-smart-router model (e.g. `/model cursor/auto`). Gate LMU display on the active provider, clear on `model_select` away from smart-router, and fix unconditional `session_start` restore.

## Dependencies

- SP-087

## Context to Read First

- `.pi/extensions/smart-router/session-lifecycle.ts`
- `.pi/extensions/smart-router/extension-setup.ts`
- `.pi/extensions/smart-router/fleet-bootstrap.ts` — `formatLmuStatus`
- `tests/unit/smart-router-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/session-lifecycle.ts` |
| May change | `.pi/extensions/smart-router/extension-setup.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/session-lifecycle.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | LMU visible only under smart-router/auto; cleared on model switch; session restore gated; unit tests pass. |

## Testing

- Unit: `tests/unit/smart-router-extension.test.ts` — `isSmartRouterActive`, `model_select` clears/sets LMU, `session_start` restore gated
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Active-provider gate helper

- [ ] Add `isSmartRouterActive(model)` — true when `provider === 'smart-router'` and `id === 'auto'`
- [ ] Wrap `setLmuStatus` so it no-ops when active model is not smart-router/auto

### Step 2: model_select + session_start hooks

- [ ] Register `model_select`: clear LMU when switching away; optionally restore last delegated model when switching to smart-router/auto
- [ ] Gate `session_start` LMU restore on `isSmartRouterActive(ctx.model)`; call `clearLmuStatus()` otherwise

### Step 3: Tests

- [ ] Unit tests for clear on non-smart-router select, set on delegation under smart-router, no restore when session model is cursor/auto
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Footer shows `LMU:` only when active model is `smart-router/auto`
- [ ] `/model cursor/auto` clears LMU immediately
- [ ] Session restore with `cursor/auto` does not show stale LMU
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-088): description`

## Do NOT

- Re-open #1, #25, #26 (reserved for dogfooding)

---
