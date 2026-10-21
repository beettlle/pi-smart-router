# SP-296: move host-provided pi-ai out of dependencies — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-10-20
**Review Level:** 1
**Discoveries:**
- Host-provided set confirmed in pi 1.3.0 `resource-loader.js` (`HOST_PROVIDED_EXTENSION_PACKAGES`, 10 entries: 4 `@earendil-works/*`, 4 `@mariozechner/*`, `@sinclair/typebox`, `typebox`).
- CLI import-graph trace (30 files reachable from `dist/cli/smart-router-cli.js` + `dist/infrastructure/persistence/sqlite-store.js`): no `@earendil-works/pi-ai` runtime value imports; `provider-error.ts` not reachable from the CLI path — no lazy import needed. Only runtime pi-ai value import is `isContextOverflow` in `src/infrastructure/delegation/provider-error.ts`, reached only via `src/index.ts` (extension entry, host-supplied).
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm host-provided list from pi 1.3.0 resource-loader
- [x] Trace CLI import graph for pi-ai value imports

---

### Step 1: Implementation
**Status:** Complete

- [x] Move pi-ai from dependencies to devDependencies; keep optional `*` peer
- [x] npm install to sync package-lock.json
- [x] Add tests/unit/package-host-deps.test.ts

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Run Contract testCommand — typecheck 0 errors; host-deps test 4/4; `release:consumer-pack` "Consumer pack verify passed" (exit 0)
- [x] Record CLI import-graph finding
