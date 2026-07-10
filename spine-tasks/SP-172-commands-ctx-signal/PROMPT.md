# Task: SP-172 — Slash Commands Honor ctx.signal

**Created:** 2026-07-10
**Size:** S

## Review Level: 1

**Assessment:** Wire ctx.signal through long async /smart-router command handlers.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#91
- Parent: beettlle/pi-smart-router#87
- Bucket: feature
- Closes: #91
- Partial: #87

## Mission

`/smart-router` command handlers run long async work (`refreshPricingCatalog`, `rebuildFleet`, `exportDatasetToFile`) without `ctx.signal`. Pass/check abort so ESC cancels cleanly; avoid partial fleet state updates on cancel where feasible. After this lands with SP-169–SP-171, close parent tracking #87.

## Dependencies

- **None** (disjoint file scope from stream path — may run parallel with SP-169)

## Context to Read First

- `.pi/extensions/smart-router/commands.ts`
- `src/infrastructure/pricing/litellm-fetch.ts` — fetch options if signal needed
- Pi extension docs on `ctx.signal` (custom-provider / extension command patterns)

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/commands.ts` |
| May change | `src/infrastructure/pricing/litellm-fetch.ts`, `tests/unit/smart-router-extension.test.ts`, `tests/unit/litellm-fetch.test.ts` |
| Must NOT change | `.pi/extensions/smart-router/route-and-delegate.ts`, `src/domain/pipeline/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/unit/litellm-fetch.test.ts` |
| fileScopeMustChange | `.pi/extensions/smart-router/commands.ts` |
| fileScopeMustNotChange | `.pi/extensions/smart-router/route-and-delegate.ts`, `src/domain/pipeline/**` |
| completionCriteria | pricing refresh and export dataset respect abort when signal provided; test with aborted signal during mocked slow fetch if practical. |

## Steps

### Step 1: Wire ctx.signal into long handlers

- [ ] Pass/check `ctx.signal` in `pricing refresh` and `export dataset` (and other long async handlers in commands.ts)
- [ ] Extend fetch options if needed so LiteLLM fetch aborts
- [ ] Avoid partial fleet state updates on cancel where feasible

### Step 2: Abort signal test

- [ ] Unit or integration test with aborted signal during mocked slow fetch (if practical)

### Step 3: Testing and verification

- [ ] Run `npm run typecheck && npx vitest run tests/unit/smart-router-extension.test.ts tests/unit/litellm-fetch.test.ts`
- [ ] Run `npm run typecheck && npm test`
- [ ] Run `npm run coverage:check` — ≥77% line coverage
- [ ] After integrate: comment + close #91; if #88–#90 also closed, close parent #87

## Completion Criteria

- [ ] Long command handlers honor abort signal
- [ ] Abort test added when practical
- [ ] No partial fleet update on cancel where feasible
- [ ] Closes #91 (and enables closing #87 with siblings)

## Git Commit Convention

- `feat(SP-172): description`

## Do NOT

- Modify route-and-delegate / stream piping (SP-169–SP-171)
- Change `src/domain/pipeline/**`

---

## Amendments (Added During Execution)
