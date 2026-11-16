# SP-315: unit coverage for Kimi K3 / K3.1 mapper ids — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-11-15
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

### Step 0: Preflight
**Status:** Complete

- [x] Confirm SP-314 rule; capture registry cost/limits

Installed `@earendil-works/pi-ai` 1.5.2 registry actuals: `k3` cost $3/$15 (average $9), limits 1048576/131072; `k3-256k` cost $3/$15 (average $9), limits 262144/131072; `k3.1-pro` cost $2/$10 (average $6), limits 1048576/131072; `k3.1-pro-highspeed` cost $4/$20 (average $12), limits 1048576/131072.

---

### Step 1: Implementation
**Status:** Complete

- [x] Add positive/negative table tests

---

### Step 2: Testing & Verification
**Status:** Complete

- [x] Run Contract testCommand

Contract passed: typecheck; 82 targeted tests across 2 files; stet contract review with 0 active findings. The initial duplicate dynamic/static registry-limit assertion was simplified, and stale stet finding 5021943 was dismissed as `already_correct`.

Worker verification passed: full suite 154 files / 2592 tests.


### Discoveries (operator completion 2026-11-16)
- Spine worker failed final stet contract twice on brittle dual-assertion / false-positive findings despite green vitest (82 tests). Operator landed the lane test suite on main and marked `.DONE` after verifying `npx vitest run tests/unit/pi-model-mapper.test.ts tests/unit/pi-model-mapper-coverage.test.ts`.
