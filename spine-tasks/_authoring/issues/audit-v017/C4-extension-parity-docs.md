## Summary

Document the feature parity gap between library `createRouter()`/`GatewayDispatch` and the pi extension production path.

## Priority

P2

## Pipeline stages

`src/index.ts`, `.pi/extensions/smart-router/route-and-delegate.ts`, `planning-delegate.ts`

## Problem / motivation

Extension-only features: planning delegate spawn, stream failover loop, output headroom escalation, cursor quota handling. Embedders using `createRouter()` get a thinner product without clear documentation (Sonnet audit P1/P2).

## Proposed solution

- [ ] Add README section “Library vs extension” listing extension-only capabilities.
- [ ] Document recommended integration path for pi vs npm embedders.
- [ ] Cross-link B7 (facade implementation) for migration plan.
- [ ] Note middleware stub (`pi-router-middleware.ts`) vs extension stream path.
- [ ] Optional diagram in docs (ASCII or mermaid in README).

## Evidence

- `.pi/extensions/smart-router/route-and-delegate.ts` — failover loop ~377–595
- `src/api/middleware/pi-router-middleware.ts` — lifecycle stub only
- Sonnet: library vs extension split

## Dependencies

| Issue | Role |
|-------|------|
| B7 | Implementation to close gap over time |

## Out of scope

- Implementing parity in library (B7 scope)
- #71 planning delegate reimplementation

## Verification

```bash
# Docs review only — link check in PR
npm run lint  # if markdown lint exists
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Documentation | Autonomous |
