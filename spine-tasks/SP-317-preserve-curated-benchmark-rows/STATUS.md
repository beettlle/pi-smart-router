# SP-317: live refresh preserves curated Claude/Gemini grounding rows — Status

**Current Step:** Complete
**Status:** Complete
**Last Updated:** 2026-11-15
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] List curated rows that live refresh currently drops

Dropped by recorded/live ingest: `claude-haiku-4-5` and `gemini-3-pro-preview` (both SWE-bench + BFCL). `claude-3.5-haiku` is also absent from the refreshed aggregate because the live mix skips its incomplete capability coverage. The regression mocks the recorded live mix and proves all three existing rows survive.

---

### Step 1: Preserve/merge implementation
**Status:** Complete

- [x] Implement curated-row merge over live ingest

Live ingest preserves existing rows absent from the refreshed mix; fresh rows win for matching ids and output remains deterministically sorted.

---

### Step 2: Regression test
**Status:** Complete

- [x] Add live/mocked preserve regression test

`preserves curated Claude/Gemini rows omitted by a mocked live refresh (SP-317)` passes along with all 34 ingest tests and 5 leaderboard-fetch tests.

---

### Step 3: Testing & Verification
**Status:** Complete

- [x] Run Contract testCommand
- [x] Document unskipped release:check path in STATUS

Passed: typecheck; 39 targeted tests; benchmark-profile verification; stet contract (0 active findings after triage). Full `npm run coverage:check` also passed: 154 files, 2,587 tests, 91.98% lines.

Operator gate: run `npm run release:check` **without** `SMART_ROUTER_SKIP_LIVE_BENCHMARK_REFRESH=1`. Live/live+record refresh now preserves prior-artifact rows and their benchmark provenance when the live mix omits them.
