# Task: SP-135 — AST tool-call validation for profile ingestion

**Created:** 2026-07-09
**Size:** M

## Review Level: 2

**Assessment:** #75 part 2 — Switchcraft-style AST validation for tool-capability ingestion (not exact string match).
**Score:** 5/8

## Source

- GitHub: beettlle/pi-smart-router#75
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Add AST-based tool-call validation helper used during benchmark profile ingestion. Parse representative tool-use snippets; validate call structure (function name, argument shape) without exact string equality. Integrate into ingest pipeline from SP-134 so tool-use capability scores reject malformed fixture rows.

## Dependencies

- SP-134

## Context to Read First

- `scripts/ingest-benchmark-profiles.ts`
- `docs/routing-roadmap.md` — Switchcraft reference
- `docs/gemini-research.md` §4

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/lib/ast-tool-validation.ts` |
| May change | `scripts/ingest-benchmark-profiles.ts`, `tests/unit/ast-tool-validation.test.ts`, `tests/fixtures/tool-call-samples/` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `scripts/lib/ast-tool-validation.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | AST validator rejects malformed tool calls; ingest uses validator; positive/negative fixture tests; document false-negative tradeoff in script output. |

## Steps

### Step 1: AST validation module

- [ ] Implement `validateToolCallAst(snippet)` for common tool-call shapes
- [ ] Support JSON/tool-call object patterns used in agent traces

### Step 2: Ingest integration

- [ ] Wire validator into SP-134 ingest for tool-use benchmark rows
- [ ] Log skipped rows with reason codes

### Step 3: Testing and verification

- [ ] Unit tests: valid calls pass, malformed fail, paraphrase-tolerant cases
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] AST validator module with tests
- [ ] Ingest pipeline uses validation
- [ ] Documented validation approach
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-135): description`

## Do NOT

- Change runtime mapper (SP-136)
- Add online serving changes

## Amendments (Added During Execution)

**2026-07-09 — Pre-land redirect after SP-134 wave 0:** `scripts/ingest-benchmark-profiles.ts` landed on `main`. AST validator is new module; ingest wiring moves to May change only.

---
