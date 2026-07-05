# Task: SP-077 — Gemini Tool History Guard

**Created:** 2026-07-05
**Size:** M

## Review Level: 1

**Assessment:** Exclude Google/Gemini models from routing when session has tool-call history until pi-ai preserves thought_signature.
**Score:** 4/8

## Source

- GitHub: beettlle/pi-smart-router#38
- Bucket: feature

## Mission

After SP-075 stops incorrect failover, tool-enabled sessions routed to Gemini still fail with thought_signature 400 until [earendil-works/pi#6342](https://github.com/earendil-works/pi/issues/6342) lands. Add a routing guard that excludes `provider === 'google'` (and Cursor Gemini aliases) when message history contains prior tool/function calls.

Apply filter before:
- `safeCloudDefault` selection
- HyDRA matcher fleet shortlist
- First-route pin target (when no pin yet)

Emit telemetry `reason_code: gemini_tool_history_excluded` when filter applies.

## Dependencies

- SP-075

## Context to Read First

- `src/domain/pipeline/safe-default.ts`
- `src/domain/matching/hydra-matcher.ts`
- `.pi/extensions/smart-router/index.ts` — `buildRoutingRequest`, context messages
- `src/config/pi-model-mapper.ts` — Google provider ids
- SP-075 classifiers in `provider-error.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |
| May change | `src/domain/pipeline/safe-default.ts`, `src/domain/matching/hydra-matcher.ts`, new `src/domain/routing/tool-history-guard.ts`, `tests/unit/smart-router-extension.test.ts` |
| Must NOT change | `src/infrastructure/gateway/circuit-breaker.ts` (SP-075 owns) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/infrastructure/gateway/circuit-breaker.ts` |
| completionCriteria | Tool-history sessions never select Google/Gemini unless force_model_id; non-tool sessions unchanged; tests cover filter. |

## Testing

- Unit: tool-history detector tests
- Extension: tool-history session routes to non-Google model
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Tool-history detector

- [ ] Implement `hasToolCallHistory(messages)` helper (assistant toolCall blocks or tool-result turns)
- [ ] Unit tests for detector

### Step 2: Fleet filter

- [ ] Filter Google/Gemini profiles from effective fleet when tool history present
- [ ] Wire in extension before dispatch / fleet rebuild path

### Step 3: Telemetry and docs

- [ ] Log or telemetry field when exclusion applies
- [ ] README cross-link #37, #38, pi#6342
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Tool sessions route to non-Google economical models
- [ ] `force_model_id` override still honored
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-077): description`

## Do NOT

- Block all Google models globally (only when tool history present)
- Revert SP-075 error classification

---

## Amendments (Added During Execution)
