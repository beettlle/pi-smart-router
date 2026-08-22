# Task: SP-223 — Gate expected-cost explain logging

**Created:** 2026-08-22
**Size:** S

## Review Level: 1

**Assessment:** Wrap `logExpectedCostExplain` behind `SMART_ROUTER_LOG_ROUTING` to stop stdout flood.
**Score:** 2/8

## Source

- GitHub: beettlle/pi-smart-router#138
- Bucket: bug
- Closes: #138
- Release: v0.17.0
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## Mission

Closes #138 — `RouterPipeline.logExpectedCostExplain` must not emit unconditional `console.info` on every eligible route. Gate behind `SMART_ROUTER_LOG_ROUTING` (same pattern as other routing debug logs) or route through structured telemetry only when env unset. Default test runs must not flood with `Expected-cost tier gate` lines.

## Dependencies

- None

## Context to Read First

- `src/domain/pipeline/router-pipeline.ts` — `logExpectedCostExplain`, call site ~1583
- Existing `SMART_ROUTER_LOG_ROUTING` checks in pipeline
- Manifest: `spine-tasks/_authoring/release-v0.17.0/manifest.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/pipeline/router-pipeline.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/**`, `config/release-gates.json`, expected-cost math modules |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/router-pipeline.test.ts` |
| fileScopeMustChange | `src/domain/pipeline/router-pipeline.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| completionCriteria | Default env: no stdout from expected-cost explain on route; `SMART_ROUTER_LOG_ROUTING=1` still emits; unit test proves gate; #138 closable |

## Steps

### Step 1: Gate explain logging

- [ ] Wrap `logExpectedCostExplain` output in `SMART_ROUTER_LOG_ROUTING` check (or telemetry-only path)
- [ ] Preserve explain content when logging env is enabled

### Step 2: Testing and verification

- [ ] Add unit test: default env → no `Expected-cost tier gate` on route
- [ ] Run Contract `testCommand`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] No unconditional stdout from expected-cost explain
- [ ] Unit test covers gated behavior
- [ ] #138 closable

## Do NOT

- Change expected-cost tier math or calibration artifacts
- Modify `.spine/` or release gates
