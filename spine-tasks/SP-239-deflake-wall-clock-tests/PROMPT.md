# Task: SP-239 — De-flake wall-clock timing assertions under local load

**Created:** 2026-08-29
**Size:** S

## Review Level: 1

**Assessment:** Stabilize three test suites that assert wall-clock timing and flake when the full suite runs on a loaded machine (pass in isolation and CI) — scoped retries plus load-tolerant baselines; no assertion deletion.
**Score:** 2/8 — Blast radius: 1 (tests only), Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#161
- Bucket: bug
- Closes: #161
- Release: v0.19.3
- Manifest: `spine-tasks/_authoring/release-v0.19.3/manifest.md`

## Mission

Closes #161 — three suites assert on wall-clock timing and fail intermittently under full-suite local load (they cost the v0.19.2 cycle **two spine contract failures on unrelated SP-238**). All pass in isolation and in CI (clean runners). Fix so spine workers running the contract `testCommand` on loaded machines get trustworthy results, without deleting or gutting the assertions' signal:

| Suite | Flaky assertion |
|---|---|
| `tests/unit/triage-engine.test.ts` | `describe('SC-004 latency budget (<5ms triage path)')` (~line 633): `expect(elapsedMs[p95Index]).toBeLessThanOrEqual(TRIAGE_LATENCY_BUDGET_MS)` — 3 tests (~lines 673/677/683) failed under load |
| `tests/unit/local-zero-tier.test.ts` | `'pings both services in parallel (combined < 2x individual)'` (~line 179, asserts `combinedLatencyMs < delayMs * 3` at ~line 192) |
| `tests/unit/pi-model-scope.test.ts` | `'loads resolveModelScope without repo dev node_modules on cwd'` (~line 102) — took 13.7–22s in contract runs under load (timeout-prone module resolution) |

Issue #161 blesses any one of: (1) scoped `retry: 2`; (2) load-tolerant assertions (relative to a baseline measured in the same run); (3) env-flag quarantine. Implement **(1) as the primary fix** for all three suites, plus targeted hardening: per-test `timeout` for the pi-model-scope module-resolution test, and (2) only where the in-run baseline is cheap and honest.

## Dependencies

- None (all prior tasks `.DONE`). SP-240 depends on this task (de-flaked suite must land before dependency bump verification).

## Context to Read First

- Issue #161 body — failing assertions table, evidence, three suggested directions
- `tests/unit/triage-engine.test.ts` — SC-004 describe block (~lines 633–690), `TRIAGE_LATENCY_BUDGET_MS` constant
- `tests/unit/local-zero-tier.test.ts` — `'parallel execution'` describe (~lines 178–195), fake service delays
- `tests/unit/pi-model-scope.test.ts` — consumer-fixture module resolution test (~lines 100–115)
- `vitest.config.ts` — current `maxWorkers` cap; no existing `retry` config (verify with `rg -n 'retry' vitest.config.ts tests/unit/`)
- Vitest 3 test/ suite options: `it('...', { retry: 2 }, fn)`, `describe('...', { retry: 2 }, fn)`, per-test `{ timeout: 60_000 }`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `tests/unit/triage-engine.test.ts` |
| May change | `tests/unit/local-zero-tier.test.ts`, `tests/unit/pi-model-scope.test.ts` |
| Must NOT change | `src/**`, `.pi/extensions/smart-router/**`, `package.json` (version), `vitest.config.ts` (global retry would mask real perf regressions repo-wide — keep retries suite-scoped) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/triage-engine.test.ts tests/unit/local-zero-tier.test.ts tests/unit/pi-model-scope.test.ts` |
| fileScopeMustChange | `tests/unit/triage-engine.test.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | The three named suites pass reliably under full-suite local load: scoped retries applied to the wall-clock suites; pi-model-scope module-resolution test no longer timeout-prone under load; no assertion deleted or its signal gutted; no global vitest retry added |

## Steps

### Step 1: Scoped retries on the three wall-clock suites

- [ ] `tests/unit/triage-engine.test.ts`: apply `retry: 2` to the SC-004 describe block (suite-level option) — covers all three latency-budget tests
- [ ] `tests/unit/local-zero-tier.test.ts`: apply `retry: 2` to the `'parallel execution'` test (or its describe)
- [ ] `tests/unit/pi-model-scope.test.ts`: apply `retry: 2` and a generous per-test `timeout` (e.g. `60_000`) to the `loads resolveModelScope without repo dev node_modules on cwd` test
- [ ] One-line comment at each site referencing #161 (wall-clock assertion, load-sensitive by design)

### Step 2: Cheap load-tolerance where honest

- [ ] triage-engine SC-004: if a measured-in-run reference is feasible without weakening the <5ms budget's meaning (e.g. warmup already exists — do not lower the budget itself), apply; otherwise leave retry-only and note it
- [ ] local-zero-tier parallel ratio: assertion is already relative (`< delayMs * 3`); only touch if a same-run serial baseline is trivially available; otherwise leave retry-only
- [ ] Do NOT convert any assertion to `skip`/env-gated quarantine in this task

### Step 3: Testing and verification

- [ ] Contract `testCommand` green
- [ ] Run the three files together **three consecutive times**: `npx vitest run tests/unit/triage-engine.test.ts tests/unit/local-zero-tier.test.ts tests/unit/pi-model-scope.test.ts` (re-run, not retry-masked single pass)
- [ ] Full `npm test` once — no new failures elsewhere

## Completion Criteria

- [ ] All three suites from #161's table have scoped retry (+ targeted timeout for pi-model-scope)
- [ ] Repeated combined runs green; full suite green
- [ ] No assertions deleted; no global `retry` in `vitest.config.ts`
- [ ] #161 closable

## Do NOT

- Delete or `skip` any timing assertion, or add a global `retry` to `vitest.config.ts`
- Touch `src/**` or `.pi/extensions/smart-router/**` (test-only fix)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version (release operator does this at publish gate)

## Git Commit Convention

- `fix(SP-239): de-flake wall-clock timing assertions under local load (#161)`
