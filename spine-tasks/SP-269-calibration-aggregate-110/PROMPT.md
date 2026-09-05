# Task: SP-269 — calibration aggregate 110

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Aggregate dogfood exports meeting sample floors for calibration.
**Score:** 2/8 — Blast radius: 1, Pattern novelty: 0, Security: 1, Reversibility: 0

## Source

- GitHub: beettlle/pi-smart-router#110
- Bucket: feature
- Partial: #110
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Partial #110 — aggregate dogfood exports (`routing:calibration-aggregate` / dataset export) meeting ≥30 sample floor where applicable.

1. Use SP-267 evidence / operator exports (`SMART_ROUTER_DATASET=1`, export dataset).
2. Run `npm run routing:calibration-aggregate` (or documented equivalent).
3. Record sample counts in STATUS; fail closed if floor unmet (do not invent rows).
4. Do not train final artifacts yet (SP-270).

## Dependencies

- **SP-267**
- **SP-268**

## Context to Read First

- Issue #110
- SP-267 evidence
- npm run routing:calibration-aggregate

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `spine-tasks/_authoring/release-v1.0.0/` |
| May change | `data/** privacy-safe aggregates`, `scripts/** aggregate only if broken` |
| Must NOT change | `config/routing-calibration.json (SP-271)`, `Invent samples` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run typecheck` |
| fileScopeMustChange | `spine-tasks/_authoring/release-v1.0.0/` |
| fileScopeMustNotChange | `config/routing-calibration.json` |
| completionCriteria | Aggregate counts recorded; floor met or honest stop; Partial #110 |

## Steps

### Step 0: Preflight

- [ ] Confirm exports available from SP-267
- [ ] Confirm aggregate command

### Step 1: Aggregate

- [ ] Run calibration-aggregate
- [ ] Write counts to release-v1.0.0 artifact note

### Step 2: Testing & Verification

- [ ] Contract testCommand green
- [ ] No invented labels

## Completion Criteria

- [ ] Aggregate counts recorded; floor met or honest stop; Partial #110

## Do NOT

- Invent samples
- Overwrite production weights without train (SP-270)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `chore(SP-269): aggregate calibration dogfood (#110)`
