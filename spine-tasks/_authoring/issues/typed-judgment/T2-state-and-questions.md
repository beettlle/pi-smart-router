## Summary

Pure domain module that builds a compact, readable judge state from a `RoutingRequest`, defines the six typed questions, and maps answers to normalized signals. Epic: {{EPIC}}.

## Priority

P1

## Pipeline stages

None yet (pure domain). Consumed by the `typed_judgment` stage (Sprint 2).

## Problem / motivation

Measured on local OpenJev (see epic):

- The HyDRA input string (`buildHydraInput` in `src/domain/matching/hydra-input.ts`: `[turns:N|tools:…|tokens:…] text`) is unreadable to a judge — the #179 deep-session case scored reasoning 0.25 / tool_use 0.12, the same under-rating HyDRA made.
- Named JSON fields plus a short activity excerpt fixed most cases.
- A single isolated yes/no question (`small_model_ok`) was unstable; anchored level descriptions were stable.
- State size dominates latency: ~385 ms for a short state vs 3.6–4.3 s for ~3k tokens.

## Proposed solution

- [ ] New module (e.g. `src/domain/judgment/`) with no I/O.
- [ ] **State builder** → JSON string with:
  - `latest_user_message`
  - `session`: `messages`, `tool_calls`, `compactions`, `context_tokens`, `turn_type`, `last_tool_failed` (structured `is_error` / `status` only, same precedence as `isToolFailure` in `src/domain/pinning/loop-escalation.ts`)
  - optional `workspace` one-liner (operator-configurable; absent by default)
  - `recent_activity`: at most 2 lines, each truncated
  - **No** spend, budget, price, or model-cost fields
- [ ] Hard cap of ~500 estimated tokens using the existing estimator (`estimatePromptTokens` in `src/domain/matching/encoder-gate.ts`); trim activity first, then truncate the user message tail.
- [ ] **Question set** (constants, one place):
  - `task_kind` — choice: plan, implement, debug, refactor, review, research, explain, operate, write, chat
  - `capability_deserved` — score, 4 anchored levels (Minimal / Standard / High / Maximum)
  - `needs_deep_reasoning` — noul with true/false criteria
  - `code_gen` — score, 4 levels
  - `tool_use` — score, 4 levels
  - `destructive` — noul
- [ ] Level descriptions for `task_kind`, `capability_deserved`, `needs_deep_reasoning` adapted from [pi-jev-model-router](https://github.com/da-vinci-noob/pi-jev-model-router) `extensions/pi-jev-model-router/jev.ts` (MIT, © 2026 Shah Rukh). Add attribution in a source comment.
- [ ] **Answer mapper** → `TypedJudgment { taskKind, taskKindConfidence, capabilityDeserved (0–1), deepReasoningP, codeGen (0–1), toolUse (0–1), destructiveP, confidences }`. Scores normalized by `(levels - 1)`.
- [ ] Acknowledgement detector (`ok`, `thanks`, `continue`, …) exported for the stage to skip the call. Note: short continuations in deep sessions are **not** skipped (#179).

## Evidence

Golden fixtures from 2026-10-01 incident replays: #97 cleanup, #179 deep continuation, #23 planning, trivial indent, "thanks!", subtle debug.

## Dependencies

| Issue | Role |
|-------|------|
| {{EPIC}} | Parent epic |

## Out of scope

- Transport (Sprint 1 port issue), pipeline wiring, consumers.
- `complexity` question — dropped pending the eval ablation.

## Verification

```bash
npm run typecheck
npx vitest run tests/unit/typed-judgment-state.test.ts tests/unit/typed-judgment-questions.test.ts
```

- State never exceeds the token cap; contains no cost/budget keys; no raw tool output beyond the truncated lines.
- Mapper: normalization, unknown choice rejected, missing answer → null field.
- Golden state snapshots for the incident fixtures.

## Human vs autonomous

| Work | Owner |
|------|-------|
| Module + tests | Autonomous |
