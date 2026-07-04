**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-04
**Review Level:** 2
**Size:** M

---

## Step 1: Factory and dependency wiring

**Status:** Complete

- [x] Extend `createRouterFromFleet()` for pipeline options
- [x] Add `@huggingface/transformers` dependency
- [x] Verify extension package resolves dependency at runtime

## Step 2: Extension bootstrap

**Status:** Complete

- [x] Create ONNX embedding provider on init
- [x] Inject `HydraMatcher` into router factory
- [x] Graceful disable when transformers unavailable

## Step 3: Tests

**Status:** Complete

- [x] Factory options passthrough tests
- [x] Extension hydra_match integration test with mocked provider
- [x] Matcher-disabled fallback test

## Step 4: Testing and verification

**Status:** Complete

- [x] Run `npm run typecheck && npm test`
