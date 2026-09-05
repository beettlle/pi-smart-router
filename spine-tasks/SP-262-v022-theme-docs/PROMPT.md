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

1. Create `docs/extension-package-boundary.md` covering public facade vs internal API (package exports, not deep `src/` imports).
2. Document extension coverage include + threshold behavior (`coverage:check`) in that doc (and/or Testing section cross-link).
3. Cross-link SP-261 supply-chain notes (pins, offline cache, dispose).
4. Optionally add short README Embedding/Testing pointers to the new doc — README was pre-landed by SP-261, so contract proof is the new docs file.
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
| Must change | `docs/extension-package-boundary.md` |
| May change | `README.md` (cross-links only), other `docs/**` notes if already present |
| Must NOT change | Runtime code under `src/`, `.pi/extensions/smart-router`, `vitest.config.ts`, `.eslintrc.cjs`, `package.json` version field |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `docs/extension-package-boundary.md` |
| fileScopeMustNotChange | `package.json`, `src/domain/pipeline`, `.pi/extensions/smart-router` |
| completionCriteria | New theme doc covers facade, coverage gate, and pin/dispose cross-links; README may link to it |

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

- **2026-09-05 (pre-land redirect):** SP-261 already edited `README.md` on `main`. Contract `fileScopeMustChange` redirected to **new** `docs/extension-package-boundary.md`. README remains May-change for cross-links only.
