# Task: SP-286 — operator notes issues

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

Write operator notes linking #168–#172 and #110/#95 status. No default flips (#96 stays deferred).

## Dependencies

- SP-284
- SP-285

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
| Must change | `spine-tasks/_authoring/release-v1.1.0/**` notes |
| May change | README cross-links only |
| Must NOT change | `config/operator-config.json.example` encoder/frugality defaults |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | (see Must change in File Scope) |
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

- Close #95 / #110 / #96
- Flip shipped encoder or frugality defaults

## Completion Criteria

- [ ] Mission complete without inventing labels or flipping #96 defaults
