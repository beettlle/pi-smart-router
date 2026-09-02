# SP-254: Live leaderboard re-ingest + Gemini fleet aliases — Status

**Current Step:** 3
**Status:** Complete
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ✅ Complete

- [x] Read README ingest section + current `config/benchmark-profiles.json` aliases
- [x] Note freeze `catalog_freeze_date` / `scrape_date` (expect 2026-08-30 pre-change) — confirmed both `2026-08-30`
- [x] List dogfood ids to retarget: `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-3.1-pro-preview`

Pre-change artifact: 4 `models[]` rows (`claude-opus-4-5`, `claude-sonnet-4-6`, `gemini-2.5-flash`, `gpt-5.3-codex`); `gemini-flash-latest → gemini-2.5-flash` present; `gemini-flash-lite-latest` / `gemini-3.1-pro-preview` absent from aliases.

## Step 1: Live leaderboard ingest

**Status:** ✅ Complete

> Per-board source: `swebench_verified=live`, `livecodebench=live`, `bfcl=live`, `terminal_bench=recorded` (live HTML fetch failed open to recorded snapshot). Scores unchanged vs freeze; provenance dates advanced 2026-08-30 → 2026-09-02. Post-ingest grounded rows: `claude-opus-4-5`, `claude-sonnet-4-6`, `gemini-2.5-flash`, `gpt-5.3-codex` (claude-3.5-haiku skipped — incomplete coverage). Commit `a15e9aa`.

- [x] Run `npm run routing:ingest-benchmarks -- --live` (network)
- [x] On total failure: `--recorded` or fixture ingest — do not invent scores (n/a — live succeeded; terminal_bench fell back to recorded per-board)
- [x] Commit dirty `config/benchmark-profiles.json` + `tests/fixtures/benchmark-leaderboards/recorded/**` when changed
- [x] Record per-board `source=live|recorded|fixture` in Discoveries

## Step 2: Fleet alias retarget + seed defaults

**Status:** ✅ Complete (commit `846b70a`)

> Available post-ingest `models[].model_id`: `claude-opus-4-5`, `claude-sonnet-4-6`, `gemini-2.5-flash`, `gpt-5.3-codex`. **No newer Gemini grounded row exists** → per PROMPT fallback: remove stale `gemini-flash-latest → gemini-2.5-flash`; `gemini-flash-latest` / `gemini-flash-lite-latest` / `gemini-3.1-pro-preview` documented as intentional `pattern_default` (rolling/preview ids track post-2.5 generations with no grounded row; aliasing to 2.5-flash would misstate capability).

- [x] Retarget aliases only onto existing post-ingest `models[].model_id` rows (n/a — no newer Gemini row exists)
- [x] If no suitable row: remove stale `→ gemini-2.5-flash` for rolling `*-latest` / document intentional `pattern_default` — removed `gemini-flash-latest` alias; `gemini-flash-latest` / `gemini-flash-lite-latest` / `gemini-3.1-pro-preview` documented intentional `pattern_default`
- [x] Update `DEFAULT_FLEET_BENCHMARK_ALIASES` to match artifact (no re-seed of stale 2.5 mapping for `gemini-flash-latest`)
- [x] Optional: one-line coverage rationale in `docs/capability-profile-coverage.md` (Intentional gaps rows added; primary fixture 20/20 → 19/19)

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract `testCommand` green (typecheck ✓, verify-benchmark-profiles ✓, mapper + coverage suites 48/48 ✓)
- [x] Mapper coverage asserts for dogfood fleet ids — `gemini-flash-latest` / `gemini-flash-lite-latest` / `gemini-3.1-pro-preview` asserted `pattern_default` in `INTENTIONAL_PATTERN_DEFAULT_IDS`; primary fixture 19/19 `benchmark`
- [x] Provenance dates advanced when live succeeded (2026-08-30 → 2026-09-02, artifact + all 4 recorded snapshots)

## Completion Criteria

- [x] Public leaderboards re-ingested (live preferred; recorded/fixture fallback documented) — 3 boards live, terminal_bench recorded fallback; committed
- [x] Gemini dogfood aliases corrected or intentional pattern_default with rationale — stale `gemini-flash-latest → gemini-2.5-flash` removed; all three dogfood ids documented intentional `pattern_default` in coverage doc + coverage test
- [x] Seed defaults aligned; verify + unit tests green — `DEFAULT_FLEET_BENCHMARK_ALIASES` matches artifact; `npm run typecheck` ✓, `routing:verify-benchmark-profiles` ✓, full `npm test` 2104/2104 ✓

## Discoveries

- Live ingest 2026-09-02: `swebench_verified=live` (raw.githubusercontent SWE-bench leaderboards.json), `livecodebench=live` (performances_generation.json), `bfcl=live` (gorilla gh-pages data_overall.csv), `terminal_bench=recorded` (live HTML not machine-readable; replayed recorded snapshot). No score drift vs 2026-08-30 freeze.
- No grounded Gemini row newer than `gemini-2.5-flash` exists post-ingest, so rolling `gemini-flash-latest` / `gemini-flash-lite-latest` and preview `gemini-3.1-pro-preview` have no valid alias target — intentional `pattern_default` per PROMPT Step 2 fallback (no invented scores).
