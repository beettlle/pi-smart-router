**Current Step:** 2
**Status:** In Progress
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

## Step 3: Testing and verification

- [ ] Unit tests: valid calls pass, malformed fail, paraphrase-tolerant cases
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [x] AST validator module with tests
- [ ] Ingest pipeline uses validation
- [ ] Documented validation approach
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-09 | 1 | plan | skipped (engine post-.DONE) |

## Discoveries

**2026-07-09:** Pre-land redirect — ingest script on main from SP-134; AST validator is new primary deliverable.
