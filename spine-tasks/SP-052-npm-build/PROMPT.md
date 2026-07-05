# Task: SP-052 — Npm Build Script

**Created:** 2026-07-04
**Size:** M

## Review Level: 1

**Assessment:** Add npm run build and align package exports with dist/ output.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#18
- Bucket: feature

## Mission

`package.json` declares library exports pointing at `./dist/` but `tsconfig.json` sets `"noEmit": true`, no build script exists, and no `dist/` directory is produced. External consumers and `npm publish` cannot use the package as declared.

Tasks:
- Add `"build"` script (e.g. `tsc --project tsconfig.build.json` or `tsup`)
- Create emit-specific tsconfig if needed (preserve strict checks, enable `declaration`, `outDir: dist`)
- Verify `exports`, `main`, and `types` fields resolve correctly after build
- Add `prepublishOnly` or document build step in README
- Optional: add build step to CI (may already exist from SP-048)

## Dependencies

- SP-048

## Context to Read First

- `package.json` — exports, main, types
- `tsconfig.json` — noEmit setting
- `src/index.ts` — public API surface
- `.github/workflows/ci.yml` — CI from SP-048

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `tsconfig.build.json` |
| May change | `tsconfig.json`, `README.md`, `.github/workflows/ci.yml` |
| Must NOT change | `src/domain/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run build && npm run typecheck && npm test` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `src/domain/**` |
| completionCriteria | `npm run build` produces `dist/index.js` (+ `.d.ts` if publishing types); exports resolve correctly; README documents build for contributors. |

## Steps

### Step 1: Create build tsconfig and script

- [ ] Add `tsconfig.build.json` with `noEmit: false`, `outDir: dist`, `declaration: true`
- [ ] Add `"build"` script to `package.json`
- [ ] Preserve strict typecheck via separate `tsconfig.json` (noEmit)

### Step 2: Verify exports and types

- [ ] Confirm `exports`, `main`, and `types` fields resolve after build
- [ ] Add `prepublishOnly` script or document build in README

### Step 3: CI integration

- [ ] Add `npm run build` to CI workflow if not already present from SP-048

### Step 4: Testing and verification

- [ ] Run `npm run build && npm run typecheck && npm test`
- [ ] Verify `dist/index.js` exists and import works

## Completion Criteria

- [ ] `npm run build` produces dist artifacts
- [ ] Package exports align with built output
- [ ] Tests pass

## Git Commit Convention

- `feat(SP-052): description`

## Do NOT

- Change domain routing logic
- Break pi extension path (extension uses source, not dist)

---

## Amendments (Added During Execution)
