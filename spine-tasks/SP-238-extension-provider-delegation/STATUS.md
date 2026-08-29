# SP-238: Delegate via composed provider for extension-registered custom-API models — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-08-29
**Review Level:** 1
**Size:** S

---

## Step 1: Route default delegation through composed provider

**Status:** Complete

- [x] Resolve default stream via `deps.modelRegistry.getProvider(...)` when `deps.delegateStream` unset
- [x] Fall back to compat `streamSimple` when no composed provider
- [x] Apply to `collectDelegatedStream` and `pipeDelegatedStream`

Plan review: skipped by runtime (nested reviewer spawn blocked in worker session; engine runs reviews after `.DONE` — SP-195).

## Step 2: Tests for extension-provider delegation

**Status:** Complete

- [x] Fake extension provider (synthetic api id) — delegation reaches its `streamSimple`
- [x] No composed provider → compat fallback preserved
- [x] Explicit `deps.delegateStream` override still wins

Plan review: skipped by runtime (same as Step 1).

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` green — `npm run typecheck && npx vitest run tests/unit/delegate-stream-composed-provider.test.ts` (5/5 pass, re-verified this session)
- [x] `npm run release:check` exit 0 — re-run in the foreground this session per worker_done_missing post-mortem constraint (no background/monitor)

Prior session note: 2 earlier full-suite attempts flaked on load-sensitive perf/timeout tests (triage p95 budget, calibration training 30s, pi-model-scope 15s module-resolution timeout) — all pass in isolation, pre-existing on `main`, unrelated to SP-238; contract scoped to task test file per SP-235 convention.

## Completion Criteria

- [x] #160 repro delegates successfully (unit test: synthetic-api extension provider reached via composed provider, no `No API provider registered` throw)
- [x] Built-in API delegation unchanged (compat fallback preserved when no composed provider; override precedence intact)
- [x] Green typecheck + contract tests; release:check exit 0
- [x] #160 closable
