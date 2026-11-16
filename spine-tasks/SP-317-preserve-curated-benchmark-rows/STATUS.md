# SP-317: live refresh preserves curated Claude/Gemini grounding rows — Status

**Current Step:** Step 2: Regression test
**Status:** In Progress
**Last Updated:** 2026-11-15
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

### Step 0: Preflight
**Status:** Complete

- [x] List curated rows that live refresh currently drops

Dropped by recorded/live ingest: `claude-haiku-4-5` (SWE-bench + BFCL) and `gemini-3-pro-preview` (SWE-bench + BFCL). Both are absent from `tests/fixtures/benchmark-leaderboards/recorded/`; the existing aggregate therefore omits them.

---

### Step 1: Preserve/merge implementation
**Status:** Complete

- [x] Implement curated-row merge over live ingest

Live ingest preserves existing rows absent from the refreshed mix; fresh rows win for matching ids and output remains deterministically sorted.

---

### Step 2: Regression test
**Status:** In Progress

- [x] Add live/mocked preserve regression test

`preserves curated Claude/Gemini rows omitted by a mocked live refresh (SP-317)` passes along with all 34 ingest tests and 5 leaderboard-fetch tests.

---

### Step 3: Testing & Verification
**Status:** Not Started

- [ ] Run Contract testCommand
- [ ] Document unskipped release:check path in STATUS
