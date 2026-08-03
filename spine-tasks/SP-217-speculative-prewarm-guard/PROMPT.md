# Task: SP-217 — Speculative Prewarm with Acceptance Guard

**Created:** 2026-08-02
**Size:** M

## Review Level: 1

**Assessment:** Optional speculative local/encoder prewarm with hard deadline and adaptive acceptance guard (Colibri PILOT pattern); default off; fail open.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 2, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#117
- Bucket: feature
- Closes: #117
- Release: v0.15.0
- Manifest: `spine-tasks/_authoring/release-v0.15.0/manifest.md`

## Mission

Closes #117 — When early signals lean local / economical, optionally **prewarm** the local runtime or encoder within a strict TTFT budget, and **disable** that speculation when warm-hit rate or deadline miss rate is poor — fail open to the normal safe route. Config default **off**. Hard deadline: timeout → cancel and proceed (no hang). Adaptive guard: low acceptance → disable for session with telemetry-visible reason. Remains pre-generation (never waits on generated tokens). Explain/telemetry: `prewarm_attempted` / `prewarm_accepted` / `prewarm_disabled_reason`. Complements #115/#116 but must not depend on them shipping first. No FrugalGPT cascades.

## Dependencies

- **None**

## Context to Read First

- GitHub #117 body (AC)
- `src/domain/pipeline/router-pipeline.ts` — prewarm hook insertion point (local_zero / hardware stages)
- `src/config/defaults.ts` — operator config knobs (default off)
- `src/infrastructure/telemetry/routing-telemetry.ts` — explain fields
- Manifest: `spine-tasks/_authoring/release-v0.15.0/manifest.md`

## Environment

- **Workspace:** `src/domain/routing/`, `src/domain/pipeline/`, `src/config/`, `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/routing/speculative-prewarm.ts` (create), `src/domain/pipeline/router-pipeline.ts`, `src/config/defaults.ts`, `tests/unit/speculative-prewarm.test.ts` (create), `src/infrastructure/telemetry/routing-telemetry.ts` |
| May change | `src/domain/types/**`, `src/domain/types/schemas.ts`, `.pi/extensions/smart-router/fleet-bootstrap.ts` (config passthrough only), `tests/unit/**`, `tests/integration/**` |
| Must NOT change | `src/infrastructure/hardware/**`, `.pi/extensions/smart-router/commands.ts`, `src/domain/routing/expected-cost.ts`, `src/domain/routing/workload-heat.ts`, `src/domain/pinning/**`, `config/release-gates.json`, encoder defaults |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/speculative-prewarm.test.ts` |
| fileScopeMustChange | `src/domain/routing/speculative-prewarm.ts`, `src/domain/pipeline/router-pipeline.ts`, `src/config/defaults.ts`, `tests/unit/speculative-prewarm.test.ts`, `src/infrastructure/telemetry/routing-telemetry.ts` |
| fileScopeMustNotChange | `src/infrastructure/hardware/**`, `.pi/extensions/smart-router/commands.ts`, `src/domain/routing/expected-cost.ts`, `config/release-gates.json` |
| completionCriteria | Default-off prewarm; hard deadline fail-open; adaptive disable + telemetry fields; unit tests for timeout / low-acceptance / default-off; #117 closable. |

## Steps

### Step 1: Prewarm module + config (default off)

- [ ] Speculative prewarm module with injectable clock / cancel for tests
- [ ] Operator config gated; default **off**
- [ ] Hard deadline ms; timeout → cancel and continue normal route
- [ ] Unit tests: default-off; artificial delay > budget → no hang

**Plan-review checkpoint** — Confirm pre-generation only (no wait on generated tokens).

### Step 2: Pipeline wire + adaptive guard + telemetry

- [ ] Wire hook into router pipeline when early signals lean local/economical
- [ ] Adaptive guard: low warm success / hit rate → disable for session
- [ ] Explain/telemetry: `prewarm_attempted` / `prewarm_accepted` / `prewarm_disabled_reason`
- [ ] Unit/integration coverage for disable-on-low-acceptance

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related pipeline / telemetry unit tests if touched
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #117 and close when complete

## Documentation Requirements

**Must Update:**
- (none shared — avoid README lane collapse; document knobs in defaults / module header)

**Check If Affected:**
- `README.md` (SP-216 owns — leave unless critical)
- `docs/routing-roadmap.md`

## Completion Criteria

- [ ] Default-off speculative prewarm with hard deadline fail-open
- [ ] Adaptive session disable + telemetry fields
- [ ] Pre-generation only preserved
- [ ] #117 closable

## Git Commit Convention

- `feat(SP-217): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Edit hardware placement / commands (SP-216) or heat/expected-cost/pinning (SP-215)
- Wait on generated tokens to decide route
- Default prewarm **on**
- Flip encoder defaults or absolute release gates
- Close #95 / #110 / #115 / #116

## Amendments

None.
