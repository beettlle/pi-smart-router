# SP-325: Degenerate output detect → failover — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-11-21
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Read SP-322 penalty APIs
- [x] Choose repetition thresholds

**Detector defaults:** Inspect only the last 8,192 characters of text content. Tokenize on whitespace and compute unique 5-gram ratio over at least 24 windows. Classify only `stopReason === "length"` responses with no `toolCall` blocks when the repeated-window ratio is at least 0.65 (equivalently, unique/window ratio <= 0.35). SP-322 integration uses `dispatch.recordOutcome(modelId, { code: "DEGENERATE_OUTPUT", truncated: true }, requestId)` followed by `selectFailover`; the failover decision telemetry reason is overridden to `degenerate_output`.

### Step 1: Detector + failover
**Status:** Complete

- [x] Pure classifier
- [x] Wire failover + telemetry

### Step 2: Testing & Verification
**Status:** Complete

- [x] Unit + integration AC
- [x] Contract

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-11-21 | Step 0 preflight | Confirmed #181 AC and #52's separate zero-output path; selected SP-322 `recordOutcome` + `selectFailover` without pipeline changes. |
| 2026-11-21 | Step 1 implementation | Added trailing 5-gram classifier, SP-322 failure recording, in-turn failover, telemetry reason override, and short no-failover terminal error. |
| 2026-11-21 | Step 2 verification | Exact contract green; `npm run coverage:check` passed 157 files / 2,673 tests, 92.12% overall lines and 100% on `degenerate-output.ts`. |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

