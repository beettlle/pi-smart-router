# Task: SP-271 — ship routing calibration 110

**Created:** 2026-09-05
**Size:** S

## Review Level: 1

**Assessment:** Ship checked-in routing-calibration.json and supersede synthetic weights when floors met.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 0, Security: 0, Reversibility: 1

## Source

- GitHub: beettlle/pi-smart-router#110
- Bucket: feature
- Closes: #110
- Release: v1.0.0
- Manifest: `spine-tasks/_authoring/release-v1.0.0/manifest.md`

## Mission

Closes #110 — ship checked-in `config/routing-calibration.json` (or document why operator-local) with provenance noting non-synthetic sources; replace/supersede synthetic-only weights when sample floors met; update README calibration section for behavioral-first path; keep CI verify path green.

## Dependencies

- **SP-270**

## Context to Read First

- Issue #110
- SP-270 metrics
- config/routing-calibration.json.example
- config/p-success-weights.json

## Environment

- **Workspace:** pi-smart-router
- **Services required:** None

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `config/routing-calibration.json`, `README.md` |
| May change | `config/p-success-weights.json`, `config/routing-calibration.json.example` |
| Must NOT change | `Flip modernbert_k4 defaults`, `FrugalGPT cascades` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run routing:verify-calibration && npm run release:check` |
| fileScopeMustChange | `config/routing-calibration.json` |
| fileScopeMustNotChange | `config/operator-config.json.example` |
| completionCriteria | Checked-in calibration artifact + README; Closes #110; release:check green |

## Steps

### Step 0: Preflight

- [ ] Confirm SP-270 verify metrics
- [ ] Decide ship vs operator-local with rationale

### Step 1: Ship artifacts + README

- [ ] Commit routing-calibration.json with provenance
- [ ] Update README behavioral-first path
- [ ] Supersede synthetic weights if floors met

### Step 2: Testing & Verification

- [ ] Contract testCommand green

## Completion Criteria

- [ ] Checked-in calibration artifact + README; Closes #110; release:check green

## Do NOT

- Invent provenance
- Enable encoder defaults (#96)
- Modify `.spine/`, `AGENTS.md`, `CLAUDE.md`, `.gitnexus/`
- Bump `package.json` version

## Git Commit Convention

- `feat(SP-271): ship behavioral routing calibration (#110)`
