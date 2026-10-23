# SP-303: HyDRA loop flag reuses loop-escalation failure detection — Status

**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-10-22
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Not Started

- [ ] Confirm Message is_error/status fields

---

### Step 1: Implementation
**Status:** Not Started

- [ ] Extract shared isToolFailure
- [ ] Use it in loop-escalation.ts and hydra-input.ts

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] Structured error signals → loop:1
- [ ] Structured success signals → loop:0
- [ ] Benign negations → loop:0
- [ ] Rate-limit body → loop:1
- [ ] Run Contract testCommand
