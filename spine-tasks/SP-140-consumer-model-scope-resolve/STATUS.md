**Current Step:** 3 (complete)
**Status:** complete
**Last Updated:** 2026-07-09
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Resolution strategy

- [x] Attempt direct import from `@earendil-works/pi-coding-agent` public surface when `resolveModelScope` is exported
- [x] Add fallback candidates: pi global install, `~/.pi/agent/npm/node_modules`, `require.resolve` / `import.meta.resolve`
- [x] Keep clear error message with install hint when all candidates fail

## Step 2: Unit tests

- [x] Add `tests/unit/pi-model-scope.test.ts` with fixture layout simulating consumer install (no repo root node_modules)
- [x] Cover dev-repo path still works

## Step 3: Testing and verification

- [x] Run `npm run verify:ci`

## Completion Criteria

- [x] `pi-model-scope.ts` resolves in consumer layout per #86
- [x] Unit tests cover consumer and dev paths
- [x] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

- Lazy initialization of `resolveModelScope` avoids import-time failure when resolution is deferred; consumer/global paths resolve on first call.
- Consumer fixture tests copy `pi-model-scope.ts` into a simulated `~/.pi/agent/npm/node_modules/pi-smart-router` layout so ancestor walks do not hit dev-repo node_modules.
