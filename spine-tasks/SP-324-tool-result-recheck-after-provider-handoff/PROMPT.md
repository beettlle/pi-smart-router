# Task: SP-324 — Re-check model on first tool_result after cross-provider handoff

**Created:** 2026-11-19
**Size:** S

## Review Level: 1

**Assessment:** First tool_result after Cursor→API (or cross-provider) handoff must re-evaluate instead of unconditional stickiness.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#179
- Epic: beettlle/pi-smart-router#182
- Release: v1.5.0
- Bucket: feature
- Closes: #179
- Partial: #182

## Mission

`turn_envelope` / `turn_tool_result` keep the main_loop model for cache/cost. After a **cross-provider handoff**, the first `tool_result` is high risk (foreign replay history). Implement detection + re-evaluation in `src/domain/routing/cross-provider-handoff.ts` and wire it from `turn-envelope-stage` (May change) so the first tool_result after a cross-provider handoff re-evaluates instead of unconditional stickiness.

Depends on SP-323 floor so re-check cannot reintroduce flash-class on deep sessions.

## Dependencies

- SP-323

## Context to Read First

- Issue #179 AC item 2
- `src/domain/pipeline/turn-envelope-stage.ts` (tool_result stickiness)
- Delegation provider fields on messages / session pin

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/cross-provider-handoff.ts`, `tests/unit/cross-provider-handoff.test.ts` |
| May change | `src/domain/pipeline/turn-envelope-stage.ts`, `tests/unit/turn-envelope.test.ts`, `src/domain/pipeline/router-pipeline.ts`, `tests/unit/router-pipeline-turn-envelope.test.ts` |
| Must NOT change | `.pi/extensions/`, `src/infrastructure/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/cross-provider-handoff.test.ts tests/unit/turn-envelope.test.ts tests/unit/router-pipeline-turn-envelope.test.ts && bash scripts/spine-stet-contract-run.sh default SP-324` |
| fileScopeMustChange | `src/domain/routing/cross-provider-handoff.ts`, `tests/unit/cross-provider-handoff.test.ts` |
| fileScopeMustNotChange | `.pi/extensions/`, `src/infrastructure/`, `package.json`, `.review/` |
| completionCriteria | First tool_result after cross-provider handoff re-evaluates (or documented exception); #179 closable; tests green |

## Steps

### Step 0: Preflight

- [ ] Trace how tool_result inherits main_loop model
- [ ] Define cross-provider handoff detection signal

### Step 1: Re-check wiring

- [ ] Implement first-tool_result re-evaluation after handoff
- [ ] Ensure SP-323 floor still applies

### Step 2: Testing & Verification

- [ ] Unit/integration covering handoff → first tool_result re-check
- [ ] Non-handoff tool_result stickiness preserved
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- Change degenerate-output handling (SP-325)
- Broadly disable tool_result stickiness for all turns

## Completion Criteria

- [ ] #179 closed
- [ ] Contract green

## Git Commit Convention

`feat(SP-324): recheck model after cross-provider handoff (#179)`

## Amendments

- **2026-11-20 (preflight / pre-landed file scope):** SP-323 already changed `turn-envelope-stage.ts` and `turn-envelope.test.ts` on main. Redirected delivery to new `src/domain/routing/cross-provider-handoff.ts` (+ unit test); stage wiring remains May change.
