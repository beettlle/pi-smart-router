# Task: SP-270 — calibration train verify 110

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Train P(success) + isotonic calibration and verify scripts.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#110
- Bucket: feature
- Partial: #110
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #110 — train and verify:

1. `npm run routing:train-p-success`
2. `npm run routing:train-calibration`
3. `npm run routing:verify-calibration` (and soft ECE / dry-run packs per existing scripts)
4. Keep artifacts local/worktree until SP-271 ships checked-in files.
5. Soft ECE / dry-run packs still enforced — no inventing labels.

## Dependencies

- **SP-269**

## Context to Read First

- Issue #110
- SP-269 aggregate counts
- scripts train/verify

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/_authoring/release-v1.0.0/` |
| May change | `config/*.json only as train outputs staged for SP-271`, `scripts/** if train path broken` |
| Must NOT change | `Flip encoder defaults (#96)`, `Invent labels` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run routing:verify-calibration` |
| fileScopeMustChange | `spine-tasks/_authoring/release-v1.0.0/` |
| fileScopeMustNotChange | `config/operator-config.json.example` |
| completionCriteria | Train + verify green on real aggregates; Partial #110 |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-269 sample floor
- [ ] Locate train/verify scripts

### Step 1: Train + verify

- [ ] Run train-p-success + train-calibration
- [ ] Run verify-calibration; record metrics in STATUS

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Train + verify green on real aggregates; Partial #110

## Do NOT

- Invent labels
- Enable modernbert_k4 defaults
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-270): train behavioral calibration (#110)`
