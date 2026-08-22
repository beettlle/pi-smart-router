## Summary

Stabilize SC-004 triage p95 latency test so `npm test` does not flake under parallel Vitest on non-CI hosts.

## Priority

P0

## Pipeline stages

`tests/unit/triage-engine.test.ts`

## Problem / motivation

SC-004 enforces p95 ≤ 5ms on non-CI (`onCi ? 50 : 5`) over 40 samples through full `RouterPipeline.route()`. Sonnet audit: full suite failed at ~6.6ms once, passed on rerun. Under parallel workers this undermines verification trust.

## Proposed solution

- [ ] Option A: Run SC-004 in isolated Vitest pool (`describe.sequential` / dedicated file / `fileParallelism: false` for that suite).
- [ ] Option B: Relax non-CI budget to realistic p95 (e.g. 10–15ms) with documented rationale; keep CI at 50ms.
- [ ] Option C: Mock heavy stages for latency unit test; separate perf benchmark for full pipeline.
- [ ] Document chosen approach in test comment.
- [ ] Verify 3 consecutive full `npm test` runs pass locally.

## Evidence

- `tests/unit/triage-engine.test.ts` ~lines 638–660
- `TRIAGE_LATENCY_BUDGET_MS = onCi ? 50 : 5`

## Dependencies

None.

## Out of scope

- Optimizing triage engine performance (separate perf work)

## Verification

```bash
npm test
npm test
npm test
# All three runs green on non-CI host
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Test stabilization | Autonomous |
