# Task: SP-280 — v1.1.0 manifest scaffold

**Created:** 2026-09-10
**Size:** S

## Review Level: 1

**Assessment:** Post-1.0 calibration follow-up; bounded file scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#110
- Release: v1.1.0
- Manifest: `spine-tasks/_authoring/release-v1.1.0/manifest.md`

## Mission

Confirm v1.1.0 authoring manifest, CONTEXT Next Task ID, and dependencies.json edges for SP-280–SP-286. No product code changes.

## Dependencies

- **None**

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.1.0/manifest.md`
- `docs/migration-v1.md` (honest-untrained 1.0 posture)
- Issue beettlle/pi-smart-router#110

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/CONTEXT.md`, `spine-tasks/dependencies.json`, `spine-tasks/_authoring/release-v1.1.0/manifest.md` |
| Must NOT change | `config/**`, `src/**` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `spine-tasks/CONTEXT.md`, `spine-tasks/_authoring/release-v1.1.0/manifest.md` |
| completionCriteria | Mission outcomes met; STATUS honest |

## Steps

### Step 0: Preflight

- [ ] Read CONTEXT + linked issue + migration honesty section
- [ ] Confirm v1.0 neutralize still in place until SP-284 ships trained artifacts

### Step 1: Implementation

- [ ] Deliver mission outcomes within File Scope

### Step 2: Testing & Verification

- [ ] Run contract testCommand
- [ ] Update STATUS with evidence


## Do NOT

- Change product calibration artifacts in this packet
- Start a spine batch without operator schedule

## Completion Criteria

- [ ] Mission complete without inventing labels or flipping #96 defaults
