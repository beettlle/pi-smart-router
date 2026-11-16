# SP-317: live refresh preserves curated Claude/Gemini grounding rows — Status

**Current Step:** Step 1: Preserve/merge implementation
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
**Status:** In Progress

- [x] Implement curated-row merge over live ingest

Live ingest preserves existing rows absent from the refreshed mix; fresh rows win for matching ids and output remains deterministically sorted.

---

### Step 2: Regression test
**Status:** Not Started

- [ ] Add live/mocked preserve regression test

---

### Step 3: Testing & Verification
**Status:** Not Started

- [ ] Run Contract testCommand
- [ ] Document unskipped release:check path in STATUS
