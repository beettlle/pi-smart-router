**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: AST validation module

- [x] Implement `validateToolCallAst(snippet)` for common tool-call shapes
- [x] Support JSON/tool-call object patterns used in agent traces

**Status:** Complete

## Step 2: Ingest integration

- [x] Wire validator into SP-134 ingest for tool-use benchmark rows
- [x] Log skipped rows with reason codes

**Status:** Complete

## Step 3: Testing and verification

- [x] Unit tests: valid calls pass, malformed fail, paraphrase-tolerant cases
- [x] Run `npm run verify:ci`

**Status:** Complete

## Completion Criteria

- [x] AST validator module with tests
- [x] Ingest pipeline uses validation
- [x] Documented validation approach
- [x] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-09 | 1 | plan | skipped (engine post-.DONE) |
| 2026-07-09 | 2 | plan | skipped (engine post-.DONE) |
| 2026-07-09 | 3 | plan | skipped (engine post-.DONE) |

## Discoveries

**2026-07-09:** Pre-land redirect — ingest script on main from SP-134; AST validator is new primary deliverable.

**2026-07-09:** `benchmark_sources` schema relaxed to `partialRecord` so skipped AST rows do not require absent benchmark keys.
