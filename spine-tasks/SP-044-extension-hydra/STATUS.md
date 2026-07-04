**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-07-04
**Review Level:** 2
**Size:** M

---

## Step 1: Factory and dependency wiring

**Status:** Not Started

- [ ] Extend `createRouterFromFleet()` for pipeline options
- [ ] Add `@huggingface/transformers` dependency
- [ ] Verify extension package resolves dependency at runtime

## Step 2: Extension bootstrap

**Status:** Not Started

- [ ] Create ONNX embedding provider on init
- [ ] Inject `HydraMatcher` into router factory
- [ ] Graceful disable when transformers unavailable

## Step 3: Tests

**Status:** Not Started

- [ ] Factory options passthrough tests
- [ ] Extension hydra_match integration test with mocked provider
- [ ] Matcher-disabled fallback test

## Step 4: Testing and verification

**Status:** Not Started

- [ ] Run `npm run typecheck && npm test`
