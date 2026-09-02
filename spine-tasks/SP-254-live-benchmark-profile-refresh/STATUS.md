# SP-254: Live leaderboard re-ingest + Gemini fleet aliases — Status

**Current Step:** 0
**Status:** Not Started
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ⬜ Not Started

- [ ] Read README ingest section + current `config/benchmark-profiles.json` aliases
- [ ] Note freeze `catalog_freeze_date` / `scrape_date` (expect 2026-08-30 pre-change)
- [ ] List dogfood ids to retarget: `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.1-pro-preview`

## Step 1: Live leaderboard ingest

**Status:** ⬜ Not Started

> ⚠️ Hydrate: Expand with which boards returned `live|recorded|fixture` and whether profiles/recorded paths are dirty.

- [ ] Run `npm run routing:ingest-benchmarks -- --live` (network)
- [ ] On total failure: `--recorded` or fixture ingest — do not invent scores
- [ ] Commit dirty `config/benchmark-profiles.json` + `tests/fixtures/benchmark-leaderboards/recorded/**` when changed
- [ ] Record per-board `source=live|recorded|fixture` in Discoveries

## Step 2: Fleet alias retarget + seed defaults

**Status:** ⬜ Not Started

> ⚠️ Hydrate: After ingest, list available `models[].model_id` and chosen alias targets (or pattern_default rationale).

- [ ] Retarget aliases only onto existing post-ingest `models[].model_id` rows
- [ ] If no suitable row: remove stale `→ gemini-2.5-flash` for rolling `*-latest` / document intentional `pattern_default`
- [ ] Update `DEFAULT_FLEET_BENCHMARK_ALIASES` to match artifact
- [ ] Optional: one-line coverage rationale in `docs/capability-profile-coverage.md`

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand` green
- [ ] Mapper coverage asserts for dogfood fleet ids
- [ ] Provenance dates advanced when live succeeded

## Completion Criteria

- [ ] Public leaderboards re-ingested (live preferred; recorded/fixture fallback documented)
- [ ] Gemini dogfood aliases corrected or intentional pattern_default with rationale
- [ ] Seed defaults aligned; verify + unit tests green

## Discoveries

- (none yet)
