# SP-244: Peak pricing explain telemetry and README — Status

**Current Step:** 2
**Status:** In Progress
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 1: Explain + mapper gaps

**Status:** Complete

- [x] Ensure `SMART_ROUTER_LOG_ROUTING=1` surfaces `pricing_window` / rationale
- [x] Add any missing mapper pattern tests

## Step 2: Testing and verification

**Status:** In Progress

- [ ] README economics section updated with Z.ai + DeepSeek links
- [ ] Contract `testCommand` green
- [ ] #165 closable with SP-243

## Completion Criteria

- [ ] Docs + explain telemetry complete; #165 closable

## Discoveries

- GitNexus MCP `impact` tool truncates the `target` parameter in this runtime; used `gitnexus impact <symbol> --repo pi-smart-router` CLI instead — `mapPiModelToProfile` and `buildRoutingDecisionLogPayload` both LOW risk, 0 indexed upstream callers (`.pi/extensions` not indexed).
- Vendor doc URLs verified: Z.ai GLM Coding Plan — https://docs.z.ai/devpack/overview (peak Mon–Fri 14:00–18:00 UTC+8, off-peak 0.5× credits); DeepSeek — https://api-docs.deepseek.com/quick_start/pricing (peak 01:00–04:00 + 06:00–10:00 UTC Mon–Fri, off-peak half rate).
- Runtime `SMART_ROUTER_LOG_ROUTING=1` stderr path is the extension's `logRoutingDecision` (duplicated in `route-and-delegate.ts` local + `stream-delegation.ts` exported); the canonical `buildRoutingDecisionLogPayload` is library/tests side. Both get peak-pricing fields.
