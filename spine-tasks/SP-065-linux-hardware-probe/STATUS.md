**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-05
**Review Level:** 1
**Size:** M

---

## Step 1: Refactor SystemInfoPort

**Status:** ✅ Complete

- [x] Extract macOS provider
- [x] Add Linux provider
- [x] Wire default provider selection

## Step 2: Platform-aware probeHardware

**Status:** ✅ Complete

- [x] Support linux x64/arm64 policy
- [x] Keep probeHardware pure

## Step 3: Tests and README

**Status:** ✅ Complete

- [x] Linux fixture matrix
- [x] README experimental note
- [x] Run typecheck and test

## Completion Criteria

- [x] All steps complete
- [x] Linux probe logic covered by fixtures

## Discoveries

- Updated `tests/unit/local-zero-tier.test.ts` (out of original File Scope) because integration test asserted old darwin-only policy; replaced with Windows unsupported + Linux x64 positive case.
