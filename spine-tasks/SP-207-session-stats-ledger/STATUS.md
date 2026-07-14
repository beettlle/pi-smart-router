**Current Step:** Step 2: Wire `/smart-router stats`
**Status:** In Progress
**Last Updated:** 2026-07-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Aggregate helper + formatters

**Status:** Complete

- [x] Pure aggregate over RoutingTelemetry
- [x] Role cost buckets + optional frontier savings (fail closed)
- [x] formatStatsMessage + JSON snapshot type
- [x] Unit tests (empty / mixed / privacy)

## Step 2: Wire `/smart-router stats`

**Status:** In Progress

- [x] Command union + parse + completion + usage
- [x] listTelemetry → format handler
- [x] No pipeline/default edits

## Step 3: Docs + Testing & Verification

**Status:** Not Started

- [ ] README + shadow-dogfood-protocol pointer
- [ ] Contract tests
- [ ] coverage:check if code changed
- [ ] Close #118

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-13 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-13 | GitNexus impact on extension symbols returned UNKNOWN (not indexed); new pure helper under `src/infrastructure/telemetry/session-stats.ts` avoids router-pipeline. | Low — blast radius limited to command formatters + new helper |
| 2026-07-13 | `spine_review_step` returns skipped in real-pi worker; engine owns reviews after `.DONE`. | Follow SP-195 — proceed after skip |
| 2026-07-13 | Extended `tests/unit/smart-router-pricing.test.ts` for stats parse/completions (extra path vs contract). | Recorded for verification |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-13 | step_start | Step 1 — Aggregate helper + formatters |
| 2026-07-13 | outcomes | Aggregate helper, formatters, unit tests (5 pass) |
| 2026-07-13 | commit | feat(SP-207): complete Step 1 — Aggregate helper + formatters |
| 2026-07-13 | plan_review | Step 1 skipped (engine post-.DONE) |
| 2026-07-13 | step_complete | Step 1 |
| 2026-07-13 | step_start | Step 2 — Wire `/smart-router stats` |
| 2026-07-13 | outcomes | stats command wired; pricing tests 39 pass; no pipeline/default edits |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Release: v0.12.1 (patch operator override). Closes #118.
Before dogfood (#95): land this first so operators can `/smart-router stats` during the matrix.
Helper path: `src/infrastructure/telemetry/session-stats.ts` (File Scope: May change).
Extra test path: `tests/unit/smart-router-pricing.test.ts`.
