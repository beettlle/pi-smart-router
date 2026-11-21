# SP-322: Model repeated non-infra failure counter + in-turn failover — Status

**Current Step:** Step 3: Testing & Verification
**Status:** In Progress
**Last Updated:** 2026-11-21
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Inventory breaker APIs
- [x] Choose threshold/reset defaults

### Step 1: Counter + open reason
**Status:** Complete

- [x] model_repeated_failure counter
- [x] Safeguards

### Step 2: In-turn failover + telemetry
**Status:** Complete

- [x] selectFailover wiring
- [x] status/history reason

### Step 3: Testing & Verification
**Status:** In Progress

- [ ] Tests e/f/g
- [ ] Run Contract testCommand

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-11-21 | `recordOutcome` is the single delegation outcome hook; `selectFailover` serves dispatch, infra/quota/Gemini replay, and thrown-stream paths. | Wire counted failures through existing failover. |
| 2026-11-21 | Separate session-scoped non-infra `CircuitBreaker` per `GatewayDispatch`; threshold 3, reset 30,000 ms, half-open successes 1. | Existing infra counter remains unchanged. |
| 2026-11-21 | Count non-infra 4xx except context overflow/Gemini `thought_signature`, plus truncated/no-`finish_reason` streams. Same-status alternate 4xx rolls back request counts; never open the last healthy dispatchable model in a tier. | Prevents request-caused and protocol failures from banning models. |
| 2026-11-21 | Failover decisions use `reason_code: model_repeated_failure`. | Existing status/history rendering exposes the distinct reason. |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

