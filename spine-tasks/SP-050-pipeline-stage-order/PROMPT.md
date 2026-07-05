# Task: SP-050 — Pipeline Stage Order

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Fix pipeline stage order so local zero-tier runs before triage cloud exit for trivial prompts.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#15
- Bucket: bug

## Mission

Brutal audit identified a PRD vs implementation mismatch in `RouterPipeline` stage ordering.

In `src/domain/pipeline/router-pipeline.ts`, the triage stage routes `trivial` verdicts to `economical-cloud` with an early exit. The local zero-tier stage runs later and never executes when triage decides first.

PRD Step 4 expects: if hardware passes and task is trivial → prefer local HTTP backends before economical cloud.

Proposed fix (pick one):
1. Reorder stages — run local zero-tier before triage cloud exit when hardware probe is `full_local` or `classification_only`, or
2. Change triage — for `trivial` verdict, pass through to local zero-tier stage instead of selecting cloud immediately

## Dependencies

- SP-046

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts`
- `docs/PRD.md` — Step 4 alignment
- `tests/integration/routing-latency.test.ts`
- `src/domain/triage/triage-engine.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `tests/integration/routing-latency.test.ts`, `tests/unit/router-pipeline.test.ts`, `docs/PRD.md` |
| Must NOT change | `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/index.ts` |
| completionCriteria | Trivial prompt + capable hardware + healthy local backend routes to local zero-tier; fallback to economical cloud when no local backends; ordering regression tests pass. |

## Steps

### Step 1: Analyze and choose fix approach

- [ ] Read current stage order in `router-pipeline.ts` (~lines 133–198)
- [ ] Choose reorder vs triage pass-through based on PRD Step 4 semantics

### Step 2: Implement stage order fix

- [ ] Ensure trivial + capable hardware + healthy local backend → local zero-tier (not economical cloud)
- [ ] Preserve fallback: trivial + no local backends / hardware disabled → economical cloud

### Step 3: Ordering regression tests

- [ ] Add unit or integration tests covering ordering regression
- [ ] Update PRD Step 4 or pipeline diagram if semantics change

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check`

## Completion Criteria

- [ ] Trivial + local backends routes to zero-tier before cloud exit
- [ ] Fallback path unchanged when local unavailable
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-050): description`

## Do NOT

- Modify extension wiring (SP-049)
- Change triage keyword logic beyond what's needed for ordering fix

---

## Amendments (Added During Execution)

- **2026-07-04:** SP-048 landed a 3-line lint fix in `router-pipeline.ts` (`_request` unused var). Stage-order work remains; amend contract if spine flags prelanded path.
