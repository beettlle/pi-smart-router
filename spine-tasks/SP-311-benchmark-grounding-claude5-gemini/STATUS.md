# SP-311: Benchmark grounding + aliases for Claude 5.x and Gemini 3.1/4 — Status

**Current Step:** Complete — awaiting .DONE
**Status:** Complete
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
**Status:** Complete

- [x] Live + record or fixture fallback; adapter name normalization

Done in a312d53d (verified 2026-11-01 on resume): live preflight recorded above;
scoped grounding rows entered via checked-in curated fixtures (fixture fallback
per PROMPT — no scoped id appears on any live leaderboard); adapter name
normalization not needed (adapters out of scope — new ids deliberately live in
fixtures, see Discoveries "Release-refresh interplay").

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
**Status:** Complete

- [x] Grounded scoped ids report benchmark source
- [x] Ungrounded ids keep SP-310 defaults
- [x] verify-benchmark-profiles green
- [x] Run Contract testCommand

All green: `npm run typecheck`, full `npx vitest run` (149 files / 2481 tests),
`npm run routing:verify-benchmark-profiles`, `npm run coverage:check` (91.76% lines,
exit 0), `npm run lint`. Issue #193 verification block satisfied.

Round 3 re-verification (2026-11-01, post-triage): contract `testCommand` green
end-to-end — typecheck OK; scoped files 105/105; verify gate 1/1; stet contract
**0 active findings** (13 dismissed); `coverage:check` exit 0 (91.76% lines).

## Discoveries

- **Out-of-scope test touch (documented, forced by contract):**
  `tests/integration/pi-extension.test.ts` asserted `claude-3.5-haiku` stays
  `pattern_default` because the previous checked-in artifact matched the *recorded*
  live mix (haiku = Terminal-Bench-only → skipped as incomplete). The completion
  criterion "checked-in artifact matches fixture ingest" makes the artifact
  fixture-matched; fixtures carry a complete 4-benchmark `claude-3.5-haiku` row, so
  the id is now legitimately `benchmark`-grounded. Updated that one assertion block
  (plus the same assumption in `tests/unit/pi-model-mapper.test.ts`, which is in
  May-change scope). No production code changed.
- **Scoped Gemini ids stay ungrounded by design:**
  `tests/unit/pi-model-mapper-coverage.test.ts` (out of scope) pins
  `gemini-3.1-pro-preview`, `gemini-flash-latest`, `gemini-flash-lite-latest` to
  `pattern_default`, and the mapper parity rule pins `-customtools` to its base id.
  Live leaderboards (2026-11-01) carry no Gemini 3.1/4 scores at all, so these ids
  are listed in `provenance.ungrounded_fleet_ids` instead of being aliased onto
  wrong-generation rows (SP-254 policy). `claude-fable-5-1` likewise has no
  Fable-family row; cross-family collapse is forbidden by SP-208 policy.
- **Stet round-3 triage (2026-11-01, contract re-run after engine re-invoke):**
  review surfaced 13 findings. Fixed in bbd05312: deterministic code-unit sorts
  for `ungrounded_fleet_ids` (localeCompare is ICU/locale-dependent) at both
  SP-311-added sort sites; CWD-independent checked-in artifact path in the ingest
  test (`CHECKED_IN_PROFILES_PATH` via `import.meta.url`, matching the fdc20cad
  precedent); JSDoc on `loadUngroundedFleetIdsFromBenchmarkProfilesFile` pinning
  the `undefined` = "nothing preserved" contract; sharpened serialize comment;
  new disjointness guard (no fleet alias may target an ungrounded id).
  Dismissed with reasons (all recorded in stet session): the two `:861`/`:136`
  ERRORs claiming `ungroundedFleetIds` is missing from
  `IngestBenchmarkProfilesOptions` are false positives (property defined at line
  298; `tsc --noEmit` green in the same run); `expectedBenchmarkCaps` already
  resolves aliases via `resolveBenchmarkModelId`; file-level `afterEach` already
  resets the mapper cache; `provenance` const is consumed by `ordered`;
  the option is consumed (defaults + `runIngestCli` merge); byte-exact
  artifact-parity string compare is the completion criterion, not brittleness;
  `|| '(none)'` edge impossible (`z.string().min(1)`); code-unit-vs-locale
  inconsistency is the documented intent; pi-extension redundancy assertion is
  out-of-scope and harmless.
- **Release-refresh interplay:** a future live refresh (`release:check`) regenerates
  the artifact from recorded/live adapter output, whose unchanged adapter catalogs
  do not emit `claude-haiku-4-5` / `gemini-3-pro-preview`; the artifact would flip
  back to the recorded mix (verify test accepts either branch). Adapter catalog
  updates are the durable fix (SP-182+ follow-up), out of SP-311 scope.

## Blockers

None.
