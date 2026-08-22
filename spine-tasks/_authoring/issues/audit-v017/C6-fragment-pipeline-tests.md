## Summary

Split the ~1946-line `router-pipeline.test.ts` into stage-focused test modules for maintainability.

## Priority

P2

## Pipeline stages

`tests/unit/router-pipeline.test.ts`

## Problem / motivation

Single monolithic test file requires excessive mock setup; failures are hard to localize. Tight coupling to god-object pipeline (Gemini retry P3).

## Proposed solution

- [ ] Extract suites: `pipeline-triage.test.ts`, `pipeline-safe-default.test.ts`, `pipeline-pin.test.ts`, etc.
- [ ] Share test fixtures via `tests/fixtures/pipeline-helpers.ts` (or existing patterns).
- [ ] Keep `router-pipeline.test.ts` as thin re-export or delete after migration.
- [ ] Coordinate with B1 phasing — split tests as stages extract.
- [ ] No reduction in assertion count / coverage.

## Evidence

- `tests/unit/router-pipeline.test.ts` — ~1946 lines
- Gemini retry backlog item 9

## Dependencies

| Issue | Role |
|-------|------|
| B1 | Stage extraction enables cleaner test split |

## Out of scope

- Rewriting all pipeline tests in one PR if B1 is multi-phase

## Verification

```bash
npm test
npm run coverage:check
# Total test count unchanged (1875+)
```

## Human vs autonomous

| Work | Owner |
|------|-------|
| Test refactor | Autonomous |
