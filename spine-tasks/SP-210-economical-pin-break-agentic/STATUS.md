# SP-210: Economical Pin Break on Hard Agentic Failure — Status

**Current Step:** Not Started
**Status:** 🔵 Ready for Execution
**Last Updated:** 2026-07-19
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Break/upgrade rules for hard agentic failure

**Status:** ⬜ Not Started

- [ ] Gap vs #98/#99 identified
- [ ] Break/upgrade implemented for economical + hard agentic failure
- [ ] History/explain shows break reason
- [ ] Conditions documented

## Step 2: Non-regression fixtures

**Status:** ⬜ Not Started

- [ ] Hard-failure fixture → leaves stuck economical pin
- [ ] Trivial/tool-success pin still holds
- [ ] Force path (SP-209) untouched

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand` green
- [ ] Related pinning tests if touched
- [ ] coverage:check
- [ ] #122 commented + closable

---

## Completion Criteria

- [ ] Break/upgrade conditions documented + implemented
- [ ] History shows reason + new model
- [ ] Hard-failure fixture green
- [ ] Healthy pin non-regression green
- [ ] #122 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Notes

Wave 1 parallel with SP-208 (disjoint File Scope).
