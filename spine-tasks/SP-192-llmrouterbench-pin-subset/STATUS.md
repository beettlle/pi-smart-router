# SP-192: LLMRouterBench Pin + Code/Tool Subset — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Pin + provenance

**Status:** ✅ Complete

- [x] PROVENANCE.md pin + license + paper
- [x] In-scope vs excluded slices documented
- [x] Catalog map + checkpoint policy documented

## Step 2: Subset converter + CI fixture

**Status:** ✅ Complete

- [x] ingest-llmrouterbench-subset.ts with --limit + code/tool filter
- [x] Tiny CI fixture + checksum
- [x] Unit tests: accept code/tool; skip chat-only / unmappable

## Step 3: Testing & Verification

**Status:** ✅ Complete

- [x] Contract testCommand
- [x] Full npm test
- [x] Coverage ≥77%

---

## Completion Criteria

- [x] Pin documented
- [x] Converter offline
- [x] Chat-only excluded
- [x] Full corpus not vendored
- [x] Gates untouched

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | SKIPPED (engine-owned after .DONE; nested spawn blocked) |
| 2026-07-11 | 2 | plan | SKIPPED (engine-owned after .DONE; nested spawn blocked) |
| 2026-07-11 | 3 | plan | SKIPPED (engine-owned after .DONE; nested spawn blocked) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | HF dataset revision `0e5af1b84bf73437a01a1849c0f1d2468baa93fc` (2025-12-08); bundle `bench-release.tar.gz` ~1.28GB — do not vendor. GitHub schema pin `c77cb0506949d8f959e97967d2fefca0e8ff1b05`. | Pin to HF revision + git schema commit in PROVENANCE |
| 2026-07-11 | In-scope code: humaneval, mbpp, livecodebench, swe-bench, studenteval; tool: tau2. Exclude math/knowledge/affective/ArenaHard (IF/chat). | Converter CODE_TOOL_DATASETS filter |
| 2026-07-11 | Avoided editing `loadEvalFixtureDocument` (GitNexus CRITICAL). Emit TwinRouterBenchStaticTrack via new adapter/ingest only. | No harness path edits |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | resume | Step 1 started; plan review skipped per SP-195 engine ownership |
| 2026-07-11 | step1 | PROVENANCE.md written with HF/git pins, slice filter, catalog map |
| 2026-07-11 | step2 | ingest + adapter + synthetic CI fixture (5 records) + unit tests green |
| 2026-07-11 | step3 | contract + npm test (1613) + coverage:check (92.91% lines) green; gates untouched |
| 2026-07-11 | commit | feat(SP-192): complete Step 2 — Subset converter + CI fixture (51b7835) |

## Blockers

None.
