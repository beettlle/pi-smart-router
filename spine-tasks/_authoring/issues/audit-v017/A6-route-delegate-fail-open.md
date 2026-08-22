## Summary

Align `route-and-delegate.ts` with the pipeline never-throw constitution: exhausted failover and missing registry models must not crash the pi host.

## Priority

P0

## Pipeline stages

`.pi/extensions/smart-router/route-and-delegate.ts`

## Problem / motivation

Despite pipeline catch-all → safe default, the extension throws when no registry model resolves (~356–362) and on unrecoverable stream errors after failover exhaustion (~579, 588). Primary pi integration path has a host-crash surface.

## Proposed solution

- [ ] Replace throws with structured error telemetry + safe fallback model selection (or pipeline re-route).
- [ ] Emit reason codes visible in explain / `SMART_ROUTER_LOG_ROUTING=1`.
- [ ] Add telemetry for silent phase-boundary aborts (long-work abort paths).
- [ ] Unit/integration tests: exhausted `failedModelIds` → no throw; host receives degraded response.
- [ ] Document behavior in extension README section.

## Evidence

- `.pi/extensions/smart-router/route-and-delegate.ts` ~356–362, ~579–588
- Sonnet audit P0; Gemini silent-abort note

## Dependencies

| Issue | Role |
|-------|------|
| A1 | CI should cover extension changes |

## Out of scope

- Planning delegate spawn logic (#71 closed)
- Full stream failover redesign

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/smart-router-extension.test.ts
npx vitest run tests/unit/pre-delegation-abort.test.ts
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Fail-open paths + tests | Autonomous |
