# Task: SP-222 — Loop-escalation structured failure signals

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Detect tool failures via is_error/status instead of naive body substring matching.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#132
- PR: #127 (community)
- Bucket: bug
- Closes: #132
- Release: v0.16.2

## Mission

Closes #132 — Loop escalation must detect failures from structured host signals (`is_error` / `status>=400`) instead of grepping tool output for "error". Wire producer in `mapContextMessages`; sync JSON contract; trust explicit signals over body heuristics.

## Dependencies

- None (disjoint from SP-221)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pinning/loop-escalation.ts`, `src/domain/types/entities.ts`, `src/domain/types/schemas.ts`, `specs/001-build-smart-router/contracts/routing-request.schema.json`, `.pi/extensions/smart-router/routing-context.ts`, `tests/unit/loop-escalation.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npx vitest run tests/unit/loop-escalation.test.ts tests/unit/smart-router-extension.test.ts -t "structured failure|isError"` |
| fileScopeMustChange | `src/domain/pinning/loop-escalation.ts` |
| completionCriteria | Structured signals; contract sync; producer wiring; trust-signal short-circuit; tests |

## Completion Criteria

- [x] `Message` + Zod + JSON contract include optional `is_error` / `status`
- [x] `mapContextMessages` maps pi `isError` → `is_error`
- [x] `isToolFailure` trusts explicit signals; body fallback only when absent
- [x] Rate-limit vs auth-denied pattern buckets split
- [x] Unit tests for flag / status / benign / rate-limit paths
