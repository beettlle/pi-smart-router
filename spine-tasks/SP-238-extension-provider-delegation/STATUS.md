# SP-238: Delegate via composed provider for extension-registered custom-API models — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-08-29
**Review Level:** 1
**Size:** S

---

## Step 1: Route default delegation through composed provider

**Status:** Not Started

- [ ] Resolve default stream via `deps.modelRegistry.getProvider(...)` when `deps.delegateStream` unset
- [ ] Fall back to compat `streamSimple` when no composed provider
- [ ] Apply to `collectDelegatedStream` and `pipeDelegatedStream`

## Step 2: Tests for extension-provider delegation

**Status:** Not Started

- [ ] Fake extension provider (synthetic api id) — delegation reaches its `streamSimple`
- [ ] No composed provider → compat fallback preserved
- [ ] Explicit `deps.delegateStream` override still wins

## Step 3: Testing and verification

**Status:** Not Started

- [ ] `npm run typecheck && npm test` green
- [ ] `npm run release:check` exits 0

---

## Completion Criteria

- [ ] #160 repro delegates successfully
- [ ] Built-in API delegation unchanged
- [ ] Green typecheck + tests
- [ ] #160 closable
