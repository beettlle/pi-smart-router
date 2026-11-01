# SP-311: Benchmark grounding + aliases for Claude 5.x and Gemini 3.1/4 — Status

**Current Step:** Step 1: Ingest refresh
**Status:** In Progress
**Last Updated:** 2026-11-01
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] List leaderboard coverage for scoped ids

**Preflight findings (2026-11-01 live fetch):**
- Live sources reachable: swebench_verified, livecodebench, bfcl (terminal_bench has no live URL → recorded fallback).
- No scoped id (`claude-fable-5-1`, `claude-haiku-5-5`, `claude-opus-5-5`, `claude-sonnet-5-5`, `gemini-4-argon`, `gemini-3.1-pro-preview(-customtools)`, `gemini-flash-latest`, `gemini-flash-lite-latest`) appears on any live leaderboard.
- New public rows available for curated fixtures: `claude-haiku-4-5` (SWE-bench Verified 66.6; BFCL FC 68.70) and `gemini-3-pro-preview` (SWE-bench 77.4 max; BFCL max 72.51). LiveCodeBench / Terminal-Bench carry no rows for these ids.
- Constraint: `tests/unit/pi-model-mapper-coverage.test.ts` (out of scope) pins `gemini-3.1-pro-preview`, `gemini-flash-latest`, `gemini-flash-lite-latest` to `pattern_default`; mapper parity test pins `-customtools` to its base id's source. → All scoped Gemini ids + `claude-fable-5-1` stay ungrounded (listed in provenance); Claude 5.x opus/sonnet/haiku get same-family aliases (gpt-5.5→gpt-5.3-codex precedent).
- Adapters (out of scope) do not catalog the new ids; grounding rows go into checked-in fixtures (curated snapshots), scores mirror adapter max-per-model semantics.

---

### Step 1: Ingest refresh
**Status:** In Progress

- [ ] Live + record or fixture fallback; adapter name normalization

---

### Step 2: Aliases and provenance
**Status:** Complete

- [x] Aliases, ungrounded_fleet_ids, dates

`config/benchmark-profiles.json` regenerated from fixtures (7 models, 47 aliases,
scrape/catalog-freeze 2026-11-01). New same-family aliases: `claude-{opus,sonnet}-5-5`
→ 4.x rows, `claude-haiku-5-5` → new `claude-haiku-4-5` row (+ `anthropic/` forms),
`google/gemini-3-pro-preview` → new row. `provenance.ungrounded_fleet_ids` lists the
12 deliberately ungrounded scoped ids (schema rejects alias/ungrounded overlap).

---

### Step 3: Testing & Verification
**Status:** Not Started

- [ ] Grounded scoped ids report benchmark source
- [ ] Ungrounded ids keep SP-310 defaults
- [ ] verify-benchmark-profiles green
- [ ] Run Contract testCommand
