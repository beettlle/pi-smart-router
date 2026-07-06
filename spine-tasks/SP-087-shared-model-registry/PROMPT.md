# Task: SP-087 — Use pi shared ModelRegistry for fleet discovery

**Created:** 2026-07-06
**Size:** M

## Review Level: 1

**Assessment:** Fix #42 — extension fleet must match pi scoped-models UI via shared registry, cache, and invalidation.
**Score:** 6/8

## Source

- GitHub: beettlle/pi-smart-router#42
- Bucket: bug

## Mission

The smart-router extension builds its routing fleet from a private `ModelRegistry.create()` instance while pi's scoped-models UI uses `ctx.modelRegistry`. Package-registered providers (cursor, lmstudio) are missing from the fleet. Wire the shared registry, align scope resolution with pi's `resolveModelScope`, add fleet cache + invalidation, and list fleet members in `/smart-router status`.

## Dependencies

- SP-086

## Context to Read First

- `.pi/extensions/smart-router/extension-setup.ts`
- `.pi/extensions/smart-router/fleet-bootstrap.ts`
- `.pi/extensions/smart-router/session-lifecycle.ts`
- `.pi/extensions/smart-router/commands.ts`
- `.pi/extensions/smart-router/command-formatters.ts`
- `tests/unit/smart-router-extension.test.ts`
- `tests/unit/smart-router-pricing.test.ts`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/fleet-bootstrap.ts` |
| May change | `.pi/extensions/smart-router/extension-setup.ts`, `.pi/extensions/smart-router/session-lifecycle.ts`, `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/command-formatters.ts`, `.pi/extensions/smart-router/types.ts`, `.pi/extensions/smart-router/route-and-delegate.ts`, `tests/unit/smart-router-extension.test.ts`, `tests/unit/smart-router-pricing.test.ts` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/fleet-bootstrap.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Shared registry fleet parity, scope cache invalidation, status lists members, tests with package-only models on shared registry. |

## Testing

- Unit: `tests/unit/smart-router-pricing.test.ts` — shared registry parity, fleet cache fingerprint, status fleet list
- Extension: `tests/unit/smart-router-extension.test.ts` — routing with ensureFleetFresh (existing delegation tests)
- Run `npm run typecheck && npm test`

## Steps

### Step 1: Shared registry + resolveModelScope

- [ ] Bind `ctx.modelRegistry` at session_start and command handlers; defer initial rebuild until session_start
- [ ] Replace `filterScopedModels` with pi `resolveModelScope`
- [ ] Update `discoverFleet` / `rebuildFleet` to use shared registry reference

### Step 2: Fleet cache + invalidation

- [ ] Cache fleet snapshot with scope fingerprint on runtime
- [ ] Rebuild on session_start, mode change, pricing refresh, fingerprint change
- [ ] Cheap fingerprint check before routed turn (no full rebuild when unchanged)

### Step 3: Observability + tests

- [ ] `/smart-router status` lists fleet members (provider/id)
- [ ] Unit tests: shared registry includes cursor/lmstudio; cache skips redundant rebuilds; mid-scope fingerprint change triggers rebuild
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] Scoped fleet includes package-registered models when in enabledModels patterns
- [ ] `/smart-router status` fleet count matches scoped-models (excluding smart-router/auto)
- [ ] Tool-history session retains non-Gemini models when cursor is in scope
- [ ] Mid-session enabledModels change reflected on next routed request without restart
- [ ] No per-turn full fleet rebuild when fingerprint unchanged
- [ ] Tests pass

## Git Commit Convention

- `fix(SP-087): description`

## Do NOT

- Re-open #1, #25, #26 (reserved for dogfooding)
- Change router pipeline stage order

---
