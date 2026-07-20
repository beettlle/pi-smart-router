# SP-210: Economical Pin Break on Hard Agentic Failure — Status

**Current Step:** Done (pending plan review)
**Status:** 🟡 Awaiting plan review
**Last Updated:** 2026-07-20
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Break/upgrade rules for hard agentic failure

**Status:** ✅ Complete (pending plan review)

- [x] Gap vs #98/#99 identified
- [x] Break/upgrade implemented for economical + hard agentic failure
- [x] History/explain shows break reason
- [x] Conditions documented

## Step 2: Non-regression fixtures

**Status:** ✅ Complete (pending plan review)

- [x] Hard-failure fixture → leaves stuck economical pin
- [x] Trivial/tool-success pin still holds
- [x] Force path (SP-209) untouched

## Step 3: Testing & Verification

**Status:** ✅ Complete (pending plan review)

- [x] Contract `testCommand` green
- [x] Related pinning tests if touched
- [x] coverage:check
- [x] #122 commented + closable

---

## Completion Criteria

- [x] Break/upgrade conditions documented + implemented
- [x] History shows reason + new model
- [x] Hard-failure fixture green
- [x] Healthy pin non-regression green
- [x] #122 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-20 | Gap: economical pins only escalate on 3 *identical* tool failures (FR-014 identical-signature gate in loop-escalation.ts). A hard agentic loop with distinct/varied errors (e.g. ENOENT then ECONNREFUSED then timeout) resets the counter to 1 each time and never escalates → session stays stuck on economical `session_pinned`. Zero-tier already has an observational churn path (SP-178/#99); economical has no equivalent. Pin-break reason already surfaces via `loop_escalation` pin_reason + selected_model_id in the session_pin stage (no telemetry change needed). | Drives the fix: economical churn counts consecutive failures of any signature; frontier keeps the identical-only gate. |
| 2026-07-20 | Plan-review checkpoint (SAAR cache wins): after loop_escalation breaks the economical pin and records a frontier pin, session_pin's lookupPin sees a frontier pin. SAAR tier-upgrade checks are no-ops (frontier is top tier → isTierUpgrade false). Cache-economics break only fires on cross-provider candidate switch and would re-route, not re-pin economical. Recovery is not blocked forever. | Confirms SAAR cache wins do not silently block economical→frontier recovery. |
| 2026-07-20 | loop_escalation returns decided:false by contract; turn_envelope (runs after loop_escalation, before session_pin) still routes the triggering tool_result turn to economical via breakeven. The escalated frontier pin takes effect on the next session_pin-decided turn (e.g. main_loop). Integration test asserts pin-record history on the trigger + frontier selection on the recovery turn. | Test asserts the actual recovery path, not the triggering-turn decision. |
| 2026-07-20 | Flip-flop guard does NOT block recovery here: warm-up turns (main_loop+planning) both observed economical, no tier flips, so tier_pinned stays null. Even if it had pinned economical, loop_escalation runs first and breakPin clears flip-flop state. | Confirms flip-flop guard does not silently re-pin economical after escalation. |

## Notes

Wave 1 parallel with SP-208 (disjoint File Scope).
