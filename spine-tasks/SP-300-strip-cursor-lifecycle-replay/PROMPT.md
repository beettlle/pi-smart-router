# Task: SP-300 — strip Cursor lifecycle thinking on cross-provider delegation

**Created:** 2026-10-22
**Size:** M

## Review Level: 2

**Assessment:** Delegation-context bug — Cursor-origin `thinking` (tool progress lines like `Cursor shell: …`) reaches non-Cursor targets as assistant text, and models imitate it instead of emitting tool calls.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#180
- Epic: beettlle/pi-smart-router#182
- Release: v1.2.2
- Bucket: bug
- Closes: #180

## Mission

The `pi-cursor-sdk` provider records tool progress as `thinking` blocks on assistant messages with `provider === "cursor"`. When the router delegates to a different provider, pi's `transformMessages` turns those thinking blocks into plain `text`, so the target sees thousands of `Cursor shell: <command>` lines as its own prior output.

Add a cross-provider replay sanitizer next to `repairGeminiReplayContext` in `src/domain/delegation/delegation-context.ts`, and call it from `buildDelegationContext` in `.pi/extensions/smart-router/delegation-runtime.ts` for every target whose provider is not `cursor`:

- Drop `thinking` blocks from assistant messages whose `provider === "cursor"` (option A in #180). Keep all other blocks and messages unchanged. If an assistant message would end up with empty `content`, keep it with its remaining blocks (do not delete messages — tool-call/result pairing must stay intact).
- Leave the context untouched when the target provider is `cursor`.
- Leave thinking from non-Cursor assistant messages untouched.
- Env gate, default on: `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0` disables the sanitizer.
- Return a count of dropped thinking blocks and emit it through the existing debug/log path used by the Gemini repair if one exists; do not add telemetry columns.
- Pure function, no mutation of the input context.

## Dependencies

- None

## Context to Read First

- `src/domain/delegation/delegation-context.ts` (`normalizeDelegationContext`, `repairGeminiReplayContext`)
- `.pi/extensions/smart-router/delegation-runtime.ts` (`buildDelegationContext`, ~L150–180)
- `tests/unit/delegation-context.test.ts`
- Issue beettlle/pi-smart-router#180

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/delegation/delegation-context.ts`, `.pi/extensions/smart-router/delegation-runtime.ts`, `tests/unit/delegation-context.test.ts` |
| May change | `src/index.ts` (export only) |
| Must NOT change | `package.json`, `.pi/extensions/smart-router/routing-context.ts`, `src/infrastructure/persistence/**`, `src/domain/matching/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/delegation-context.test.ts` |
| fileScopeMustChange | `src/domain/delegation/delegation-context.ts`, `tests/unit/delegation-context.test.ts` |
| fileScopeMustNotChange | `package.json`, `.pi/extensions/smart-router/routing-context.ts` |
| completionCriteria | Cursor thinking dropped for non-Cursor targets; Cursor targets unchanged; non-Cursor thinking unchanged; env gate works; tests green |

## Steps

### Step 0: Preflight

- [ ] Read `repairGeminiReplayContext` and its tests; follow the same shape (pure function, provider check)
- [ ] Confirm the assistant message `provider` field name on pi `AssistantMessage`

### Step 1: Implementation

- [ ] Add the sanitizer to `delegation-context.ts`
- [ ] Wire it into `buildDelegationContext` for non-Cursor targets, before the Gemini repair
- [ ] Env gate `SMART_ROUTER_STRIP_CURSOR_LIFECYCLE=0`

### Step 2: Testing & Verification

- [ ] Test: `cursor/auto` assistant messages with `Cursor shell:` thinking, delegated to `zai/glm-5.3-flash` and to `google/gemini-*` → no `Cursor shell:` in the delegated context
- [ ] Test: delegation to a `cursor/*` target → context unchanged
- [ ] Test: non-Cursor thinking (e.g. Gemini history → GLM target) unchanged
- [ ] Test: env gate `0` → unchanged
- [ ] Test: tool-call blocks on the same Cursor message are preserved
- [ ] Run Contract `testCommand`

## Do NOT

- Change the routing estimator (SP-302) or telemetry schema (SP-301)
- Strip by regex inside text blocks (option B) — drop whole Cursor thinking blocks

## Completion Criteria

- [ ] #180 acceptance criteria met
- [ ] Contract tests green
