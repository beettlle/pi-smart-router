# Task: SP-152 — Three-track eval harness (capability, cost, continuity)

**Created:** 2026-07-09
**Size:** M

## Review Level: 1

**Assessment:** #79 part 2 — three-track agent-native eval harness (RouterBench + LLMRouterBench lineage).
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#79
- Release: v0.5.0
- Bucket: feature

## Mission

Extend eval harness with three tracks: **capability coverage**, **cost arbitrage**, and **latency/continuity**. Each track scores routing decisions on fixture traces using SP-151 replay core. Output aggregate metrics JSON suitable for CI smoke and local comparison. Align metric names with routing-roadmap §5 where applicable.

## Dependencies

- SP-151

## Context to Read First

- `scripts/eval/counterfactual-replay.ts`
- `docs/routing-roadmap.md` §5
- GitHub #79 three-track requirements
- RouterBench / LLMRouterBench paper references in issue

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/eval/harness-tracks.ts` |
| May change | `scripts/eval/run-harness.ts`, `tests/eval/harness-tracks.test.ts`, `package.json` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/eval/harness-tracks.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Three tracks implemented; aggregate metrics output; unit tests per track; npm script for local run. |

## Steps

### Step 1: Track implementations

- [ ] Capability track: routing tier vs required capability on fixtures
- [ ] Cost track: cumulative cost vs hindsight-optimal
- [ ] Continuity track: pin breaks and cache miss proxy metrics

### Step 2: Harness runner

- [ ] Implement `run-harness.ts` orchestrating all tracks
- [ ] Add `npm run routing:eval-harness` script entry
- [ ] Output metrics JSON with track summaries

### Step 3: Testing and verification

- [ ] Unit tests per track on sample fixtures
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Three-track harness: capability / cost / continuity
- [ ] Aggregate metrics JSON output
- [ ] Unit tests per track
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-152): description`

## Do NOT

- Re-implement replay core (SP-151)
- Re-open or implement #1, #25, #26 (operator excluded)

---
