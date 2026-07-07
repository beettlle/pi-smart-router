# SP-091 Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** S

---

## Step 1: Investigate pi token APIs

**Status:** Complete

**Findings:** `@earendil-works/pi-ai/compat` `Context` exposes `systemPrompt`, `messages`, `tools` only; `SimpleStreamOptions` extends `StreamOptions` with `reasoning` / `thinkingBudgets` — no token count fields. Pi-coding-agent tracks `ContextUsage.tokens` via extension `getContextUsage()`, but that is not passed into `streamSimple` options. Fallback: chars/4 over mapped messages + system prompt.

## Step 2: Implement estimate in buildRoutingRequest

**Status:** Complete

- [x] Set `estimated_input_tokens` with preferred API or chars/4 fallback
- [x] Ensure estimate flows through route-and-delegate

## Step 3: Testing and verification

**Status:** Complete

- [x] Extend integration test to assert field populated
- [x] Run `npm run verify:ci`

## Completion Criteria

- [x] All acceptance criteria from PROMPT met
- [x] `npm run verify:ci` passes
