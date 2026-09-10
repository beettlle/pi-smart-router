# Task: SP-283 — verifier-grade train

**Created:** 2026-09-10
**Size:** M

## Review Level: 1

**Assessment:** Post-1.0 calibration follow-up; bounded file scope.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 1, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#168
- Release: v1.1.0
- Manifest: `spine-tasks/_authoring/release-v1.1.0/manifest.md`

## Mission

Aggregate + train p_success/isotonic/triage on verifier-grade labels only. Must clear hard ECE gates offline before SP-284 ships.

## Dependencies

- SP-281
- SP-282

## Context to Read First

- `spine-tasks/CONTEXT.md`
- `spine-tasks/_authoring/release-v1.1.0/manifest.md`
- `docs/migration-v1.md` (honest-untrained 1.0 posture)
- Issue beettlle/pi-smart-router#168

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `scripts/train-*.ts`, train notes under `spine-tasks/_authoring/release-v1.1.0/` |
| May change | `data/calibration/**` (gitignored ok) |
| Must NOT change | checked-in `config/*.json` ship artifacts (SP-284) |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run routing:verify-calibration -- --skip-embed` |
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

- Overwrite checked-in ship artifacts (that is SP-284)
- Train on dogfood-gather scripted_intent for ship claims

## Completion Criteria

- [ ] Mission complete without inventing labels or flipping #96 defaults
