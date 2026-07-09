**Current Step:** 1
**Status:** Ready
**Last Updated:** 2026-07-09
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Resolution strategy

- [ ] Attempt direct import from `@earendil-works/pi-coding-agent` public surface when `resolveModelScope` is exported
- [ ] Add fallback candidates: pi global install, `~/.pi/agent/npm/node_modules`, `require.resolve` / `import.meta.resolve`
- [ ] Keep clear error message with install hint when all candidates fail

## Step 2: Unit tests

- [ ] Add `tests/unit/pi-model-scope.test.ts` with fixture layout simulating consumer install (no repo root node_modules)
- [ ] Cover dev-repo path still works

## Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `pi-model-scope.ts` resolves in consumer layout per #86
- [ ] Unit tests cover consumer and dev paths
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries
