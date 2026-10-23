# SP-300: strip Cursor lifecycle thinking on cross-provider delegation — Status

**Current Step:** Step 1: Implementation
**Status:** In Progress
**Last Updated:** 2026-10-23
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] Read repairGeminiReplayContext and tests
- [x] Confirm AssistantMessage provider field

---

### Step 1: Implementation
**Status:** In Progress (work done, pending plan review)

- [x] Add sanitizer to delegation-context.ts
- [x] Wire into buildDelegationContext for non-Cursor targets
- [x] Env gate SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0

---

### Step 2: Testing & Verification
**Status:** In Progress (work done, pending plan review)

- [x] Cursor thinking stripped for GLM and Gemini targets
- [x] Cursor target unchanged
- [x] Non-Cursor thinking unchanged
- [x] Env gate disables
- [x] Tool-call blocks preserved
- [x] Run Contract testCommand
