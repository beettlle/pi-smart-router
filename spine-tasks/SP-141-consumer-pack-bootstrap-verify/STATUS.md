**Current Step:** 1
**Status:** Ready
**Last Updated:** 2026-07-09
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Temp project bootstrap check

- [ ] Create empty temp project dir outside packed tarball tree
- [ ] Import pi-model-scope (or index bootstrap) from installed pack path
- [ ] Assert resolveModelScope loads without repo dev deps

## Step 2: Testing and verification

- [ ] Run `npm run release:consumer-pack`
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] `verify-consumer-pack.sh` covers extension bootstrap from clean cwd
- [ ] `npm run release:consumer-pack` passes
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries
