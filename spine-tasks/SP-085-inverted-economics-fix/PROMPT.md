# Task: SP-085 — Fix inverted routing economics and cost telemetry

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Complete #41 P0 — map Gemini 3.x Pro to frontier tier; cost-aware turn envelope selection; populate estimated_cost_usd.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#41
- Bucket: bug

## Mission

Dogfood telemetry (289 rows) showed inverted economics: ~83% of `tool_result` turns routed to `gemini-3.1-pro-preview` while main-loop stayed on flash-lite. Root cause: `gemini-3.1-pro-preview` falls through to `UNKNOWN_DEFAULTS` → economical-cloud, and `turnEnvelope` picks first economical model via `.find()`.

Fix mapper tier for Gemini 3.x Pro, replace first-match with lowest-cost economical selection in turn envelope (and sub-route policy), and populate `estimated_cost_usd` on stage decisions where pricing is available.

## Dependencies

- SP-084

## Context to Read First

- `src/config/pi-model-mapper.ts`
- `src/domain/pipeline/router-pipeline.ts` — `turnEnvelope`, `TURN_TIER_MAP`
- `src/domain/pinning/sub-route-policy.ts`
- `src/infrastructure/telemetry/routing-telemetry.ts`
- `src/infrastructure/pricing/price-broker.ts`
- `tests/unit/pi-model-mapper.test.ts`
- `tests/unit/router-pipeline.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/config/pi-model-mapper.ts` |
| May change | `src/domain/pipeline/router-pipeline.ts`, `src/domain/pinning/sub-route-policy.ts`, `src/infrastructure/telemetry/routing-telemetry.ts`, `tests/unit/pi-model-mapper.test.ts`, `tests/unit/router-pipeline.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/route-and-delegate.ts` (SP-084) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/config/pi-model-mapper.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/route-and-delegate.ts` |
| completionCriteria | gemini-3.1-pro-preview maps to frontier-cloud; tool_result routes economical; estimated_cost_usd populated when pricing available. |

## Testing

- Unit: `tests/unit/pi-model-mapper.test.ts` — Gemini 3.x Pro tier mapping
- Unit: `tests/unit/router-pipeline.test.ts` — cost-aware turn envelope selection
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Mapper tier fix

- [ ] Add `gemini[-_.]?3.*pro` and generic `gemini.*pro` patterns → `FRONTIER_DEFAULTS`
- [ ] Regression test: `gemini-3.1-pro-preview` → `frontier-cloud`

### Step 2: Cost-aware turn envelope selection

- [ ] Replace `.find()` first-match in `turnEnvelope` with lowest-cost economical-cloud model
- [ ] Update `evaluateSubRoutePolicy` to pick cheapest same-provider economical model
- [ ] Unit tests for cost-aware selection

### Step 3: Cost telemetry and verification

- [ ] Populate `estimated_cost_usd` on turn_envelope, session_pin, hydra_match decisions via price-broker
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] `mapPiModelToProfile({ provider: 'google', id: 'gemini-3.1-pro-preview' })` returns `tier: 'frontier-cloud'`
- [ ] `tool_result` turns route to economical model (flash-lite/flash), not pro
- [ ] `estimated_cost_usd` non-zero on telemetry rows where pricing is available
- [ ] Unit/integration tests cover mapper and turn-envelope selection
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-085): description`

## Do NOT

- Change tool-history guard behavior (SP-084)
- Add cursor/* mapper rules (SP-086)

---
