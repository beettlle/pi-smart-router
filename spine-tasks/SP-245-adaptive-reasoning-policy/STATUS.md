# SP-245: Adaptive reasoning policy and delegation option merge — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-08-30
**Review Level:** 1
**Size:** M

---

## Step 1: Policy module + unit tests

**Status:** Complete

- [x] Add adaptive-reasoning policy module (domain or extension) with matrix tests
- [x] Explicit higher `/thinking` / caller reasoning never lowered
- [x] Model max ceiling respected; fail open when unsupported

## Step 2: Wire into delegation options

**Status:** Complete

- [x] Consult policy from route-and-delegate / stream option build
- [x] Merge before `delegateStream`; preserve caller option keys contract
- [x] Optional conciseness suffix only for low/minimal + high `verbosity_factor`

## Step 3: Testing and verification

**Status:** Complete

- [x] Extension test asserts delegated options reflect turn class
- [x] Contract `testCommand` green (ran with tests/unit/adaptive-reasoning.test.ts added — 73 tests pass)
- [x] Partial #166 — config/docs/telemetry polish → SP-246

## Completion Criteria

- [x] Policy + merge wired with tests; Partial #166

## Discoveries

- pi always passes the session thinkingLevel as `options.reasoning` (default `medium`, pi `DEFAULT_THINKING_LEVEL`); the policy treats that exact ambient level as adjustable and any other caller level as an explicit operator `/thinking` floor (never lowered). Documented in `src/domain/delegation/adaptive-reasoning.ts`.
- Verification: `npm run typecheck` green; contract `testCommand` + `tests/unit/adaptive-reasoning.test.ts` green (73 tests); full `npm test` green (117 files / 1981 tests); scoped coverage on `src/domain/delegation/adaptive-reasoning.ts` = 95.34% lines.
- Plan reviews (RL 1) skipped by engine at each step (nested reviewer spawn blocked in worker session; engine runs reviews after `.DONE`).
- Deferred to SP-246: operator enable/disable + floor/ceiling config, telemetry fields (`reasoning_level_requested/applied`, reason_code), README comparison to `lambda_verbosity`.
