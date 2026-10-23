# Task: SP-302 — input-token estimate counts tool-call args, replayed thinking, and last usage

**Created:** 2026-10-22
**Size:** M

## Review Level: 2

**Assessment:** Estimator bug — `estimateInputTokens` undercounts what pi actually sends, so `context_fit` admitted a 148,508-token turn against a 115,200 effective limit.
**Score:** 5/8 — Blast radius: 3, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#178
- Epic: beettlle/pi-smart-router#182
- Release: v1.2.2
- Bucket: bug
- Closes: #178 (with SP-301)

## Mission

`estimateInputTokens` in `.pi/extensions/smart-router/routing-context.ts` computes `ceil(chars / 4)` over `mapContextMessages(context.messages)` plus the system prompt. `mapContextMessages` is the routing-content view: it drops thinking (#137) and keeps only `{type, tool_call_id, tool_name}` for tool calls. That view is right for routing signals but wrong for sizing.

Make the **estimate** count what the target will receive, without changing routing content:

1. Count serialized `toolCall` arguments (`JSON.stringify(block.arguments)`) on assistant messages.
2. Count assistant `thinking` text. pi's `transformMessages` sends it as text to any different model, and the router does not know the target at estimate time, so count it conservatively. Exception: thinking on assistant messages with `provider === "cursor"` is dropped before non-Cursor delegation by SP-300, so exclude it unless `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0`.
3. Floor the estimate at the most recent assistant message's reported input usage (`usage.input + usage.cacheRead + usage.cacheWrite`; verify field names against pi 1.3 `Usage`). Use the larger value, as pi's own `estimateContextTokens` does.
4. Keep the explicit `options` / `context` token-estimate short-circuit, but apply the last-usage floor to it as well.

`mapContextMessages` output and its routing tests must stay unchanged; build a separate sizing pass.

## Dependencies

- None (reads the SP-300 env var name only; no shared files)

## Context to Read First

- `.pi/extensions/smart-router/routing-context.ts` (`estimateInputTokens`, `readOptionalTokenEstimate`, `mapContextMessages`)
- `src/domain/routing/context-fit.ts` (`filterFleetByContextFit`)
- `tests/unit/context-fit.test.ts`, `tests/unit/router-pipeline-context-fit.test.ts`
- Existing tests covering `estimateInputTokens` (grep `routing-context` under `tests/`)
- Issue beettlle/pi-smart-router#178

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/routing-context.ts`, `tests/unit/routing-context-estimate.test.ts` |
| May change | `tests/unit/router-pipeline-context-fit.test.ts`, `tests/unit/context-fit.test.ts` |
| Must NOT change | `package.json`, `src/domain/delegation/**`, `src/infrastructure/persistence/**`, `src/domain/matching/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/routing-context-estimate.test.ts tests/unit/context-fit.test.ts tests/unit/router-pipeline-context-fit.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/routing-context.ts`, `tests/unit/routing-context-estimate.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/domain/delegation/` |
| completionCriteria | Estimate includes tool-call args, non-Cursor thinking, last-usage floor; routing content unchanged; #178 unit cases green |

## Steps

### Step 0: Preflight

- [ ] Find existing tests for `estimateInputTokens` / `mapContextMessages`; confirm pi `AssistantMessage.usage` and `provider` field names

### Step 1: Implementation

- [ ] Separate sizing pass: text + tool-call args + thinking (Cursor-thinking exclusion gated on the SP-300 env var)
- [ ] Last-usage floor, also applied to explicit estimates
- [ ] Export `estimateInputTokens` for tests if not already exported

### Step 2: Testing & Verification

- [ ] Test: history with large `toolCall` arguments and non-Cursor thinking, routed to a different provider → estimate includes both
- [ ] Test: Cursor-provider thinking excluded by default, included when `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0`
- [ ] Test: last assistant usage reports more input than chars/4 → estimate uses the larger value
- [ ] Regression: actual input > effective limit but old estimate < effective limit → new estimate rejects the model in `filterFleetByContextFit`
- [ ] Test: `mapContextMessages` output unchanged for the same history
- [ ] Run Contract `testCommand`

## Do NOT

- Change `mapContextMessages` routing content or the #137 thinking default
- Change telemetry persistence (SP-301) or delegation context (SP-300)
- Add a tool-schema allowance (optional in #178; out of scope)

## Completion Criteria

- [ ] #178 estimator acceptance criteria met
- [ ] Contract tests green
