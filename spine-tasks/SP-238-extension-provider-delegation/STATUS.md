# SP-238: Delegate via composed provider for extension-registered custom-API models — Status

**Current Step:** 3
**Status:** In Progress
**Last Updated:** 2026-08-29
**Review Level:** 1
**Size:** S

---

## Step 1: Route default delegation through composed provider

**Status:** Complete (pending plan review)

- [x] Resolve default stream via `deps.modelRegistry.getProvider(...)` when `deps.delegateStream` unset
- [x] Fall back to compat `streamSimple` when no composed provider
- [x] Apply to `collectDelegatedStream` and `pipeDelegatedStream`

## Step 2: Tests for extension-provider delegation

**Status:** Complete (pending plan review)

- [x] Fake extension provider (synthetic api id) — delegation reaches its `streamSimple`
- [x] No composed provider → compat fallback preserved
- [x] Explicit `deps.delegateStream` override still wins

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
