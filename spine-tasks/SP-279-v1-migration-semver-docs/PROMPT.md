# Task: SP-279 — v1 migration semver docs

**Created:** 2026-09-05
**Size:** M

## Review Level: 1

**Assessment:** 1.0 migration guide and SemVer stability README pass.
**Score:** 2/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- Bucket: documentation
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Theme docs for **v1.0.0** after calibration + pipeline + hygiene land:

1. Add `docs/migration-v1.md` (or equivalent) covering breaking expectations, engines, peers, calibration artifacts, and pipeline architecture notes for operators.
2. Update README: drop “may change until 1.0.0” caveat; set current release to 1.0.0 only when publishing — for this packet, prepare wording that matches shipped 1.0 behavior (do **not** bump package.json version).
3. Cross-link shadow dogfood + calibration behavioral path.
4. Match shipped behavior only.

## Dependencies

- **SP-271**
- **SP-276**
- **SP-264**
- **SP-265**

## Context to Read First

- Manifest theme
- README SemVer note
- SP-271/276 STATUS

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `docs/migration-v1.md`, `README.md` |
| May change | `docs/** cross-links` |
| Must NOT change | `package.json version field`, `Unshipped #96 as done` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `docs/migration-v1.md` |
| fileScopeMustNotChange | `package.json` |
| completionCriteria | Migration guide + README SemVer stability wording for 1.0; version field untouched |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-271/276/264/265 landed behavior

### Step 1: Write migration + README

- [ ] Create docs/migration-v1.md
- [ ] Update README SemVer / release notes pointers

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Migration guide + README SemVer stability wording for 1.0; version field untouched

## Do NOT

- Bump package.json version
- Claim encoder defaults flipped
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-279): v1.0 migration and SemVer stability`
