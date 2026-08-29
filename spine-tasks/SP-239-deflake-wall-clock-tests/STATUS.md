# SP-239: De-flake wall-clock timing assertions under local load — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-08-29
**Review Level:** 1
**Size:** S

---

## Step 1: Scoped retries on the three wall-clock suites

**Status:** Not Started

- [ ] `tests/unit/triage-engine.test.ts`: `retry: 2` on SC-004 describe block
- [ ] `tests/unit/local-zero-tier.test.ts`: `retry: 2` on parallel-execution test
- [ ] `tests/unit/pi-model-scope.test.ts`: `retry: 2` + generous `timeout` on module-resolution test
- [ ] #161 reference comment at each site

## Step 2: Cheap load-tolerance where honest

**Status:** Not Started

- [ ] triage-engine SC-004: in-run baseline only if it doesn't weaken the <5ms budget
- [ ] local-zero-tier: only if same-run serial baseline is trivial
- [ ] No skip/env-quarantine conversions

## Step 3: Testing and verification

**Status:** Not Started

- [ ] Contract `testCommand` green
- [ ] Three files together ×3 consecutive runs green
- [ ] Full `npm test` once — no new failures

## Completion Criteria

- [ ] All three suites from #161's table hardened (scoped retry + targeted timeout)
- [ ] Repeated combined runs green; full suite green
- [ ] No assertions deleted; no global retry in vitest.config.ts
- [ ] #161 closable
