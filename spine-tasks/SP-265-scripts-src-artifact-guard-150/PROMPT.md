# Task: SP-265 — scripts src artifact guard 150

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Stop silent drift of committed scripts/src compile artifacts.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#150
- Bucket: feature
- Closes: #150
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Closes #150 — remove tracked compiled duplicates under `scripts/src/**` **or** add CI drift detection against live `src/` / `dist/`.

1. Inventory committed `scripts/src/**` and `scripts/calibration-aggregate.js` duplication.
2. Prefer: stop tracking compiled trees + document how scripts resolve TypeScript sources; **or** add a CI check that fails on drift.
3. Ensure calibration aggregate scripts still run via documented entrypoints.
4. Do not change routing domain behavior.

## Dependencies

- **None**

## Context to Read First

- Issue #150
- scripts/src/**
- scripts/calibration-aggregate.js
- package.json scripts

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/` |
| May change | `.github/workflows/ci.yml`, `package.json scripts only`, `.gitignore` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts`, `package.json version field` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck && npm run release:check` |
| fileScopeMustChange | `scripts/` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | No silent scripts/src drift path; Closes #150; release:check green |

## Steps

### Step 0: Preflight

- [ ] Inventory scripts/src vs src duplicates
- [ ] Choose remove vs CI-guard approach; record in STATUS

### Step 1: Implement hygiene

- [ ] Remove tracked artifacts and/or add CI drift guard
- [ ] Keep documented entrypoints working

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] Confirm calibration script entry still documented

## Completion Criteria

- [ ] No silent scripts/src drift path; Closes #150; release:check green

## Do NOT

- Rewrite calibration math
- Touch router-pipeline.ts
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-265): scripts/src artifact hygiene (#150)`
