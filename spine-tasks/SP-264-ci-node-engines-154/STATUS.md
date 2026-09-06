# SP-264 — Pin CI Node to engines floor and document prerequisites. — Status

**Current Step:** 1
**Status:** In Progress
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 0: Preflight

**Status:** Complete

- [x] Inventory workflows using node-version 22
- [x] Confirm engines.node already >=22.19.0

## Step 1: Pin CI + docs

**Status:** In Progress

- [x] Update workflows to 22.19.0 (or documented floor)
- [x] README prerequisites / engine-strict note

## Step 2: Testing & Verification

**Status:** Not Started

- [ ] Contract testCommand green
- [ ] STATUS lists updated workflow paths

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-09-06 | `engines.node` is `>=22.19.0`; workflows `ci.yml`, `release.yml`, `calibration-verify.yml`, `eval-harness-smoke.yml` pin `'22'` | In-scope workflows updated to `22.19.0` |
| 2026-09-06 | Out-of-scope workflows also use `'22'`: `benchmark-profile-refresh.yml`, `npm-deprecate.yml`, `twinrouterbench-full-nightly.yml` | Left unchanged per File Scope; candidate for follow-up |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | Inventoried workflows; engines floor confirmed |
| 2026-09-06 | Step 1 changes made | Pinned ci.yml, release.yml, calibration-verify.yml, eval-harness-smoke.yml to 22.19.0; README engine note added |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |
