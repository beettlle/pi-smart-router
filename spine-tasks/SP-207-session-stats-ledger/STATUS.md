**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-07-13
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Aggregate helper + formatters

**Status:** Not Started

- [ ] Pure aggregate over RoutingTelemetry
- [ ] Role cost buckets + optional frontier savings (fail closed)
- [ ] formatStatsMessage + JSON snapshot type
- [ ] Unit tests (empty / mixed / privacy)

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
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Release: v0.12.1 (patch operator override). Closes #118.
Before dogfood (#95): land this first so operators can `/smart-router stats` during the matrix.
