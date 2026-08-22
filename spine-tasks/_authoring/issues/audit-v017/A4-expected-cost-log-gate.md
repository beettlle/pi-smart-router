## Summary

Gate `logExpectedCostExplain` behind `SMART_ROUTER_LOG_ROUTING` so expected-cost internals are not dumped to stdout on every eligible route.

## Priority

P0

## Pipeline stages

`src/domain/pipeline/router-pipeline.ts` — `logExpectedCostExplain`

## Problem / motivation

When P(success) weights are trained, `RouterPipeline.logExpectedCostExplain` (~lines 1646–1687, called ~1583) emits unconditional `console.info('Expected-cost tier gate', { p_success_*, expected_cost_by_tier, … })`. This fired thousands of times during `npm test` and leaks per-turn cost/calibration internals in production.

## Proposed solution

- [ ] Wrap explain output in `SMART_ROUTER_LOG_ROUTING` check (same pattern as other routing debug logs).
- [ ] Alternatively route through structured telemetry only (no stdout) when logging env is unset.
- [ ] Add unit test: default env → no stdout from expected-cost explain on route.
- [ ] Full `npm test` stdout should not flood with expected-cost lines.

## Evidence

- `src/domain/pipeline/router-pipeline.ts` — `logExpectedCostExplain`
- 0.17 audit Grok P0-4

## Dependencies

None.

## Out of scope

- Changing expected-cost math (#70, #78 closed)
- #110 calibration training

## Verification

```bash
npm run typecheck
npm test 2>&1 | grep -c "Expected-cost tier gate"  # expect 0 without SMART_ROUTER_LOG_ROUTING=1
npx vitest run tests/unit/router-pipeline.test.ts -t "expected-cost"  # if exists
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Fix + test | Autonomous |
