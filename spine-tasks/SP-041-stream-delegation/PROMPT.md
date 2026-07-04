# Task: SP-041 — Stream Delegation

**Created:** 2026-07-03
**Size:** M

## Review Level: 2

**Assessment:** Core routing stream delegation to real providers.
**Score:** 5/8

## Mission

Implement the real `streamSimple` function for the `smart-router/auto` model. On each request: run the routing pipeline, resolve the target model via `ctx.modelRegistry.find()`, delegate to the appropriate built-in streaming API (`anthropicMessagesApi()`, `openAIResponsesApi()`, etc.), and forward all stream events. Handle abort signals, usage/cost data, and stopReason mapping.

## Dependencies

- SP-040

## Context to Read First

- Pi custom provider GitLab Duo example: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-provider-gitlab-duo/index.ts`
- Pi custom provider docs: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/custom-provider.md`
- `.pi/extensions/smart-router/index.ts` — placeholder from SP-040
- `src/domain/pipeline/router-pipeline.ts` — `route()` method

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/index.ts` |
| Must NOT change | `src/domain/pipeline/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/index.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/**` |

## Steps

### Step 1: Stream delegation

- [ ] Replace placeholder `streamSimple` with real implementation
- [ ] Run routing pipeline to get `RoutingDecision`
- [ ] Resolve target via `ctx.modelRegistry.find(provider, modelId)`
- [ ] Delegate to correct streaming API based on target model's `api` field
- [ ] Forward `signal` for abort handling
- [ ] Map `usage` and `cost` from delegated stream
- [ ] Fall back to safe cloud default on routing error

### Step 2: Error handling

- [ ] Handle model not found in registry (fall back)
- [ ] Handle stream delegation failure (fall back)
- [ ] Log routing decision for observability

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-041): description`

## Do NOT

- Modify pipeline internals (`src/domain/pipeline/**`)
- Add slash commands (SP-042)

---

## Amendments (Added During Execution)
