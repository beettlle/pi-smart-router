# SP-243: Peak/off-peak pricing adapters for Z.ai and DeepSeek — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-09-01
**Review Level:** 1
**Size:** M

---

## Step 1: Adapters + injectable clock

**Status:** Complete

- [x] Implement Z.ai + DeepSeek schedule adapters with injectable `now`
- [x] Default Z.ai plan-profile `credits`; legacy multipliers only via documented override
- [x] Map provider/model ids; unknown → `pricing_window: none`

## Step 2: Wire into estimate / frugality

**Status:** Complete

- [x] Consult adapters from price-broker / `estimateRoutingCost` path
- [x] Soft-bias only; no hard ban
- [x] Record `pricing_window` on telemetry when applied

## Step 3: Testing and verification

**Status:** Complete

- [x] Frozen-clock tests for peak vs off-peak for both vendors
- [x] Non-Z.ai/DeepSeek unchanged
- [x] Contract `testCommand` green

## Completion Criteria

- [x] Adapters wired with tests; Partial #165 (docs/explain polish → SP-244)

## Discoveries

- New module `src/domain/pricing/peak-pricing.ts` (pure, injectable `now`); Z.ai SGT window via fixed UTC+8 offset, DeepSeek UTC windows. Default Z.ai plan-profile `credits` (off-peak 0.5×); legacy multipliers only via `config.zai` override.
- `resolveFrugalityCostPer1M` / `estimateRoutingCost` gained an optional trailing `peak?: PeakPricingOptions` param (backward compatible); production default uses the wall clock — soft-bias only, multiplier 1 for non-target providers.
- `pricing_window` added as a local telemetry field type (`PeakPricingTelemetryFields`, flip-flop precedent) so `src/domain/types/entities.ts` stays out of scope; emitter return type widened accordingly.
- Verification: `npm run typecheck` clean; contract testCommand green; full `npm test` 118 files / 2086 tests pass; peak-pricing.ts + price-broker.ts at ~100% line coverage.
