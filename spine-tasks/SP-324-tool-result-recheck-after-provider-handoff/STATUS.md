# SP-324: Re-check model on first tool_result after cross-provider handoff — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-11-21
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Trace tool_result inheritance
- [x] Define handoff signal

### Step 1: Re-check wiring
**Status:** Complete

- [x] Implement first-tool_result re-evaluation after handoff
- [x] Ensure SP-323 floor still applies

### Step 2: Testing & Verification
**Status:** Complete

- [x] Unit/integration covering handoff → first tool_result re-check
- [x] Non-handoff tool_result stickiness preserved
- [x] Run Contract `testCommand`
- [x] Call `spine_review_step` after each implementation step

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-11-21 | 1–2 | Plan | Engine-owned; in-worker spawn skipped by harness |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-11-21 | Normalized routing messages omit assistant provider metadata | External handoffs with no prior router pin are the documented detection exception; a host-provided signal is needed for that case |
| 2026-11-21 | Loop escalation re-pins before turn_envelope | Excluded `loop_escalation` transitions and verified the existing escalation suite |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-11-21 | Contract green | Exact testCommand passed: typecheck, 69 focused tests, zero stet findings |
| 2026-11-21 | Full verification green | 2,657 tests passed; coverage 92.07% overall and 100% lines for cross-provider-handoff.ts |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

- [x] #179 acceptance item 2 implemented and ready to close on merge (documented no-prior-pin exception).
- [x] Contract green.
- Pin provider transitions trigger one full re-route on the first tool_result; same-provider and fresh-pin turns remain sticky.

