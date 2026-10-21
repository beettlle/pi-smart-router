# SP-299: pi registry limits before tier defaults — Status

**Current Step:** Step 1: Implementation
**Status:** In Progress
**Last Updated:** 2026-10-21
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 1
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Read existing price-broker / delegation-headroom tests

---

### Step 1: Implementation
**Status:** In Progress

- [ ] Carry pi registry contextWindow / maxTokens into limits resolution
- [ ] Update resolveLimits precedence and !catalog path

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] glm-5.3-flash registry-limits test
- [ ] YAML / LiteLLM precedence test
- [ ] computeOutputHeadroom > 8192 test
- [ ] Run Contract testCommand
