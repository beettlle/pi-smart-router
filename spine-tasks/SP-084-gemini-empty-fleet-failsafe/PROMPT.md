# Task: SP-084 — Gemini tool-history empty-fleet fail-safe

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Complete #38 — prevent `unknown` delegation when tool-history guard filters all Google/Gemini models from scoped fleet.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#38
- Bucket: bug

## Mission

SP-077 shipped the Gemini tool-history guard but left a dogfood blocker: when the scoped fleet is Google/Gemini-only (or all candidates are filtered), `effectiveFleet` is empty → `safeCloudDefault()` returns `undefined` → `selected_model_id: 'unknown'` → delegation throws in `route-and-delegate.ts`.

Amend the guard so tool-history sessions never delegate with `unknown` model id. When filtered fleet is empty, throw an actionable error (unless `force_model_id` override). When non-Gemini models exist (`cursor/auto`, Claude, OpenAI mini), route to them.

## Dependencies

- SP-083

## Context to Read First

- `src/domain/routing/tool-history-guard.ts`
- `.pi/extensions/smart-router/route-and-delegate.ts`
- `src/domain/pipeline/router-pipeline.ts` — `buildFallbackDecision`, safe-default path
- `src/domain/pipeline/safe-default.ts`
- `tests/unit/tool-history-guard.test.ts`
- `tests/unit/smart-router-extension.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/route-and-delegate.ts` |
| May change | `src/domain/routing/tool-history-guard.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/domain/pipeline/safe-default.ts`, `tests/unit/tool-history-guard.test.ts`, `tests/unit/smart-router-extension.test.ts`, `README.md` |
| Must NOT change | `src/config/pi-model-mapper.ts` (SP-085) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| fileScopeMustNotChange | `src/config/pi-model-mapper.ts` |
| completionCriteria | Empty filtered fleet never produces unknown delegation; actionable error when no non-Gemini model remains; cursor/auto routes when in fleet. |

## Testing

- Unit: `tests/unit/tool-history-guard.test.ts` — empty fleet and force_model_id cases
- Extension: `tests/unit/smart-router-extension.test.ts` — no unknown delegation with cursor/auto in fleet
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Empty-fleet detection and fail-safe

- [ ] Add helper or metadata when `effectiveFleet.length === 0` after tool-history filter
- [ ] Honor `force_model_id` override to use unfiltered fleet when set
- [ ] Throw actionable error when no routable non-Gemini model remains

### Step 2: Wire route-and-delegate fail-fast

- [ ] Block delegation before `unknown` model id reaches registry lookup
- [ ] Unit tests: google-only fleet + tool history → explicit error (not unknown)
- [ ] Unit tests: fleet with `cursor/auto` + tool history → routes to cursor

### Step 3: Docs and integration test

- [ ] Extension integration test: no `No registry model available for routing decision unknown` when `cursor/auto` in scoped fleet
- [ ] README troubleshooting: guard behavior, empty-fleet remediation, cross-links #37, #40, #41, pi#6342
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Tool-history sessions never delegate to Google/Gemini unless `force_model_id` override
- [ ] Sessions without tool history unchanged
- [ ] Filtered empty fleet never produces `selected_model_id: 'unknown'`
- [ ] Actionable error when no non-Gemini model remains in effective fleet
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-084): description`

## Do NOT

- Revert SP-077 exclusion logic
- Change pi-model-mapper tier rules (SP-085 scope)

---
