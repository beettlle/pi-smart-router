# SP-091 Status

**Current Step:** Step 1
**Status:** In Progress
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** S

---

## Step 1: Investigate pi token APIs

**Status:** In Progress

- [x] Check Context / SimpleStreamOptions for exposed token counts

**Findings:** `@earendil-works/pi-ai/compat` `Context` exposes `systemPrompt`, `messages`, `tools` only; `SimpleStreamOptions` extends `StreamOptions` with `reasoning` / `thinkingBudgets` — no token count fields. Pi-coding-agent tracks `ContextUsage.tokens` via extension `getContextUsage()`, but that is not passed into `streamSimple` options. Fallback: chars/4 over mapped messages + system prompt.

## Step 2: Implement estimate in buildRoutingRequest

**Status:** Not Started

- [ ] Set `estimated_input_tokens` with preferred API or chars/4 fallback
- [ ] Ensure estimate flows through route-and-delegate

## Step 3: Testing and verification

**Status:** Not Started

- [ ] Extend integration test to assert field populated
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
