# SP-241: Capture pi usage actuals into telemetry and stats — Status

**Current Step:** 1
**Status:** Pending
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** M

---

## Step 1: Capture usage at delegation completion

**Status:** Pending

- [ ] Identify stream/turn completion hook in extension delegation path
- [ ] Extract pi assistant `usage` fields when present; no-op when absent
- [ ] Attach `actual_cost_usd` + token breakdown to the routing/telemetry record; keep `estimated_cost_usd`

## Step 2: Stats prefer actuals

**Status:** Pending

- [ ] Update session-stats / savings math to prefer actuals when present
- [ ] Clearly label estimate-only rows when actuals missing
- [ ] Subscription `cost.total === 0`: still store token actuals; do not invent USD

## Step 3: Testing and verification

**Status:** Pending

- [ ] Contract `testCommand` green
- [ ] Missing-usage path does not throw / fail route
- [ ] Full `npm test` once if contract suite is narrow

## Completion Criteria

- [ ] Actual usage recorded when available; estimated fields retained
- [ ] `/smart-router stats` prefers actuals or labels estimates
- [ ] Fail-open covered by tests
- [ ] Partial #164 — calibration left to SP-242

## Discoveries

(none yet)
