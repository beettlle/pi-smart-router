# Task: SP-263 — peer bump pi 0851

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Bump runtime peers to pi 0.85.1 and align minPiVersion.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- Bucket: feature
- Partial: #154 Partial (engines/CI in SP-264)
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Bump declared `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` from `^0.84.4` to `^0.85.1`, refresh lockfile, and align package `minPiVersion` with the pinned peer floor.

1. Update `package.json` dependency ranges and run `npm install` so lockfile resolves 0.85.1.
2. Set `minPiVersion` to match the peer floor (document chosen value in STATUS).
3. Fix any type/API breakages introduced by 0.85.1 that block `release:check`.
4. Do **not** retarget CI Node versions (SP-264). Do **not** bump `package.json` version field.

## Dependencies

- **None**

## Context to Read First

- package.json dependencies / peerDependencies / minPiVersion
- npm view @earendil-works/pi-ai@version 0.85.1
- spine-tasks/_authoring/release-v1.0.0/manifest.md dependency freshness table

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `package.json`, `package-lock.json` |
| May change | `.pi/extensions/smart-router (only if minPiVersion / import types require)`, `src/** only for 0.85.1 type fixes` |
| Must NOT change | `package.json version field`, `.github/workflows/** (SP-264)`, `src/domain/pipeline/router-pipeline.ts (SP-272+)` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run release:check` |
| fileScopeMustChange | `package.json` |
| fileScopeMustNotChange | `package.json version field, .github/workflows` |
| completionCriteria | Declared peers ^0.85.1 installed; minPiVersion aligned; release:check exit 0 |

## Steps

### Step 0: Preflight

- [ ] Confirm npm latest peers are 0.85.1
- [ ] Note current minPiVersion

### Step 1: Bump peers + lockfile

- [ ] Update dependency ranges to ^0.85.1
- [ ] npm install; align minPiVersion
- [ ] Fix compile breaks if any

### Step 2: Testing & Verification

- [ ] Run contract testCommand (`npm run release:check`)
- [ ] STATUS records installed versions

## Completion Criteria

- [ ] Declared peers ^0.85.1 installed; minPiVersion aligned; release:check exit 0

## Do NOT

- Change CI node-version (SP-264)
- Bump package version to 1.0.0
- Upgrade better-sqlite3 / typescript majors
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-263): bump pi peers to 0.85.1`
