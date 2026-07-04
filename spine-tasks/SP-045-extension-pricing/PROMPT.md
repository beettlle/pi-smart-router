# Task: SP-045 — Extension Pricing Broker

**Created:** 2026-07-04
**Size:** M

## Review Level: 2

**Assessment:** Wire price broker into extension fleet build with manual LiteLLM refresh.
**Score:** 4/8

## Mission

Connect the existing tri-tier price broker (`resolvePrice`, `resolveFleetPrices`) to the pi extension fleet build so routing and failover use live catalog prices when available. Add a **manual** pricing refresh path (no background cron): operator runs `/smart-router pricing refresh` or equivalent documented command to fetch LiteLLM JSON from `LITELLM_PRICING_URL` (with a sensible default URL) and persist to SQLite via `putPriceCatalog`. Surface staleness warnings via existing `checkStaleness` on status/session start.

## Dependencies

- SP-044

## Context to Read First

- `.pi/extensions/smart-router/index.ts` — fleet build, `/smart-router` command from SP-042
- `src/infrastructure/pricing/price-broker.ts` — tri-tier resolution (SP-031)
- `src/infrastructure/pricing/pricing-monitor.ts` — staleness check (SP-031)
- `src/infrastructure/persistence/sqlite-store.ts` — `getPriceCatalog` / `putPriceCatalog`
- `src/domain/types/entities.ts` — `PriceCatalog`
- `README.md` — `LITELLM_PRICING_URL`, `ROUTER_STATE_DB_PATH`
- `docs/PRD.md` — tri-tier pricing priority (manual refresh defers async cron)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts`, `src/infrastructure/pricing/` |
| Must NOT change | `src/domain/matching/hydra-matcher.ts`, `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/infrastructure/pricing/` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Manual refresh persists PriceCatalog; fleet build applies resolved prices; staleness warning on status when catalog >14 days old; no automatic background fetch. |

## Steps

### Step 1: LiteLLM fetch helper

- [ ] Add `src/infrastructure/pricing/litellm-fetch.ts` (or similar) to fetch and normalize LiteLLM pricing JSON into `PriceCatalog.registry_snapshot`
- [ ] Read URL from `LITELLM_PRICING_URL` env var with documented default (LiteLLM GitHub pricing JSON)
- [ ] Validate response shape; fail fast with actionable error on malformed data
- [ ] Unit tests with mocked fetch — no network in CI

### Step 2: Manual refresh command

- [ ] Extend `/smart-router` with `pricing refresh` subcommand
- [ ] On refresh: fetch → `putPriceCatalog` → rebuild fleet with updated prices
- [ ] Show summary (models updated count, `last_updated`) in command output
- [ ] Do **not** implement cron, timers, or automatic fetch on startup

### Step 3: Fleet build integration

- [ ] During `discoverFleet` / fleet mapping, load catalog from SQLite store
- [ ] Apply `resolveFleetPrices()` (or per-model `resolvePrice`) to set effective `fallback_cost_per_1m` on fleet profiles before `createRouterFromFleet`
- [ ] Call `checkStaleness` on session start or `/smart-router status` and surface warning when stale
- [ ] When no catalog exists, use existing mapper defaults unchanged

### Step 4: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-045): description`

## Do NOT

- Add background cron or scheduled pricing fetch
- Modify pipeline stage logic (`router-pipeline.ts`)
- Modify HyDRA matcher core
- Map pi registry `Model.cost` (SP-046)

---

## Amendments (Added During Execution)
