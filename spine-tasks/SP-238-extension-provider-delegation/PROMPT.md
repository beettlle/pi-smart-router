# Task: SP-238 — Delegate via composed provider for extension-registered custom-API models

**Created:** 2026-08-29
**Size:** S

## Review Level: 1

**Assessment:** Fix delegation failure for extension-registered custom-API providers (claude-bridge et al.) by resolving the stream entrypoint through the composed provider (`modelRegistry.getProvider(...).streamSimple`) instead of pi-ai/compat's built-in-only `streamSimple`.
**Score:** 4/8 — Blast radius: 2 (all delegation paths), Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#160
- Bucket: bug
- Closes: #160
- Release: v0.19.2
- Manifest: `spine-tasks/_authoring/release-v0.19.2/manifest.md`

## Mission

Closes #160 — `smart-router/auto` **discovers** extension-registered custom-API models fine (they appear in `/smart-router status` and the fleet), but **delegating** to them always fails with `No API provider registered for api: <custom-api>`, which reads like an auth failure but is not.

Root cause (diagnosed in #160 with standalone repro): `delegate-stream.ts` imports `streamSimple` from `@earendil-works/pi-ai/compat`, which dispatches purely on `model.api` against pi-ai's private built-in `apiProviderRegistry`. It has no visibility into pi's extension-provider layer (`pi.registerProvider()` → `ModelRuntime` → `composeModelProvider`). `resolveDelegationOptions()` already resolves auth correctly via `modelRegistry.getApiKeyAndHeaders(...)`; the resolved key is then passed into the doomed compat call which never uses it.

Fix: default the delegation stream to the **composed provider** object from `deps.modelRegistry.getProvider(model.provider)` — the same path pi's own agent loop delegates through. Its `streamSimple` checks `extension?.streamSimple && model.api === extension.api` first, then falls back to the built-in registry. Preserve the existing `deps.delegateStream` injection seam for tests and explicit override.

## Dependencies

- None (all prior tasks `.DONE`).

## Context to Read First

- Issue #160 body — full root cause + standalone repro script
- `.pi/extensions/smart-router/delegate-stream.ts` — both call sites: `collectDelegatedStream` (line ~55) and `pipeDelegatedStream` (line ~122), both `const delegateStream = deps.delegateStream ?? defaultDelegateStream;`
- `.pi/extensions/smart-router/types.ts` — `StreamDelegationDeps` (`modelRegistry`, `delegateStream` injection docs)
- `.pi/extensions/smart-router/delegation-runtime.ts` — `resolveDelegationOptions` (auth resolves fine; do not touch)
- Existing delegation tests: `rg -l 'delegateStream' tests/`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.pi/extensions/smart-router/delegate-stream.ts` |
| May change | `.pi/extensions/smart-router/types.ts` (doc comment updates only), tests covering delegation stream resolution (existing or new file under `tests/`) |
| Must NOT change | `src/domain/**`, `.pi/extensions/smart-router/delegation-runtime.ts`, `.pi/extensions/smart-router/route-and-delegate.ts`, `package.json` version |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `.pi/extensions/smart-router/delegate-stream.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Delegation to a model whose `api` matches an extension-registered provider reaches the extension's `streamSimple` (no `No API provider registered` throw); built-in API providers keep working through the composed-provider fallback; `deps.delegateStream` override still takes precedence |

## Steps

### Step 1: Route default delegation through composed provider

- [ ] Replace the bare `defaultDelegateStream` fallback with a resolver: when `deps.delegateStream` is unset, look up `deps.modelRegistry.getProvider(targetModel.provider)` and use its `streamSimple`
- [ ] Fall back to the compat `streamSimple` import when no composed provider resolves (built-in APIs, tests)
- [ ] Apply to **both** `collectDelegatedStream` and `pipeDelegatedStream`
- [ ] Pass through the delegation options (apiKey/headers from `resolveDelegationOptions`) unchanged

### Step 2: Tests for extension-provider delegation

- [ ] Unit test: fake provider with synthetic `api` id + custom `streamSimple` registered on a registry-like stub; assert delegation reaches the fake stream instead of throwing
- [ ] Unit test: no composed provider → falls back to compat path (existing behavior preserved)
- [ ] Unit test: explicit `deps.delegateStream` still wins over both defaults

### Step 3: Testing and verification

- [ ] Run Contract `testCommand` (`npm run typecheck && npm test`)
- [ ] Run `npm run release:check` locally — must exit 0

## Completion Criteria

- [ ] #160 repro path delegates successfully via composed provider
- [ ] Built-in API delegation unchanged
- [ ] Typecheck + full test suite green
- [ ] Issue #160 closable

## Do NOT

- Touch `resolveDelegationOptions` / auth resolution (already correct per #160)
- Change routing, failover, or pinning logic
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version (release operator does this at publish gate)

## Git Commit Convention

- `fix(SP-238): delegate via composed provider for extension-registered custom-API models`
