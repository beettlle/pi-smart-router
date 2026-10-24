# Task: SP-306 — Readable judge state + six-question schema + answer mapper

**Created:** 2026-10-24
**Size:** M

## Review Level: 2

**Assessment:** Pure domain module (no I/O) that builds a capped, readable judge state from a `RoutingRequest`, defines the six typed questions, and maps answers to normalized signals.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 2, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#185
- Epic: beettlle/pi-smart-router#183
- Release: v1.3.0
- Bucket: feature
- Closes: #185

## Mission

Measured on local OpenJev (epic #183): the HyDRA flag-prefix string (`buildHydraInput` in `src/domain/matching/hydra-input.ts`) is unreadable to a judge; named JSON fields plus a short activity excerpt fixed most cases; isolated yes/no questions were unstable while anchored level descriptions were stable; state size dominates latency.

Create `src/domain/judgment/` (no I/O):

- **State builder** `buildJudgeState(request, options?) → string` (JSON) with:
  - `latest_user_message`
  - `session`: `messages`, `tool_calls`, `compactions`, `context_tokens`, `turn_type`, `last_tool_failed` — `last_tool_failed` uses the shared `isToolFailure` from `src/domain/pinning/tool-failure.ts` (extracted by SP-303); no new failure heuristics
  - optional `workspace` one-liner (operator-supplied option; absent by default)
  - `recent_activity`: at most 2 lines, each truncated
  - **No** spend, budget, price, or model-cost keys
- Hard cap ~500 estimated tokens using `estimatePromptTokens` (`src/domain/matching/encoder-gate.ts`): trim activity first, then truncate the user message tail.
- **Question set** (one constants module, typed with SP-304 question wire types):
  - `task_kind` — choice: plan, implement, debug, refactor, review, research, explain, operate, write, chat
  - `capability_deserved` — score, 4 anchored levels (Minimal / Standard / High / Maximum)
  - `needs_deep_reasoning` — noul with true/false criteria
  - `code_gen` — score, 4 levels
  - `tool_use` — score, 4 levels
  - `destructive` — noul
  - Level descriptions for `task_kind`, `capability_deserved`, `needs_deep_reasoning` adapted from pi-jev-model-router `extensions/pi-jev-model-router/jev.ts` (MIT, © 2026 Shah Rukh) — add an attribution source comment.
  - Export a stable question-set hash/version string (used later by #191's answer cache).
- **Answer mapper** `mapTypedJudgment(answers) → TypedJudgment { taskKind, taskKindConfidence, capabilityDeserved (0–1), deepReasoningP, codeGen (0–1), toolUse (0–1), destructiveP, confidences }`. Scores normalized by `(levels - 1)`. Unknown choice → rejected; missing answer → that field `null`.
- **Acknowledgement detector** `isAcknowledgement(text)` (`ok`, `thanks`, `continue`, …) exported for the stage to skip the call. Short continuations in deep sessions are **not** acknowledgements (#179): gate on session depth, not text alone, and document the rule.

## Dependencies

- SP-304 (question/answer wire types)
- SP-303 (shared `isToolFailure` in `src/domain/pinning/tool-failure.ts`; v1.2.2 train)

## Context to Read First

- Issue beettlle/pi-smart-router#185 and epic #183 (incident replay table)
- `src/domain/ports/typed-judgment-port.ts` (SP-304)
- `src/domain/pinning/tool-failure.ts` (SP-303)
- `src/domain/matching/hydra-input.ts`, `src/domain/matching/encoder-gate.ts`
- `src/domain/types/entities.ts` (`RoutingRequest`, `Message`)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `src/domain/judgment/judge-state.ts`, `src/domain/judgment/questions.ts`, `src/domain/judgment/answer-mapper.ts`, `tests/unit/typed-judgment-state.test.ts`, `tests/unit/typed-judgment-questions.test.ts` |
| May change | `src/domain/judgment/index.ts`, `tests/fixtures/typed-judgment` (golden state snapshots) |
| Must NOT change | `package.json`, `src/infrastructure/**`, `src/domain/pipeline/**`, `src/domain/matching/hydra-input.ts`, `src/domain/pinning/**`, `.pi/extensions/**`, `.review/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/typed-judgment-state.test.ts tests/unit/typed-judgment-questions.test.ts && bash scripts/spine-stet-contract-run.sh default SP-306` |
| fileScopeMustChange | `src/domain/judgment/judge-state.ts`, `src/domain/judgment/questions.ts`, `src/domain/judgment/answer-mapper.ts`, `tests/unit/typed-judgment-state.test.ts` |
| fileScopeMustNotChange | `package.json`, `src/infrastructure/`, `src/domain/pipeline/`, `.review/` |
| completionCriteria | State JSON readable, capped at ~500 tokens, no cost/budget keys; six questions in one module with attribution and version hash; mapper normalizes and rejects unknown choices; ack detector respects session depth; golden fixtures green |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-303 `tool-failure.ts` and SP-304 port types are on `main`

### Step 1: State builder

- [ ] JSON state fields, token cap with trim order, no cost keys

### Step 2: Questions, mapper, acknowledgement detector

- [ ] Six-question constants + attribution + version hash
- [ ] `mapTypedJudgment` normalization and null/unknown handling; `isAcknowledgement` with depth guard

### Step 3: Testing & Verification

- [ ] Golden state snapshots: #97 cleanup, #179 deep continuation, #23 planning, trivial indent, "thanks!", subtle debug
- [ ] State never exceeds the token cap; contains no cost/budget keys; no raw tool output beyond truncated lines
- [ ] Mapper: normalization, unknown choice rejected, missing answer → null
- [ ] "continue" in a 1,000+ message session is not an acknowledgement
- [ ] Run Contract `testCommand`

## Do NOT

- Add a `complexity` question (dropped pending #191 ablation)
- Change `buildHydraInput` or HyDRA metadata flags
- Perform I/O

## Completion Criteria

- [ ] #185 acceptance criteria met
- [ ] Contract tests green
