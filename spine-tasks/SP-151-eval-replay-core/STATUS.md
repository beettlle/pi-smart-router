**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-07-09
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Fixture schema and sample traces

**Status:** Complete

- [x] Define JSON schema for step-level agent trace fixtures
- [x] Add sample fixtures under `tests/eval/fixtures/`
- [x] Document frozen model catalog + checkpoint date fields

## Step 2: Counterfactual replay core

**Status:** Complete

- [x] Implement replay engine comparing actual vs counterfactual routing at each step
- [x] Compute cumulative regret vs hindsight-optimal routing on fixtures
- [x] Add `npm run routing:eval-replay` script entry

## Step 3: Testing and verification

**Status:** Complete

- [x] Unit tests on fixture traces
- [x] Run `npm run verify:ci`

---

## Completion Criteria

- [x] Fixture trace format with step-level prefixes
- [x] Counterfactual replay: cheap-at-step-k vs verified progression
- [x] Frozen model catalog metadata in fixtures
- [x] Unit tests on sample traces
- [x] `npm run verify:ci` passes

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes
