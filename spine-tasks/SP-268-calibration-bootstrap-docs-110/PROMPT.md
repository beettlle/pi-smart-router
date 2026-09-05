# Task: SP-268 — calibration bootstrap docs 110

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Document zero-manual-label bootstrap fields for behavioral calibration.
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 0, Security: 0, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#110
- Bucket: documentation
- Partial: #110
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #110 — document the **zero-manual-label bootstrap** path: which outcome fields (model override, compaction pin break, loop-escalation proxies, stop_reason) are sufficient to train without `/feedback`.

1. Update README calibration section and/or `docs/` calibration note.
2. Cross-link aggregate/train/verify commands.
3. Do not train or overwrite `config/routing-calibration.json` here.

## Dependencies

- **None**

## Context to Read First

- Issue #110
- README calibration section
- config/routing-calibration.json.example
- docs/qa/shadow-dogfood-protocol.md

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `README.md` |
| May change | `docs/** calibration notes` |
| Must NOT change | `config/p-success-weights.json`, `config/routing-calibration.json` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `README.md` |
| fileScopeMustNotChange | `config/p-success-weights.json` |
| completionCriteria | Bootstrap fields documented; Partial #110 |

## Steps

### Step 0: Preflight

- [ ] Read #110 acceptance + existing calibration docs

### Step 1: Document bootstrap fields

- [ ] List outcome fields sufficient without /feedback
- [ ] Link train/aggregate commands

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Bootstrap fields documented; Partial #110

## Do NOT

- Train weights
- Ship routing-calibration.json
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `docs(SP-268): behavioral calibration bootstrap path (#110)`
