# SP-300: strip Cursor lifecycle thinking on cross-provider delegation — Status

**Current Step:** Step 2: Testing & Verification (complete; worker-verify + .DONE next)
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
**Status:** Complete

- [x] Add sanitizer to delegation-context.ts
- [x] Wire into buildDelegationContext for non-Cursor targets
- [x] Env gate SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Cursor thinking stripped for GLM and Gemini targets
- [x] Cursor target unchanged
- [x] Non-Cursor thinking unchanged
- [x] Env gate disables
- [x] Tool-call blocks preserved
- [x] Run Contract testCommand

---

## Summary of Changes

- `src/domain/delegation/delegation-context.ts`: added `stripCursorLifecycleThinking` (SP-300 / issue #180, Option A) — drops `thinking` blocks from Cursor-origin (`provider === 'cursor'`) assistant messages when the delegation target is non-Cursor; drops messages left with only lifecycle thinking; preserves text/toolCall blocks; returns strip counts (`strippedThinkingBlocks/Chars`, `droppedMessages`). Env gate `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0` disables (default on). Also exported `isCursorDelegationTarget`, `isCursorOriginAssistantMessage`, `STRIP_CURSOR_LIFECYCLE_ENV`.
- `.pi/extensions/smart-router/delegation-runtime.ts`: wired the strip into `buildDelegationContext` after `normalizeDelegationContext` (so virtual-tagged history resolved to a Cursor session execution is caught) and before Gemini replay repair.
- `src/index.ts`: export-only additions for the new sanitizer and helpers.
- `tests/unit/delegation-context.test.ts`: 8 new tests (23 total in file) — strip for GLM + Gemini targets, Cursor target unchanged, non-Cursor (Gemini) thinking unchanged, env gate on/off, toolCall preservation, thinking-only message drop, virtual-tagged Cursor session execution.

## Verification

- Contract: `npm run typecheck && npx vitest run tests/unit/delegation-context.test.ts` — green (23/23).
- Full suite: `SPINE_WORKER_STUB=1 npm test` — 145 files, 2362 tests, all pass.
- Coverage: `npm run coverage:check` exit 0 (overall 91.59% lines).

## Discoveries

- Plan review at step boundary was skipped by runtime (SP-195): batch engine owns reviews after `.DONE`.
- GitNexus `detect_changes` shows 0 changed symbols because the index tracks the main checkout, not this worktree; scope verified via `git status` — only in-scope files + STATUS.md changed.
