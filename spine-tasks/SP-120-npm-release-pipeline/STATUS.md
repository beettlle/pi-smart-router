# SP-120 Status

**Current Step:** Done
**Status:** Complete
**Last Updated:** 2026-07-07
**Review Level:** 2
**Size:** M

---

## Step 1: package.json publish manifest

**Status:** ✅ Complete

- [x] pi manifest, files, peerDependencies, release:check, bin
- [x] Nested extension package.json fixed

## Step 2: release.yml

**Status:** ✅ Complete

- [x] Tag-triggered workflow with NPMSECRET

## Step 3: CLI bin and extension

**Status:** ✅ Complete

- [x] bin/pi-smart-router.mjs
- [x] /smart-router export telemetry-contrib

## Step 4: README release pass

**Status:** ✅ Complete

- [x] Install, operator commands, scripts table, stale fixes

## Step 5: Testing and verification

**Status:** ✅ Complete

- [x] `npm run release:check`
- [x] `npm pack --dry-run`
- [x] Tarball excludes `.pi/extensions/smart-router/node_modules` (~292 kB)
- [x] Required paths: `dist/index.js`, `src/index.ts`, extension `index.ts`, `bin/pi-smart-router.mjs`

## Operator release ceremony (post-merge)

**Status:** Ready — requires maintainer with `NPMSECRET` and push access.

1. Merge SP-120 to `main`; confirm CI green
2. `npm run release:check`
3. `npm version 0.1.0`
4. `git push && git push --tags`
5. Watch Actions → **Release**
6. Post-publish: `pi install npm:pi-smart-router`, `/model smart-router/auto`, `/smart-router status`

- [x] All acceptance criteria from PROMPT met
- [x] `npm run release:check` passes
