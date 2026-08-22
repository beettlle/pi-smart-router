# Task: SP-230 — RouterPipeline concurrent route() safety

**Created:** 2026-08-22
**Size:** M

## Review Level: 1

**Assessment:** Fix or document instance-level transient state so concurrent route() cannot corrupt decisions.
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#141
- Bucket: enhancement
- Closes: #141
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #141 — `RouterPipeline` stores per-route state on instance fields (~304–338). Concurrent `route()` calls race. **Preferred:** refactor transient state into per-call `RoutingContext`. **Minimum:** document single-flight contract + test proving no cross-contamination or documenting serialization assumption. Export concurrency contract in `createRouter()` docs.

## Dependencies

- None

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — instance fields ~304–338, `route()` reset
- `tests/unit/router-pipeline.test.ts`
- `src/index.ts` — `createRouter()` export docs

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/router-pipeline.test.ts` |
| May change | `README.md` (concurrency contract) |
| Must NOT change | Full B1 pipeline split (#143) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/router-pipeline.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| completionCriteria | Per-call context or documented single-flight; concurrent/contract test; createRouter docs; #141 closable |

## Steps

### Step 1: Refactor or document concurrency contract

- [ ] Move transient state to per-call RoutingContext **or** document pi serialization guarantee
- [ ] Code comment on concurrency expectations

### Step 2: Test and document

- [ ] Test overlapping route() calls or single-flight assumption
- [ ] README/createRouter concurrency note

### Step 3: Testing and verification

- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Safe concurrency contract enforced or documented with test
- [ ] #141 closable

## Do NOT

- Full B1 god-object split in this task (#143)
- Change routing policy outcomes
