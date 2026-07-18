# NEW ISSUE — Live / estimated quota window feed

**Created:** [#125](https://github.com/beettlle/pi-smart-router/issues/125)

**Suggested title:** routing: live / estimated quota window feed for virtual cost v2

**Suggested labels:** enhancement

**Action:** Created. Do **not** reopen #70 or #78 — those delivered flat virtual cost and λ/exhaustion math. This tracks the missing **producer** of `QuotaWindowPosition`.

---

## Problem

Virtual cost v2 (`src/domain/pricing/virtual-cost-v2.ts`) already applies λ decay and exhaustion premiums when `remaining_window_fraction` is supplied via `QuotaWindowPosition`. Without a live or estimated feed, that input stays omitted and the pipeline behaves as “full window,” so subscription fleets can still burn late-window quota despite SP-096 flat `quota_cost_per_1m` and SP-097 reactive exhaustion failover.

There is **no** universal cross-provider “% remaining” API. Inference API keys do not imply usage/billing endpoints. Arbitrary user fleets (Cursor, OpenAI, Anthropic, Gemini, local, OpenRouter, …) cannot share one probe. The design must be **adapter + degrade**, not a single lookup for every model.

## Proposed design

Optional feed → `QuotaWindowPosition` → existing virtual cost v2 / expected-cost / scoring (extension → `createDispatchOptions` / pipeline; close the SP-173 gap for this field).

**Fallback chain (in order):**

1. Provider adapter when a trustworthy remaining signal exists
2. Local burn estimate from routing telemetry (account/pool-level for shared subscription pools)
3. Omit → flat virtual cost + SP-097 exhaustion failover

**First concrete slice:** telemetry-derived estimate for the Cursor-style subscription pool (dogfood), with an optional Cursor adapter later if a real remaining signal becomes available. Use **pool-level** fraction — do not invent per-model bars for shared quotas.

Soft bias only via existing virtual cost v2. Do not hard-ban models on stale signals unless remaining is very low and the threshold is documented.

## Acceptance criteria

- [ ] Document that remaining-quota is not universal; define adapter interface + degrade rules (adapter → telemetry estimate → omit).
- [ ] Produce `QuotaWindowPosition` (or omit) without inventing per-model fractions for shared pools.
- [ ] Wire available window position through extension → `createDispatchOptions` / pipeline (SP-173 gap for `quotaWindowPosition`).
- [ ] Soft bias via existing virtual cost v2 only; no hard ban until remaining is very low (documented threshold).
- [ ] Keep SP-097 exhaustion failover as safety net when feed is missing or stale.
- [ ] Unit tests for estimate/adapter mapping; no claim of universal provider coverage.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Dogfood Cursor pool burn vs observed usage-limit timing | Human QA |
| Adapter/estimate module, extension wiring, tests, docs | Autonomous |

## Commands / files

- `src/domain/types/entities.ts` — `QuotaWindowPosition`
- `src/domain/pricing/virtual-cost-v2.ts` — consumer (do not re-implement)
- `src/domain/pipeline/router-pipeline.ts` — `quotaWindowPosition` option
- Extension dispatch options / SP-173 wiring path
- `src/infrastructure/gateway/gateway-dispatch.ts` — SP-097 failover safety net
- `docs/routing-roadmap.md` — P2 virtual cost v2 (landed consumer; this issue is the feed)

## Out of scope

- Re-implementing virtual cost math (#78)
- Re-opening Cursor zero-cost scoring (#70)
- SeqRoute MDP / HBR / CQL (roadmap deferred)
- Hard-blocking models on stale signals
- Promising OpenAI / Anthropic / Gemini billing APIs in v1
- Claiming a universal remaining-quota probe for arbitrary fleets

## Links

- Predecessor: [#70](https://github.com/beettlle/pi-smart-router/issues/70) (flat virtual cost)
- Predecessor: [#78](https://github.com/beettlle/pi-smart-router/issues/78) (virtual cost v2 consumer)
- Related: SP-097 (Cursor quota exhaustion failover), SP-148 / SP-149 (v2 module + wiring), SP-173 (extension operator wiring incl. `quotaWindowPosition`)
- Docs: `docs/routing-roadmap.md` § P2 virtual cost v2
