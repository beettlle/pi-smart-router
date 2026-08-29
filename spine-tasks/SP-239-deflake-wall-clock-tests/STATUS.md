# SP-239: De-flake wall-clock timing assertions under local load — Status

**Current Step:** 3 (done)
**Status:** Complete
**Last Updated:** 2026-08-29
**Review Level:** 1
**Size:** S

---

## Step 1: Scoped retries on the three wall-clock suites

**Status:** Complete (plan review engine-skipped per SP-195)

- [x] `tests/unit/triage-engine.test.ts`: `retry: 2` on SC-004 describe block
- [x] `tests/unit/local-zero-tier.test.ts`: `retry: 2` on parallel-execution test
- [x] `tests/unit/pi-model-scope.test.ts`: `retry: 2` + generous `timeout` on module-resolution test
- [x] #161 reference comment at each site

## Step 2: Cheap load-tolerance where honest

**Status:** Complete (plan review engine-skipped per SP-195)

- [x] triage-engine SC-004: in-run baseline only if it doesn't weaken the <5ms budget — left retry-only: warmup already exists and the non-CI budget was already relaxed to 15ms (SP-224); an in-run baseline would weaken the budget contract
- [x] local-zero-tier: only if same-run serial baseline is trivial — left retry-only: assertion is already relative (`< delayMs * 3`); no trivial same-run serial baseline
- [x] No skip/env-quarantine conversions

## Step 3: Testing and verification

**Status:** Complete

- [x] Contract `testCommand` green (typecheck + 3 suites, 114 tests)
- [x] Three files together ×3 consecutive runs green (114/114 each run)
- [x] Full `npm test` once — 116 files / 1943 tests passed, no new failures

## Completion Criteria

- [x] All three suites from #161's table hardened (scoped retry + targeted timeout)
- [x] Repeated combined runs green; full suite green
- [x] No assertions deleted; no global retry in vitest.config.ts
- [x] #161 closable
