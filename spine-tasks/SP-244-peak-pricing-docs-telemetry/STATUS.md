# SP-244: Peak pricing explain telemetry and README — Status

**Current Step:** 2
**Status:** Complete
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 1: Explain + mapper gaps

**Status:** Complete

- [x] Ensure `SMART_ROUTER_LOG_ROUTING=1` surfaces `pricing_window` / rationale
- [x] Add any missing mapper pattern tests

## Step 2: Testing and verification

**Status:** Complete

- [x] README economics section updated with Z.ai + DeepSeek links
- [x] Contract `testCommand` green
- [x] #165 closable with SP-243

## Completion Criteria

- [x] Docs + explain telemetry complete; #165 closable

## Discoveries

- GitNexus MCP `impact` tool truncates the `target` parameter in this runtime; used `gitnexus impact <symbol> --repo pi-smart-router` CLI instead — `mapPiModelToProfile` and `buildRoutingDecisionLogPayload` both LOW risk, 0 indexed upstream callers (`.pi/extensions` not indexed).
- Vendor doc URLs verified: Z.ai GLM Coding Plan — https://docs.z.ai/devpack/overview (peak Mon–Fri 14:00–18:00 UTC+8, off-peak 0.5× credits); DeepSeek — https://api-docs.deepseek.com/quick_start/pricing (peak 01:00–04:00 + 06:00–10:00 UTC Mon–Fri, off-peak half rate).
- Runtime `SMART_ROUTER_LOG_ROUTING=1` stderr path is the extension's `logRoutingDecision` (duplicated in `route-and-delegate.ts` local + `stream-delegation.ts` exported); the canonical `buildRoutingDecisionLogPayload` is library/tests side. Both get peak-pricing fields.
- In-worker plan reviews skipped by engine (SP-195) — engine runs reviews after `.DONE`.

## Evidence

- `src/config/pi-model-mapper.ts`: explicit GLM (`/^glm[-_.]?\d/i`) and DeepSeek (`/deepseek/i`) family rules → ECONOMICAL_DEFAULTS (recognized family instead of UNKNOWN_DEFAULTS).
- `src/infrastructure/telemetry/routing-telemetry.ts`: new `buildPeakPricingObservability()`; `buildRoutingDecisionLogPayload` now carries top-level `pricing_window` + `peak_pricing_summary` (`window`, `cost_multiplier`, `adapter_id`).
- `.pi/extensions/smart-router/route-and-delegate.ts` + `stream-delegation.ts`: stderr log payload carries `pricing_window` + `peak_pricing` (fail open, `none`/1/null for non-target providers).
- Tests: mapper family tests + adapter cross-match in `tests/unit/pi-model-mapper.test.ts`; frozen-clock payload tests in `tests/unit/routing-telemetry.test.ts`; stderr payload tests in `tests/unit/smart-router-extension.test.ts`.
- README: "Peak/off-peak pricing adapters (v0.20.0, #165)" economics section with verified vendor doc links, plan-profile `credits` default documented, legacy override documented-only; LOG_ROUTING checklist gained a `pricing_window` row.
- Contract `testCommand` green: typecheck + price-broker + smart-router-pricing (69 tests). Full `npm test` green: 118 files / 2095 tests. `npm run coverage:check` exit 0. `npm run lint` green.
