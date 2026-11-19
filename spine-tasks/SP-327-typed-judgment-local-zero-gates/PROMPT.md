# Task: SP-327 — Typed-judgment local_zero gates + low-confidence guard

**Created:** 2026-11-19
**Size:** M

## Review Level: 2

**Assessment:** Skip local_zero on high destructive / tool_use shortfall from typed judgment; finish #188.
**Score:** 5/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 2

## Source

- GitHub: beettlle/pi-smart-router#188
- Epic: beettlle/pi-smart-router#183
- Release: v1.5.0
- Bucket: feature
- Closes: #188
- Partial: #183

## Mission

When judgment is present:

1. `destructive ≥ threshold` or `toolUse > local ceiling` → skip `local_zero` with `typed_judgment_destructive` / `typed_judgment_tool_use_shortfall` in `localZeroGateSkipReasons`.
2. Keep SP-326 low-confidence raise-only semantics for any tier interaction remaining in this packet.
3. Fixture: #97 cleanup with local ready → **not** `local_zero`.
4. Keyword/cue-count fallbacks remain when judgment is null.

## Dependencies

- SP-326

## Context to Read First

- Issue #188 Verification
- `src/domain/pipeline/local-zero-stage.ts`, `stage-helpers.ts` (`estimateCheapToolUseRequirement`)
- SP-326 tier hint wiring on main after integrate

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/local-zero-stage.ts`, `tests/unit/local-zero-tier.test.ts` |
| May change | `src/domain/pipeline/stage-helpers.ts`, `src/domain/pipeline/router-pipeline.ts`, `tests/unit/router-pipeline-local-zero-throughput.test.ts` |
| Must NOT change | `.pi/extensions/`, `src/infrastructure/`, `package.json`, `README.md`, `.review/` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/local-zero-tier.test.ts tests/unit/router-pipeline-local-zero-throughput.test.ts && bash scripts/spine-stet-contract-run.sh default SP-327` |
| fileScopeMustChange | `src/domain/pipeline/local-zero-stage.ts`, `tests/unit/local-zero-tier.test.ts` |
| fileScopeMustNotChange | `.pi/extensions/`, `package.json`, `README.md`, `.review/` |
| completionCriteria | #97 cleanup skips local_zero with typed_judgment_* reasons; null judgment unchanged; #188 closable |

## Steps

### Step 0: Preflight

- [ ] Read local_zero gate reason plumbing
- [ ] Confirm SP-326 on main

### Step 1: Gates

- [ ] destructive / tool_use skip reasons
- [ ] Merge into localZeroGateSkipReasons + telemetry

### Step 2: Testing & Verification

- [ ] #97 fixture; null judgment path
- [ ] Run Contract `testCommand`
- [ ] Call `spine_review_step` after each implementation step

## Do NOT

- Edit README (SP-328)
- HyDRA requirements_source (#189)

## Completion Criteria

- [ ] #188 closed
- [ ] Contract green

## Git Commit Convention

`feat(SP-327): typed-judgment local_zero gates (#188)`
