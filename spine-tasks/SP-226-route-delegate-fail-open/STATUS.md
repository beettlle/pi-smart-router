# SP-226: route-and-delegate fail-open — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** M

---

## Step 1: Replace throws with fail-open paths

**Status:** Complete

- [x] Safe fallback on missing registry model
- [x] Degraded response on stream exhaustion
- [x] Reason codes in telemetry/explain

## Step 2: Testing and verification

**Status:** Complete

- [x] Exhausted fleet test — no throw
- [x] Contract `testCommand`
- [x] `npm run verify:ci`

---

## Completion Criteria

- [x] Fail-open on exhaustion paths
- [x] #140 closable

## Discoveries

- Dispatch-failure catch (`throw error` when no safe default) kept intact: preserves SP-084 actionable `GeminiToolHistoryEmptyFleetError` test; that path is pre-delegation and is caught by `createStreamSimple` into an error event, so it cannot crash the host.
- Removed dead `if (!failover) throw error` in the stream catch (failover is guaranteed truthy when `alternateModel` resolves).
- Abort telemetry (`delegation_aborted` reason code) is gated behind `SMART_ROUTER_LOG_ROUTING=1` to avoid noise on user-initiated cancels; fail-open warnings are unconditional per constitution (failures visible by default).
- New reason codes exported from `route-and-delegate.ts`: `no_registry_model`, `failover_exhausted`, `delegation_aborted`.
- Review: RL1 plan review skipped by engine design (SP-195); engine runs reviews after `.DONE`.
