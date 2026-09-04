# Task: SP-262 — Theme docs: facade + coverage + pin operator notes

**Created:** 2026-09-04
**Size:** S

## Review Level: 1

**Assessment:** Operator-facing README/theme docs for v0.22.0 facade, extension coverage gate, and pin/dispose posture.
**Score:** 2/8 — Blast radius: 0 (docs), Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- Bucket: documentation
- Release: v0.22.0
- Manifest: `spine-tasks/_authoring/release-v0.22.0/manifest.md`
- Closes theme docs only (issues closed by SP-257/258/260)

## Mission

Ship **v0.22.0 theme documentation** after the implementation packets:

1. README Embedding / extension section: public facade vs internal API; point operators/extension authors at package exports (not deep `src/` imports).
2. Testing section: extension coverage include + threshold behavior (`coverage:check`).
3. Cross-link SP-261 supply-chain notes (pins, offline cache, dispose).
4. Optional C4 parity / architecture note if an existing doc is the right home — do not invent a large new architecture epic.
5. Match shipped behavior only — no aspirational docs for unshipped #143/#96.

## Dependencies

- **SP-257**
- **SP-258**
- **SP-260**
- **SP-261**

## Context to Read First

- SP-257/258/260/261 STATUS + commits
- README Embedding / Testing sections
- Manifest theme sentence

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `docs` C4/parity or architecture notes if already present |
| Must NOT change | Runtime code under `src/`, `.pi/extensions/smart-router`, `vitest.config.ts`, `.eslintrc.cjs`, `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `package.json`, `src/domain/pipeline`, `.pi/extensions/smart-router` |
| completionCriteria | Theme docs describe facade, coverage gate, and pin/dispose links matching shipped behavior |

## Steps

### Step 0: Preflight

- [ ] Skim landed SP-257–SP-261 behavior on main
- [ ] Locate README Embedding + Testing sections

### Step 1: Theme documentation

- [ ] Document facade / public vs internal API
- [ ] Document extension coverage gate
- [ ] Cross-link supply-chain / dispose notes

### Step 2: Testing & Verification

- [ ] Contract `testCommand` green
- [ ] Docs match shipped commands/paths

## Completion Criteria

- [ ] Theme docs complete for v0.22.0

## Do NOT

- Re-implement facade/coverage/pin code
- Document unshipped pipeline split (#143) as done
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-262): v0.22.0 facade coverage and pin theme`

## Amendments

- None
