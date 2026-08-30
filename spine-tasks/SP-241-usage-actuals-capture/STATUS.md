# SP-241: Capture pi usage actuals into telemetry and stats — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** M

---

## Step 1: Capture usage at delegation completion

**Status:** Complete

- [x] Identify stream/turn completion hook in extension delegation path
- [x] Extract pi assistant `usage` fields when present; no-op when absent
- [x] Attach `actual_cost_usd` + token breakdown to the routing/telemetry record; keep `estimated_cost_usd`

## Step 2: Stats prefer actuals

**Status:** Complete

- [x] Update session-stats / savings math to prefer actuals when present
- [x] Clearly label estimate-only rows when actuals missing
- [x] Subscription `cost.total === 0`: still store token actuals; do not invent USD

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` green
- [x] Missing-usage path does not throw / fail route
- [x] Full `npm test` once if contract suite is narrow

## Completion Criteria

- [x] Actual usage recorded when available; estimated fields retained
- [x] `/smart-router stats` prefers actuals or labels estimates
- [x] Fail-open covered by tests
- [x] Partial #164 — calibration left to SP-242

## Discoveries

- GitNexus `impact`/`context` tools truncated the `target` parameter to one character across 4 attempts; impact analysis performed by manual caller review instead. All SP-241 changes are additive (optional fields/methods, trailing optional params) — blast radius LOW.
- Telemetry rows are written at routing-decision time (router-pipeline emit → store.appendTelemetry), before delegation completes; actuals therefore land via a post-turn UPDATE keyed on request_id (newest row).
- `MemoryStore` intentionally left without `updateTelemetryUsageActuals` (File Scope); StorePort method is optional so the degraded store fails open.
- Failover: each attempt with usage overwrites the request's newest telemetry row — final attempt's actuals win; earlier failed-attempt spend is not summed (noted for SP-242 calibration input).
- Subscription rule implemented as: `cost.total === 0` (or missing) → token actuals recorded, `actual_cost_usd = null` (never invent USD).
