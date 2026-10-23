# SP-300: strip Cursor lifecycle thinking on cross-provider delegation — Status

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

- [ ] Read repairGeminiReplayContext and tests
- [ ] Confirm AssistantMessage provider field

---

### Step 1: Implementation
**Status:** Not Started

- [ ] Add sanitizer to delegation-context.ts
- [ ] Wire into buildDelegationContext for non-Cursor targets
- [ ] Env gate SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0

---

### Step 2: Testing & Verification
**Status:** Not Started

- [ ] Cursor thinking stripped for GLM and Gemini targets
- [ ] Cursor target unchanged
- [ ] Non-Cursor thinking unchanged
- [ ] Env gate disables
- [ ] Tool-call blocks preserved
- [ ] Run Contract testCommand
