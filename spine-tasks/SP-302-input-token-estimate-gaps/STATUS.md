# SP-302: input-token estimate counts tool-call args, replayed thinking, and last usage — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-10-23
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Find existing estimator tests; confirm usage/provider field names

---

### Step 1: Implementation
**Status:** Complete

- [x] Separate sizing pass (text + tool-call args + thinking, Cursor exclusion gated)
- [x] Last-usage floor, including explicit estimates
- [x] Export estimateInputTokens for tests if needed

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Tool-call args + thinking counted
- [x] Cursor thinking exclusion and env gate
- [x] Last-usage floor
- [x] Context-fit regression (actual > limit, old estimate < limit)
- [x] mapContextMessages unchanged
- [x] Run Contract testCommand
