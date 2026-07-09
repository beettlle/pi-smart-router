# Task: SP-137 — Monthly CI profile refresh workflow

**Created:** 2026-07-09
**Size:** S

## Review Level: 1

**Assessment:** #75 part 4 — monthly CI refresh of capability profiles with frozen catalog date and provenance.
**Score:** 3/8

## Source

- GitHub: beettlle/pi-smart-router#75
- Release: v0.3.0 Calibration
- Bucket: feature

## Mission

Add GitHub Actions workflow (monthly schedule + manual dispatch) that runs benchmark ingest, validates output, and commits or opens PR with updated profile artifact when scores change. Record frozen catalog date and provenance in artifact header. Smoke test in CI on every PR using fixture snapshots.

## Dependencies

- SP-136

## Context to Read First

- `scripts/ingest-benchmark-profiles.ts`
- `.github/workflows/calibration-verify.yml` (pattern)
- `spine-tasks/SP-120-npm-release-pipeline/PROMPT.md`

## File Scope

| Scope | Paths |
|-------|-------|
| Must change | `.github/workflows/benchmark-profile-refresh.yml` |
| May change | `package.json`, `tests/unit/ingest-benchmark-profiles.test.ts`, `README.md` |
| Must NOT change | `src/domain/pipeline/router-pipeline.ts` |

## Contract

| Field | Value |
|-------|-------|
| testCommand | `npm run verify:ci` |
| fileScopeMustChange | `.github/workflows/benchmark-profile-refresh.yml` |
| fileScopeMustNotChange | `src/domain/pipeline/router-pipeline.ts` |
| completionCriteria | Workflow YAML valid; monthly cron + workflow_dispatch; PR smoke runs ingest on fixtures; README notes refresh policy. |

## Steps

### Step 1: CI workflow

- [ ] Create `benchmark-profile-refresh.yml` with schedule and manual trigger
- [ ] Run ingest + verify on fixtures in PR CI path

### Step 2: Provenance artifact

- [ ] Commit checked-in benchmark profile snapshot with catalog date
- [ ] Document operator refresh policy in README

### Step 3: Testing and verification

- [ ] Validate workflow YAML syntax
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Monthly refresh workflow exists
- [ ] Fixture smoke test in CI
- [ ] Provenance/catalog date in artifact
- [ ] `npm run verify:ci` passes

## Git Commit Convention

- `feat(SP-137): description`

## Do NOT

- Change mapper logic (SP-136)
- Bump npm version

---
