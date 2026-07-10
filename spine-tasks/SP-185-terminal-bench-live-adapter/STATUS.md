# SP-185: Terminal-Bench Live Source + Adapter — Status

**Current Step:** 3
**Status:** ✅ Complete
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 3
**Iteration:** 0
**Size:** M

---

## Step 1: Lock Terminal-Bench live source

**Status:** ✅ Complete

- [x] Choose free source or operator-mirror schema
- [x] Implement adapter + model mapping
- [x] No paid Parse default

## Step 2: Operator docs + e2e smoke notes

**Status:** ✅ Complete

- [x] README live sources table (all four)
- [x] Offline unit sample

## Step 3: Testing and verification

**Status:** ✅ Complete

- [x] Contract testCommand
- [x] Full suite + coverage ≥77%
- [x] Record --live smoke outcome in STATUS

---

## Completion Criteria

- [x] TB path explicit
- [x] README updated
- [x] #104 closable
- [x] No invented scores

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-10 | 2 | plan | skipped (engine post-.DONE; SP-195) |
| 2026-07-10 | 3 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | No free stable TB JSON: tbench.ai HTML-only; api.tbench.ai NXDOMAIN; HF submissions-only; ALL-Bench lacks TB; Parse needs key | Ship operator `--live-url` fixture-shaped mirror + recorded fallback; `liveFetchUrl` unset |
| 2026-07-10 | GitNexus impact on new adapter symbols returned not-found (index stale for SP-181+) | Proceeded with UNKNOWN risk; blast radius limited to registry swap |
| 2026-07-10 | `detect_changes(compare main)` → risk low; 0 affected processes | Safe to land |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 complete | terminal-bench.ts operator-mirror adapter; registry wired; unit tests |
| 2026-07-10 | Step 2 complete | README live sources table for SWE/LCB/BFCL/TB; offline unit sample |
| 2026-07-10 | Step 3 contract | `npm run typecheck && npx vitest run tests/unit/leaderboard-adapters/terminal-bench.test.ts` — pass (9) |
| 2026-07-10 | Step 3 suite | `npm run typecheck && npm test` — pass |
| 2026-07-10 | Step 3 coverage | `npm run coverage:check` — All files lines 92.91% (≥77%) |
| 2026-07-10 | Step 3 --live smoke | See Notes; restored out-of-scope profile/recorded diffs after smoke |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Operator mirror schema: `{ benchmark: "terminal_bench", source_url, scrape_date, entries: [{ model_id, score }] }`. Pass `--live-url terminal_bench=<https-url>`.

**`--live` smoke (2026-07-10):** succeeded without inventing scores.
- `swebench_verified` → **live** (SWE-bench leaderboards.json)
- `terminal_bench` → **recorded** (no default liveFetchUrl; expected)
- `livecodebench` → **recorded** (stub / no native in this worktree)
- `bfcl` → **recorded** (stub / no native in this worktree)

Live ingest rewrote `config/benchmark-profiles.json` + recorded snapshots; those paths are out of SP-185 File Scope and were **restored** after documenting the smoke outcome.
