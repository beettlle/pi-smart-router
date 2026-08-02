# Task: SP-213 — Bounded Planning Delegate Timeouts

**Created:** 2026-08-02
**Size:** M

## Review Level: 1

**Assessment:** Add global + per-call timeout knobs for planning_delegate / fan-out so stalled workers cannot hang TTFT or pin the session (llm-use worker timeout pattern).
**Score:** 3/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#120
- Bucket: feature
- Closes: #120
- Release: v0.14.0
- Manifest: `spine-tasks/_authoring/release-v0.14.0/manifest.md`

## Mission

Closes #120 — Enforce bounded parallel worker execution for `planning_delegate` (and any parallel fan-out path in this extension): document global + per-call timeout knobs; on timeout cancel/abandon the sub-call, record a reason code, and fall back to the configured safe path (no hang). Add telemetry analogs (`worker_timeout_count`, `workers_succeeded` / `workers_spawned` where applicable). Unit/integration test with an injected slow worker. No FrugalGPT cascades; no unbounded ThreadPool/queue growth; no acceptance criterion requires another beettlle package.

## Dependencies

- **None**

## Context to Read First

- GitHub #120 body (AC)
- `.pi/extensions/smart-router/planning-delegate.ts` — current delegate execution
- `tests/integration/planning-delegate.test.ts`
- `src/config/defaults.ts` / operator config for planning_delegate knobs
- Landed #71 planning_delegate contract (SP-142–SP-145)
- Manifest: `spine-tasks/_authoring/release-v0.14.0/manifest.md`

## Environment

- **Workspace:** `.pi/extensions/smart-router/`, `src/config/`, `tests/`
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/planning-delegate.ts`, `tests/integration/planning-delegate.test.ts` |
| May change | `src/config/defaults.ts`, `src/domain/types/**` (timeout config types), `src/infrastructure/telemetry/routing-telemetry.ts`, `.pi/extensions/smart-router/**` (knob wiring only), `tests/unit/**`, `README.md`, `docs/**` |
| Must NOT change | `config/release-gates.json`, encoder defaults, `src/domain/pricing/virtual-cost-v2.ts`, `src/domain/routing/degraded-route-sandwich.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/integration/planning-delegate.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/planning-delegate.ts`, `tests/integration/planning-delegate.test.ts` |
| fileScopeMustNotChange | `config/release-gates.json`, `src/domain/pricing/virtual-cost-v2.ts` |
| completionCriteria | Global + per-call timeouts documented and enforced; slow worker → cancel + reason + safe fallback; telemetry fields present; #120 closable. |

## Steps

### Step 1: Timeout knobs + enforce

- [ ] Document global + per-call timeout knobs for planning_delegate / fan-out
- [ ] On timeout: cancel/abandon sub-call, record reason code, fall back to safe path (no hang)
- [ ] Telemetry: `worker_timeout_count`, `workers_succeeded` / `workers_spawned` (or documented analogs)

**Plan-review checkpoint** — Confirm no unbounded queue growth; defaults keep existing happy-path behavior.

### Step 2: Slow-worker test + docs

- [ ] Integration/unit test with injected slow worker (mirror llm-use timeout test intent)
- [ ] Operator-facing note for knobs (README or operator-config docs)

### Step 3: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Run related planning-delegate unit tests if present
- [ ] Run `npm run verify:ci` if time allows
- [ ] Coverage: `npm run coverage:check` — ≥77% line coverage
- [ ] Comment on #120 and close when complete

## Documentation Requirements

**Must Update:**
- None required unless knobs need a short README / operator-config note — list path in File Scope May change if added

**Check If Affected:**
- `README.md`
- `docs/routing-roadmap.md`

## Completion Criteria

- [ ] Global + per-call timeouts enforced with documented knobs
- [ ] Timeout → cancel + reason + safe fallback (no hang)
- [ ] Telemetry fields present
- [ ] #120 closable

## Git Commit Convention

- `feat(SP-213): description`

## Do NOT

- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Flip encoder defaults or absolute release gates
- Change virtual cost math or quota feed (SP-214)
- Implement batch orchestration stall timers (pi-spine concern)
- Close #95 / #110

## Amendments

None.
