# Task: SP-312 — Mixed capability-source fairness within a tier

**Created:** 2026-10-24
**Size:** M

## Review Level: 2

**Assessment:** Benchmark-grounded capabilities (e.g. `claude-opus-4-5` ≈ 0.71–0.76) sit far below pattern defaults (frontier 0.95), so a grounded model can lose to an ungrounded one only because of where its numbers came from.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#193
- Release: v1.3.0 (operator-approved fourth enhancement, 2026-10-24)
- Bucket: feature
- Closes: #193 (with SP-310, SP-311)

## Mission

`withBenchmarkCapabilities` in `src/config/pi-model-mapper.ts` replaces pattern defaults with raw normalized leaderboard scores (0–1 of the leaderboard's max). Pattern defaults are on a different scale. `capability_source` is recorded but never used in scoring.

Pick one fix, document it in the mapper header comment, and test it:

- **Preferred:** place grounded scores on the pattern-default scale per tier — e.g. rescale each capability dimension so the best grounded model in a tier maps to that tier's pattern default and others keep their relative gaps (bounded to [tier floor, tier default]). Ungrounded models keep pattern defaults.
- **Alternative:** if rescaling breaks existing eval fixtures in ways that are not intended, lower pattern defaults to the grounded scale instead — only with eval evidence.

Constraints:

- A grounded model must not rank below an ungrounded model of the same tier solely because of capability source.
- Relative order among grounded models is preserved (Opus vs Sonnet stays as the leaderboards say).
- Tier assignment does not change.
- Eval gates must not regress: run the corpus smoke and the release-gate report and record before/after in STATUS.

## Dependencies

- SP-311 (refreshed grounded rows)

## Context to Read First

- `src/config/pi-model-mapper.ts` (`withBenchmarkCapabilities`, `FRONTIER_DEFAULTS`, `ECONOMICAL_DEFAULTS`)
- `config/benchmark-profiles.json`
- `src/domain/matching/hydra-matcher.ts` (how capabilities enter scoring / shortfall gate)
- `tests/unit/pi-model-mapper.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts`
- Issue beettlle/pi-smart-router#193

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper-capability-scale.test.ts` |
| May change | `tests/unit/pi-model-mapper.test.ts`, `tests/unit/pi-model-mapper-coverage.test.ts` |
| Must NOT change | `package.json`, `config/benchmark-profiles.json`, `config/release-gates.json`, `src/domain/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/pi-model-mapper-capability-scale.test.ts tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts && npm run routing:eval-harness:corpus-smoke && bash scripts/spine-stet-contract-run.sh default SP-312` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts`, `tests/unit/pi-model-mapper-capability-scale.test.ts` |
| fileScopeMustNotChange | `package.json`, `config/benchmark-profiles.json`, `config/release-gates.json`, `src/domain/`, `.review/` |
| completionCriteria | Grounded models no longer lose to ungrounded same-tier models by source alone; grounded relative order preserved; tiers unchanged; corpus smoke green with before/after recorded |

## Steps

### Step 0: Preflight

- [ ] Record current capabilities for the scoped fleet and a corpus-smoke baseline

### Step 1: Implementation

- [ ] Scale fix in `withBenchmarkCapabilities` (or documented alternative) with header comment

### Step 2: Testing & Verification

- [ ] Same-tier grounded vs ungrounded: grounded best-of-tier ≥ ungrounded default
- [ ] Grounded relative order preserved; tiers unchanged
- [ ] Corpus smoke + release-gate report before/after in STATUS
- [ ] Run Contract `testCommand`

## Do NOT

- Edit benchmark scores or release-gate thresholds
- Change tier assignment rules (SP-310)

## Completion Criteria

- [ ] #193 fairness item met
- [ ] Contract tests green
