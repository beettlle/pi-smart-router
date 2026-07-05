**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-05
**Review Level:** 1
**Size:** M

---

## Step 1: Windows SystemInfoPort

**Status:** ✅ Complete

- [x] Implement Windows provider
- [x] Wire default provider selection

## Step 2: Extend probeHardware policy

**Status:** ✅ Complete

- [x] Add win32 support
- [x] Keep shared threshold logic

## Step 3: Tests and README

**Status:** ✅ Complete

- [x] Windows fixture matrix
- [x] README experimental note
- [x] Run typecheck and test

## Completion Criteria

- [x] All steps complete
- [x] Windows probe logic covered by fixtures

## Discoveries

- Updated `tests/unit/local-zero-tier.test.ts` (out of listed File Scope) so Windows integration expectation matches enabled probe policy; required for `npm test` to pass.
