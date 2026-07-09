# Task: SP-151 — Eval harness fixture format and counterfactual replay

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #79 part 1 — agent-native eval harness core with counterfactual trace replay.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#79
- Release: v0.5.0
- Bucket: feature

## Mission

Create offline evaluation harness foundation under `scripts/eval/` or `tests/eval/`. Define fixture trace format for multi-turn agent sessions with step-level routing decisions. Implement counterfactual replay: evaluate "cheap at step k" vs verified tool progression. Frozen model catalog + checkpoint date metadata for reproducible published numbers.

## Dependencies

- SP-116 (calibration aggregate patterns for feature export)

## Context to Read First

- `docs/routing-roadmap.md` §5 eval harness
- `scripts/calibration-aggregate.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- GitHub #79 acceptance criteria
- RouterBench / LLMRouterBench references in issue body

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/counterfactual-replay.ts`, `scripts/eval/fixture-schema.ts` |
| May change | `tests/eval/fixtures/`, `tests/eval/counterfactual-replay.test.ts`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/eval/counterfactual-replay.ts`, `scripts/eval/fixture-schema.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Fixture schema defined; counterfactual replay runs on sample traces; frozen catalog metadata; unit tests pass. |

## Steps

### Step 1: Fixture schema and sample traces

- [ ] Define JSON schema for step-level agent trace fixtures
- [ ] Add sample fixtures under `tests/eval/fixtures/`
- [ ] Document frozen model catalog + checkpoint date fields

### Step 2: Counterfactual replay core

- [ ] Implement replay engine comparing actual vs counterfactual routing at each step
- [ ] Compute cumulative regret vs hindsight-optimal routing on fixtures
- [ ] Add `npm run routing:eval-replay` script entry

### Step 3: Testing and verification

- [ ] Unit tests on fixture traces
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Fixture trace format with step-level prefixes
- [ ] Counterfactual replay: cheap-at-step-k vs verified progression
- [ ] Frozen model catalog metadata in fixtures
- [ ] Unit tests on sample traces
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-151): description`

## Do NOT

- Production shadow deploy
- Re-open or implement #1, #25, #26 (operator excluded)

---
