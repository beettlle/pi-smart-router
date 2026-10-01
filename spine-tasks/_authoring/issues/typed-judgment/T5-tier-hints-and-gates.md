## Summary

Use the typed judgment for tier hints and `local_zero` gating, replacing keyword/regex classification when a judgment is present. Epic: {{EPIC}}.

## Priority

P1

## Pipeline stages

`turn_envelope` planning override, `low_intensity` tier hint, `local_zero` gate.

## Problem / motivation

Current classifiers are keyword/regex lists that over- and under-match:

- `PLANNING_PATTERNS` in `src/domain/triage/turn-envelope.ts` fires on any "design" or "plan" word.
- `COMPLEX_KEYWORDS` in `src/domain/triage/triage-engine.ts` includes plain `'clean up'` / `'cleanup'` (#97 band-aid).
- `estimateCheapToolUseRequirement` in `src/domain/pipeline/stage-helpers.ts` is a 0 / 0.55 / 0.75 / 0.9 cue-count step function (#98).

Measured on local OpenJev: #97 cleanup → destructive 1.00, tool_use 2.0/3; #23 planning → `plan` (1.00); trivial indent → capability 0.02.

## Proposed solution

- [ ] `task_kind ∈ {plan, review, debug}` with confidence ≥ threshold → minimum tier (operator-configurable map, defaults documented) and planning override. Regex path remains the fallback when judgment is null.
- [ ] `capability_deserved` → tier hint: level 0 (Minimal) is the only level allowed onto zero-tier or flash-class models; ≥ level 2 (High) hints `frontier-cloud`. Uses the flash-class definition delivered in #179.
- [ ] `destructive ≥ threshold` or `toolUse > local ceiling` → skip `local_zero` with reason codes `typed_judgment_destructive` / `typed_judgment_tool_use_shortfall` (merged into `localZeroGateSkipReasons`).
- [ ] Low-confidence guard: below `typed_judgment.min_confidence`, the judgment may raise tiers but never lower them.
- [ ] The judgment **never lowers below** the deterministic session-depth floor from #179, a loop-escalation decision, or a context-fit constraint.
- [ ] Explain / LOG_ROUTING shows which judgment field drove the hint.

## Evidence

See epic (incident replay table).

## Dependencies

| Issue | Role |
|-------|------|
| {{T4}} | Stage populating `RoutingContext.typedJudgment` |
| #179 | Session-depth floor + flash-class definition |

## Out of scope

- HyDRA requirement source (separate issue).
- Removing the keyword/regex classifiers (kept as fallback until the eval decision).

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/router-pipeline*.test.ts tests/unit/local-zero*.test.ts tests/unit/turn-envelope*.test.ts
```

- Fixtures: #97 cleanup with local ready → not `local_zero`; #23 planning with economical pin → frontier; trivial prompt with judgment Minimal → local/economical still allowed.
- Low-confidence judgment never lowers a tier.
- Judgment null → current behavior.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Consumers + tests | Autonomous |
| Threshold defaults approve | Operator |
