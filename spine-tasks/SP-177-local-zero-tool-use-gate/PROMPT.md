# Task: SP-177 — Local Zero Tool-Use Gate

**Created:** 2026-07-10
**Size:** M

## Review Level: 1

**Assessment:** Add a pre-`local_zero` capability/tool-use gate so agentic turns skip zero-tier when predicted tool need exceeds local capacity.
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#98
- Bucket: feature
- Closes: #98

## Mission

Local catalog `tool_use: 0.1` only participates in HyDRA shortfall matching, which never runs after a `local_zero` early-exit. Add a pre-`local_zero` heuristic or cheap requirement estimate for likely tool use (git/bash/edit/explore/delete/repo cues). Skip `local_zero` when predicted tool need exceeds local model capability (or a configurable max). Add operator knobs such as `local_zero.max_tool_use_requirement` and/or `local_zero.enabled`. Emit a telemetry skip reason (e.g. `tool_use_capability_shortfall`). Tests: agentic turn-1 with local ready → not `local_model_ready` / not `local_zero` win.

## Dependencies

- **Task:** SP-176 (triage cleanup classification lands first; serialize `router-pipeline.ts` after triage wave)

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — `localZeroTierStage`, eligibility helpers
- `src/domain/matching/hydra-matcher.ts` — `computeShortfall` / `tool_use` (read for reuse patterns; do not move full HyDRA into local_zero)
- `src/domain/routing/tier-features.ts` — `buildTierFeatures` / requirement fields
- `src/config/defaults.ts`, `config/operator-config.json.example` — operator knobs
- `tests/unit/local-zero-tier.test.ts`, `tests/unit/router-pipeline.test.ts`
- GitHub #98 acceptance criteria

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts` |
| May change | `src/config/defaults.ts`, `src/domain/types/**`, `config/operator-config.json.example`, `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/local-zero-tier.test.ts`, `tests/unit/router-pipeline.test.ts`, `README.md` |
| Must NOT change | `src/domain/triage/**`, `src/domain/pinning/loop-escalation.ts`, `.pi/extensions/smart-router/index.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/local-zero-tier.test.ts tests/unit/router-pipeline.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `src/domain/triage/**`, `src/domain/pinning/loop-escalation.ts` |
| completionCriteria | Pre-local_zero tool-use/capability gate skips zero-tier when predicted need exceeds local capacity; operator knobs exist; telemetry skip reason present; agentic turn-1 with local ready does not win local_zero. |

## Steps

### Step 1: Pre-local_zero capability estimate + skip

- [ ] Add cheap tool-use / capability estimate before `local_zero` dispatch (git/bash/edit/explore/delete/repo cues or equivalent)
- [ ] Skip `local_zero` when predicted need exceeds local capability or configured max
- [ ] Record skip reason for telemetry (e.g. `tool_use_capability_shortfall`)

### Step 2: Operator config + tests

- [ ] Add operator knobs: `local_zero.max_tool_use_requirement` and/or `local_zero.enabled` (defaults preserve current cheap-path behavior for true trivial traffic)
- [ ] Document knobs in `config/operator-config.json.example` and README if operator-facing
- [ ] Tests: agentic turn-1 with local ready → not `local_zero` / not `local_model_ready` win; trivial path still eligible when under threshold

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/local-zero-tier.test.ts tests/unit/router-pipeline.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage

## Completion Criteria

- [ ] Pre-`local_zero` heuristic/estimate for likely tool use
- [ ] Skip when predicted need exceeds local capability or configured max
- [ ] Operator config knobs present with safe defaults
- [ ] Telemetry reason when skipped
- [ ] Tests prove agentic turn-1 with local ready does not win `local_zero`

## Documentation Requirements

| Scope | Paths |
|-------|-------|
| Must Update | `config/operator-config.json.example` (new knobs) |
| Check If Affected | `README.md` |

## Git Commit Convention

- `feat(SP-177): description`

## Do NOT

- Re-run full HyDRA shortfall on every cheap turn (keep estimate cheap)
- Reimplement triage keyword work (#97 / SP-176)
- Implement SAAR pin-break / history (#99 / SP-178)
- Flip defaults so all local_zero traffic is disabled without operator opt-in

---

## Amendments (Added During Execution)
