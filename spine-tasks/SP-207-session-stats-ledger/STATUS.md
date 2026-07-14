**Current Step:** Step 1: Aggregate helper + formatters
**Status:** In Progress
**Last Updated:** 2026-07-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Aggregate helper + formatters

**Status:** In Progress

- [x] Pure aggregate over RoutingTelemetry
- [x] Role cost buckets + optional frontier savings (fail closed)
- [x] formatStatsMessage + JSON snapshot type
- [x] Unit tests (empty / mixed / privacy)

## Step 2: Wire `/smart-router stats`

**Status:** Not Started

- [ ] Command union + parse + completion + usage
- [ ] listTelemetry → format handler
- [ ] No pipeline/default edits

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
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-13 | GitNexus impact on extension symbols returned UNKNOWN (not indexed); new pure helper under `src/infrastructure/telemetry/session-stats.ts` avoids router-pipeline. | Low — blast radius limited to command formatters + new helper |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-13 | step_start | Step 1 — Aggregate helper + formatters |
| 2026-07-13 | outcomes | Aggregate helper, formatters, unit tests (5 pass) |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Release: v0.12.1 (patch operator override). Closes #118.
Before dogfood (#95): land this first so operators can `/smart-router stats` during the matrix.
Helper path: `src/infrastructure/telemetry/session-stats.ts` (File Scope: May change).
