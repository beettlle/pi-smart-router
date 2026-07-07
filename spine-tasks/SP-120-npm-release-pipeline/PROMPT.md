# Task: SP-120 — npm release pipeline and publish manifest for v0.1.0

**Created:** 2026-07-07
**Size:** M

## Review Level: 2

**Assessment:** Tag-triggered GitHub Actions release workflow (pi-spine pattern) + package.json publish manifest so `pi install npm:pi-smart-router` works.
**Score:** 5/8

## Source

- Reference: beettlle/pi-spine `.github/workflows/release.yml`
- Bucket: infra
- Target version: `0.1.0` (operator bumps at release time)

## Mission

Add tag-triggered npm publish from GitHub Actions using repository secret `NPMSECRET`. Prepare `package.json` so the published tarball includes library (`dist/`), pi extension, `src/`, CLI bin, and README install path for `pi install npm:pi-smart-router`.

## Dependencies

- SP-090

## Context to Read First

- `../pi-spine/.github/workflows/release.yml`
- `.github/workflows/ci.yml`
- `package.json`
- `.pi/extensions/smart-router/index.ts`
- `README.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/release.yml`, `package.json`, `README.md` |
| May change | `bin/pi-smart-router.mjs`, `.npmignore`, `.pi/extensions/smart-router/package.json`, `.pi/extensions/smart-router/commands.ts`, `.pi/extensions/smart-router/command-formatters.ts`, `.pi/extensions/smart-router/types.ts`, `spine-tasks/dependencies.json`, `spine-tasks/CONTEXT.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run release:check` |
| fileScopeMustChange | `.github/workflows/release.yml`, `package.json` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | `release.yml` publishes with `NPMSECRET`; `release:check` mirrors CI; `npm pack --dry-run` includes dist, src, extension, bin; README documents pi install and release operator flow. |

## Steps

### Step 1: package.json publish manifest

- [ ] `pi-package` keywords, `pi.extensions`, `files` whitelist, `peerDependencies`, `release:check`, `bin`
- [ ] Fix nested extension `package.json`

### Step 2: release.yml

- [ ] Tag trigger + CI gate + verify:ci fallback + build + npm publish + gh release

### Step 3: CLI bin and extension export telemetry-contrib

- [ ] `bin/pi-smart-router.mjs` for `export telemetry-contrib`
- [ ] `/smart-router export telemetry-contrib` in extension

### Step 4: README release pass

- [ ] pi install primary path, security notice, stale fixes, release operator section

### Step 5: Testing and verification

- [ ] `npm run release:check`
- [ ] `npm pack --dry-run`

## Completion Criteria

- [ ] All acceptance criteria from contract met
- [ ] `npm run release:check` passes

## Git Commit Convention

- `feat(SP-120): description`

## Do NOT

- Bump version or push tags in this task (operator action)
- Change routing pipeline behavior
