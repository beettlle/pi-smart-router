# SP-302: input-token estimate counts tool-call args, replayed thinking, and last usage — Status

**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-10-22
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Not Started

- [ ] Find existing estimator tests; confirm usage/provider field names

---

### Step 1: Implementation
**Status:** Not Started

- [ ] Separate sizing pass (text + tool-call args + thinking, Cursor exclusion gated)
- [ ] Last-usage floor, including explicit estimates
- [ ] Export estimateInputTokens for tests if needed

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] Tool-call args + thinking counted
- [ ] Cursor thinking exclusion and env gate
- [ ] Last-usage floor
- [ ] Context-fit regression (actual > limit, old estimate < limit)
- [ ] mapContextMessages unchanged
- [ ] Run Contract testCommand
