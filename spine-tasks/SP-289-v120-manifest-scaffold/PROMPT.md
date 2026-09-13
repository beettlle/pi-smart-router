# Task: SP-289 — v1.2.0 manifest scaffold

**Created:** 2026-09-12
**Size:** S

## Review Level: 1

**Assessment:** Release bookkeeping for long-context encoder path minor.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- Release: v1.2.0
- Manifest: `spine-tasks/_authoring/release-v1.2.0/manifest.md`
- Bucket: chore

## Mission

Confirm v1.2.0 authoring manifest, CONTEXT Next Task ID / Phase 60 table, and `dependencies.json` edges for SP-289–SP-295. No product code changes.

## Dependencies

- **None**

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.2.0/manifest.md`
- `skills/router-release-operator/SKILL.md` (Phase 3)

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/CONTEXT.md`, `spine-tasks/dependencies.json`, `spine-tasks/_authoring/release-v1.2.0/manifest.md` |
| Must NOT change | `config/**`, `src/**`, `.github/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `spine-tasks/CONTEXT.md`, `spine-tasks/_authoring/release-v1.2.0/manifest.md` |
| fileScopeMustNotChange | `config/`, `src/` |
| completionCriteria | Manifest scope ID matches packets; Next Task ID = SP-296; dependencies edges match PROMPTs |

## Steps

### Step 0: Preflight

- [ ] Read CONTEXT + v1.2.0 manifest
- [ ] Confirm operator approved scope on manifest

### Step 1: Implementation

- [ ] Align CONTEXT Phase 60 + Next Task ID with SP-289–SP-295
- [ ] Confirm `dependencies.json` edges match each PROMPT Dependencies section

### Step 2: Testing & Verification

- [ ] Run `npm run typecheck`
- [ ] `spine tasks validate SP-289 SP-290 SP-291 SP-292 SP-293 SP-294 SP-295`

## Do NOT

- Change product code or flip encoder defaults
- Start a spine batch without operator schedule

## Completion Criteria

- [ ] Bookkeeping complete; no product diffs
