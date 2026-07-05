**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-05
**Review Level:** 1
**Size:** S

---

## Step 1: Bump CI Node version

**Status:** ✅ Complete

- [x] Change node-version in ci.yml from 20 to 22

## Step 2: Align engines field

**Status:** ✅ Complete

- [x] Update package.json engines.node to >=22

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Run typecheck and test locally
- [x] Confirm no application code changes

## Completion Criteria

- [x] All steps complete
- [x] CI workflow uses Node 22
- [x] Local verification green
