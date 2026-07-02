# Task: SP-015 — Triage Engine

**Created:** 2026-07-02
**Size:** M

## Review Level: 2

**Assessment:** Fast-path triage engine with AST scan.
**Score:** 4/8

## Mission

Aho-Corasick heuristics, AST cyclomatic scan, adversarial sanitization. Maps to T025, T025b, T026.

## Dependencies

- SP-014

## Context to Read First

- `specs/001-build-smart-router/spec.md (US2, FR-003, FR-004)`

## Environment

- **Test command:** `npm run typecheck && npm test`

## File Scope

- `src/domain/triage/triage-engine.ts`

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `src/domain/triage/triage-engine.ts` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Trivial/complex/obfuscated prompts classified correctly. |

## Steps

### Step 1: Triage engine

- [ ] T025: Aho-Corasick keyword sets
- [ ] T025b: AST cyclomatic scan (threshold 15)
- [ ] T026: Adversarial sanitization

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-015): description`

## Do NOT

- Integrate pipeline Step 2 (SP-016)

---

## Amendments (Added During Execution)
