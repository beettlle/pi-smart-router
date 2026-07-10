# SP-179: Live Leaderboard Snapshot Ingest — Status

**Current Step:** 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Live / recorded ingest modes

**Status:** ⬜ Not Started

- [ ] Add CLI flags for live fetch and/or record-to-fixture and ingest-from-recorded
- [ ] Keep default path = checked-in fixtures (no network)
- [ ] On live success, write recorded snapshot(s) with scrape_date + source_url
- [ ] Fail fast on network/parse failure; do not corrupt committed profiles

## Step 2: Recorded snapshot fixture + unit tests

**Status:** ⬜ Not Started

- [ ] Check in at least one recorded live-style snapshot usable offline
- [ ] Unit tests: fixtures default; recorded replay; help documents flags
- [ ] `routing:verify-benchmark-profiles` still green

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Scoped vitest + typecheck
- [ ] `routing:verify-benchmark-profiles`
- [ ] Full `npm test`
- [ ] Coverage gate ≥77%

---

## Completion Criteria

- [ ] Default ingest remains fixture-only
- [ ] Live/record path exists and is in CLI help
- [ ] Offline unit coverage for recorded replay
- [ ] Provenance on recorded artifacts
- [ ] Fleet aliases preserved

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

(none yet)
