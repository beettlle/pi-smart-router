# SP-233: One-shot non-Google failover on thought_signature — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-08-27
**Last Updated:** 2026-08-27
**Review Level:** 1
**Size:** M

---

## Step 1: Protocol-affinity failover path

**Status:** ✅ Complete

- [x] One non-Google failover candidate
- [x] Empty-fleet / no-loop terminal path

## Step 2: Telemetry, tests, README

**Status:** ✅ Complete

- [x] Distinct reason_code
- [x] Update #37 tests + README

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Contract `testCommand`
- [x] `npm test` + coverage gate

---

## Completion Criteria

- [x] #159 AC met
- [x] Issue closable

## Discoveries

- `delegate-stream.ts` records every failed delegation via `recordOutcome`, but `GatewayDispatch.recordOutcome` only trips the circuit breaker for `isInfraError` (5xx/429/network) — a thought_signature 400 is recorded as a benign non-infra outcome and does not affect failover eligibility. Verified in test via `getCircuitBreaker().canDispatch('gemini-flash')`.
- Contract `testCommand` passed: typecheck + 109 tests across smart-router-extension / gemini-provider / provider-error.
- Full `npm test`: 114 files, 1937 tests passed. `npm run coverage:check`: 93.21% line coverage (gate ≥77%), exit 0.
