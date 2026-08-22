# Task: SP-221 — Exclude smart-router/auto from delegation fleet

**Created:** 2026-08-22
**Size:** S

## Review Level: 1

**Assessment:** Prevent router self-recursion by excluding virtual model from dispatch fleet.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#131
- PR: #126 (community)
- Bucket: bug
- Closes: #131
- Release: v0.16.2

## Mission

Closes #131 — Keep `smart-router/auto` selectable in Pi but exclude it from the delegation fleet so the router cannot delegate to itself. Do not persist the virtual selector as `force_model_id` after `/model smart-router/auto`.

## Dependencies

- None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/fleet-bootstrap.ts`, `src/api/middleware/pi-router-middleware.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npx vitest run tests/unit/smart-router-pricing.test.ts tests/unit/pi-router-middleware.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/fleet-bootstrap.ts` |
| completionCriteria | Fleet excludes smart-router/auto; cursor/auto retained; model_select guard; regression tests |

## Completion Criteria

- [x] `discoverFleet` excludes `smart-router/auto` from scoped fleet
- [x] `model_select` with `source=set` for `smart-router/auto` does not set force model
- [x] Regression tests pass
