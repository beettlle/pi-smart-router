# SP-224: Stabilize SC-004 triage p95 test — Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-08-22
**Review Level:** 1
**Size:** S

---

## Step 1: Stabilize SC-004

**Status:** Complete (plan review skipped — engine-owned per SP-195)

**Approach (Option B from #139):** Relax the non-CI p95 budget from 5ms to 15ms with
documented rationale; keep CI at 50ms. Rationale: the SC-004 test measures wall-clock of
the full async `RouterPipeline.route()`; under parallel Vitest fork workers (default
4 workers sharing host CPU), event-loop scheduling jitter alone pushes p95 to ~6–7ms
(observed flake at 6.6ms) even when the synchronous triage path is sub-millisecond.
The 15ms budget still guards against order-of-magnitude regressions (the intent of
SC-004's latency-budget discipline) while removing scheduler-noise flakes. Options A
(isolated pool) was rejected because a dedicated fork still contends with sibling forks
for CPU; Option C (mocked stages) was rejected because SC-004's contract is the full
pipeline path.

- [x] Choose and document stabilization approach
- [x] Implement fix

## Step 2: Testing and verification

**Status:** Complete

- [x] Three consecutive `npm test` green (112 files / 1875 tests passed on all 3 runs)
- [x] Contract `testCommand` (`npm test`) green

---

## Completion Criteria

- [x] SC-004 stable under parallel Vitest (non-CI p95 budget 15ms with documented rationale)
- [x] Approach documented (test comment + this STATUS)
- [x] #139 closable
