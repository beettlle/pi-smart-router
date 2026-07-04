# Task: SP-037 — Pi AI Dependency

**Created:** 2026-07-03
**Size:** S

## Review Level: 0

**Assessment:** Dependency addition only.
**Score:** 1/8

## Mission

Add `@earendil-works/pi-ai` as a dependency and `@earendil-works/pi-coding-agent` as a devDependency (types). Verify imports compile.

## Dependencies

- SP-036

## Context to Read First

- `package.json` — current deps
- `tsconfig.json` — module resolution settings
- `docs/PRD.md` §1 — pi.dev ecosystem context

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm test` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `src/domain/**` |

## Steps

### Step 1: Add dependencies

- [ ] `npm install @earendil-works/pi-ai`
- [ ] `npm install -D @earendil-works/pi-coding-agent`
- [ ] Verify `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'` compiles in a scratch file

### Step 2: Testing and verification

- [ ] Run `npm run typecheck && npm test`
- [ ] Confirm 614+ tests still pass

## Completion Criteria

- [ ] All steps complete
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-037): description`

## Do NOT

- Modify any existing source files under `src/`
- Add application logic; this is a dependency-only change

---

## Amendments (Added During Execution)

- `package.json` already contains `pi.skills` from commit `10b563f` (pre-landed). SP-037 still must add `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` deps.
