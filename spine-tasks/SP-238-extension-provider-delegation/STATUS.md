# SP-238: Delegate via composed provider for extension-registered custom-API models — Status

**Current Step:** 3
**Status:** Complete
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

**Status:** Complete (pending plan review)

- [x] `npm run typecheck && npm test` green (116 files / 1943 tests passed)
- [x] `npm run release:check` exits 0 (2 earlier attempts flaked on load-sensitive perf/timeout tests — triage p95 budget, calibration training 30s — all pass in isolation and unrelated to SP-238; third run clean on quieted machine)

---

## Completion Criteria

- [x] #160 repro delegates successfully (unit test: synthetic-api extension provider reached via composed provider, no `No API provider registered` throw)
- [x] Built-in API delegation unchanged (compat fallback preserved when no composed provider; override precedence intact)
- [x] Green typecheck + tests
- [x] #160 closable
