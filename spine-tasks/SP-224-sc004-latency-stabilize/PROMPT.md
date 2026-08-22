# Task: SP-224 — Stabilize SC-004 triage p95 test

**Created:** 2026-08-22
**Size:** S

## Review Level: 1

**Assessment:** Fix SC-004 flake under parallel Vitest on non-CI hosts.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#139
- Bucket: bug
- Closes: #139
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #139 — SC-004 in `triage-engine.test.ts` enforces p95 ≤ 5ms (non-CI) over 40 full-pipeline samples and flakes under parallel workers. Stabilize via isolated pool, realistic budget with documented rationale, or mocked stages — document chosen approach. Three consecutive `npm test` runs must pass locally.

## Dependencies

- None

## Context to Read First

- `tests/unit/triage-engine.test.ts` — SC-004 ~638–660, `TRIAGE_LATENCY_BUDGET_MS`
- `vitest.config.ts` — parallelism settings

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/triage-engine.test.ts` |
| May change | `vitest.config.ts` (only if dedicated pool/file needed) |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` (no perf optimization) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm test` |
| fileScopeMustChange | `tests/unit/triage-engine.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | SC-004 stable under parallel Vitest; approach documented in test comment; 3x `npm test` green; #139 closable |

## Steps

### Step 1: Stabilize SC-004

- [ ] Pick approach (isolated pool, relaxed non-CI budget, or mocked stages)
- [ ] Document rationale in test comment
- [ ] Implement stabilization

### Step 2: Testing and verification

- [ ] Run `npm test` three times consecutively
- [ ] Run Contract `testCommand`

## Completion Criteria

- [ ] SC-004 no longer flakes under parallel Vitest
- [ ] Approach documented
- [ ] #139 closable

## Do NOT

- Optimize triage engine performance (out of scope)
- Change CI budget without documenting rationale
