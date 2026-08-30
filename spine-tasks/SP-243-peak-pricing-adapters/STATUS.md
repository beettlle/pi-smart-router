# SP-243: Peak/off-peak pricing adapters for Z.ai and DeepSeek — Status

**Current Step:** 1
**Status:** Pending
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** M

---

## Step 1: Adapters + injectable clock

**Status:** Pending

- [ ] Implement Z.ai + DeepSeek schedule adapters with injectable `now`
- [ ] Default Z.ai plan-profile `credits`; legacy multipliers only via documented override
- [ ] Map provider/model ids; unknown → `pricing_window: none`

## Step 2: Wire into estimate / frugality

**Status:** Pending

- [ ] Consult adapters from price-broker / `estimateRoutingCost` path
- [ ] Soft-bias only; no hard ban
- [ ] Record `pricing_window` on telemetry when applied

## Step 3: Testing and verification

**Status:** Pending

- [ ] Frozen-clock tests for peak vs off-peak for both vendors
- [ ] Non-Z.ai/DeepSeek unchanged
- [ ] Contract `testCommand` green

## Completion Criteria

- [ ] Adapters wired with tests; Partial #165 (docs/explain polish → SP-244)

## Discoveries

(none yet)
