# Task: SP-296 — move host-provided pi-ai out of dependencies

**Created:** 2026-10-19
**Size:** S

## Review Level: 1

**Assessment:** Package-manifest fix for the pi 1.x extension-loader warning; no runtime logic change.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#176
- Release: v1.2.1
- Bucket: bug
- Closes: #176

## Mission

pi 1.x (`resource-loader.js` → `collectExtensionPackageWarnings`) warns when an extension package lists a host-provided package in `dependencies`:

> Host-provided extension packages must be declared in peerDependencies with a "*" range, not dependencies: @earendil-works/pi-ai.

Host-provided set in pi 1.3.0: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, the `@mariozechner/*` equivalents, `@sinclair/typebox`, `typebox`.

Remove `@earendil-works/pi-ai` from `dependencies`. Keep `peerDependencies["@earendil-works/pi-ai"] = "*"` with `peerDependenciesMeta.optional = true` (do **not** make it non-optional — npm would auto-install a duplicate copy into `~/.pi/agent/npm`). Add it to `devDependencies` at the currently installed range (`^0.85.1`; SP-297 bumps it). Add a unit test that fails if any host-provided package appears in `dependencies` or has a peer range other than `*`.

Runtime value import to confirm: `src/infrastructure/delegation/provider-error.ts` imports `isContextOverflow` from `@earendil-works/pi-ai` and is re-exported by `src/index.ts`. Inside pi the host supplies `pi-ai`. Confirm `bin/pi-smart-router.mjs` (loads `dist/cli/smart-router-cli.js` and `dist/infrastructure/persistence/sqlite-store.js`) does not transitively import `provider-error.ts`; if it does, make that import lazy in the CLI path. `npm run release:consumer-pack` must stay green.

## Dependencies

- None

## Context to Read First

- `package.json` (`dependencies`, `peerDependencies`, `peerDependenciesMeta`, `devDependencies`)
- `scripts/verify-consumer-pack.sh`
- `bin/pi-smart-router.mjs`
- `src/infrastructure/delegation/provider-error.ts`
- `~/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js` (`HOST_PROVIDED_PACKAGES` / `collectExtensionPackageWarnings`)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `package-lock.json`, `tests/unit/package-host-deps.test.ts` |
| Must NOT change | `src/domain/**`, `.pi/extensions/smart-router/fleet-bootstrap.ts`, `src/config/pi-model-mapper.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npx vitest run tests/unit/package-host-deps.test.ts && npm run release:consumer-pack` |
| fileScopeMustChange | `package.json`, `tests/unit/package-host-deps.test.ts` |
| fileScopeMustNotChange | `src/domain/`, `src/config/pi-model-mapper.ts` |
| completionCriteria | No host-provided package in `dependencies`; pi-ai peer `*` optional; pi-ai in devDependencies; host-deps unit test green; consumer-pack green |

## Steps

### Step 0: Preflight

- [ ] Confirm the host-provided list from the pi 1.3.0 `resource-loader.js`
- [ ] Trace the CLI import graph (`bin/pi-smart-router.mjs` → dist modules) for `pi-ai` value imports

### Step 1: Implementation

- [ ] Move `@earendil-works/pi-ai` from `dependencies` to `devDependencies`; keep the optional `*` peer
- [ ] Run `npm install` so `package-lock.json` matches
- [ ] Add `tests/unit/package-host-deps.test.ts` asserting no host-provided package in `dependencies` and every host-provided peer uses `*`

### Step 2: Testing & Verification

- [ ] Run Contract `testCommand`
- [ ] Record the CLI import-graph finding in STATUS

## Do NOT

- Make `@earendil-works/pi-ai` a non-optional peer
- Bump pi package versions (SP-297)

## Completion Criteria

- [ ] #176 warning condition removed from `package.json`
- [ ] Host-deps unit test green
- [ ] `npm run release:consumer-pack` exit 0
