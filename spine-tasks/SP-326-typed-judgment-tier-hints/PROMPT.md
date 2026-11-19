# Task: SP-326 — Typed-judgment tier hints + planning override consumers

**Created:** 2026-11-19
**Size:** M

## Review Level: 2

**Assessment:** Consume typedJudgment for planning override and low_intensity tier hints; never lower below deterministic floors.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#188
- Epic: beettlle/pi-smart-router#183
- Release: v1.5.0
- Bucket: feature
- Partial: #188 (tier/planning; local_zero gates in SP-327)
- Partial: #183

## Mission

When `RoutingContext.typedJudgment` is present:

1. `task_kind ∈ {plan, review, debug}` with confidence ≥ threshold → planning override + minimum tier (operator-configurable map; document defaults).
2. `capability_deserved` → tier hint: level 0 only onto zero-tier/flash-class; ≥ level 2 hints `frontier-cloud`. Use SP-323 flash-class definition.
3. Low-confidence: below `typed_judgment.min_confidence`, judgment may **raise** tiers but never lower them.
4. Never lower below session-depth floor (#179/SP-323), loop-escalation, or context-fit.
5. Regex/keyword paths remain fallback when judgment is null.
6. Explain / LOG_ROUTING shows which judgment field drove the hint.

Do **not** implement local_zero destructive/tool_use gates here (SP-327).

## Dependencies

- SP-323
- SP-324

## Context to Read First

- Issue #188 Proposed solution + Verification fixtures
- `src/domain/pipeline/typed-judgment-stage.ts`, `pipeline-stage.ts`
- `src/domain/pipeline/turn-envelope-stage.ts`, `low-intensity-stage.ts` (or equivalent)
- `src/domain/judgment/**`, `src/domain/triage/turn-envelope.ts` (PLANNING_PATTERNS fallback)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None (fake judgment in tests)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/turn-envelope-stage.ts`, `src/domain/pipeline/low-intensity-stage.ts`, `tests/unit/turn-envelope.test.ts`, `tests/unit/router-pipeline-low-intensity.test.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/types/entities.ts`, `tests/unit/router-pipeline-turn-envelope.test.ts` |
| Must NOT change | `.pi/extensions/`, `src/infrastructure/`, `src/domain/pipeline/local-zero-stage.ts`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/turn-envelope.test.ts tests/unit/router-pipeline-low-intensity.test.ts tests/unit/router-pipeline-turn-envelope.test.ts && bash scripts/spine-stet-contract-run.sh default SP-326` |
| fileScopeMustChange | `src/domain/pipeline/turn-envelope-stage.ts`, `src/domain/pipeline/low-intensity-stage.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/local-zero-stage.ts`, `.pi/extensions/`, `package.json`, `.review/` |
| completionCriteria | Planning + capability hints applied; low-confidence never lowers; null judgment → prior behavior; never below SP-323 floor; tests green |

## Steps

### Step 0: Preflight

- [ ] Confirm typed_judgment stage on main; list consumer hook points
- [ ] Confirm flash-class helper from SP-323

### Step 1: Tier hint + planning override

- [ ] task_kind planning override + capability_deserved hints
- [ ] Low-confidence raise-only + floor guards

### Step 2: Testing & Verification

- [ ] Fixtures: #23 planning → frontier; trivial Minimal still allowed; null judgment unchanged
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- local_zero gates (SP-327)
- HyDRA requirements_source (#189)
- Flip defaults without operator approval

## Completion Criteria

- [ ] Partial #188 tier/planning AC met
- [ ] Contract green

## Git Commit Convention

`feat(SP-326): typed-judgment tier hints (#188)`
