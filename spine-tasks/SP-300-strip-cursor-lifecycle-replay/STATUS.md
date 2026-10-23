# SP-300: strip Cursor lifecycle thinking on cross-provider delegation — Status

**Current Step:** Done — revision 1 addressed, verified, `.DONE` recreated
**Status:** Complete
**Last Updated:** 2026-10-23
**Review Level:** 2
**Review Counter:** 1
**Iteration:** 1
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

- `src/domain/delegation/delegation-context.ts`: added `stripCursorLifecycleThinking` (SP-300 / issue #180, Option A) — drops `thinking` blocks from Cursor-origin (`provider === 'cursor'`) assistant messages when the delegation target is non-Cursor; never drops messages — a message left with an empty `content` array is kept so tool-call/result pairing stays intact; preserves text/toolCall blocks; returns strip counts (`strippedThinkingBlocks/Chars`). Env gate `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0` disables (default on). Also exported `isCursorDelegationTarget`, `isCursorOriginAssistantMessage`, `STRIP_CURSOR_LIFECYCLE_ENV`.
- `.pi/extensions/smart-router/delegation-runtime.ts`: wired the strip into `buildDelegationContext` after `normalizeDelegationContext` (so virtual-tagged history resolved to a Cursor session execution is caught) and before Gemini replay repair.
- `src/index.ts`: export-only additions for the new sanitizer and helpers.
- `tests/unit/delegation-context.test.ts`: 8 new tests (23 total in file) — strip for GLM + Gemini targets, Cursor target unchanged, non-Cursor (Gemini) thinking unchanged, env gate on/off, toolCall preservation, thinking-only message kept with empty content, virtual-tagged Cursor session execution.

## Revision 1 (code review REVISE → fixed)

Engine code review (`/.reviews/2-20261023T002811.md`) flagged that dropping messages with an empty `content` array violated the PROMPT requirement to preserve tool-call/result turn pairing. Fixed: messages are never dropped; `{ ...message, content: kept }` is pushed unconditionally, and `droppedMessages` was removed from `CursorLifecycleStripResult` (reviewer suggestion). Test updated to assert the message is preserved with `content: []`.

## Verification

- Contract: `npm run typecheck && npx vitest run tests/unit/delegation-context.test.ts` — green (23/23).
- Full suite: `SPINE_WORKER_STUB=1 npm test` — 145 files, 2362 tests, all pass.
- Coverage: `npm run coverage:check` exit 0 (overall 91.59% lines).

## Discoveries

- Plan review at step boundary was skipped by runtime (SP-195): batch engine owns reviews after `.DONE`.
- GitNexus `detect_changes` shows 0 changed symbols because the index tracks the main checkout, not this worktree; scope verified via `git status` — only in-scope files + STATUS.md changed.
