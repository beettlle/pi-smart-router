# SP-185: Terminal-Bench Live Source + Adapter — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 1
**Iteration:** 0
**Size:** M

---

## Step 1: Lock Terminal-Bench live source

**Status:** 🔄 In Progress

- [x] Choose free source or operator-mirror schema
- [x] Implement adapter + model mapping
- [x] No paid Parse default

## Step 2: Operator docs + e2e smoke notes

**Status:** ⬜ Not Started

- [ ] README live sources table (all four)
- [ ] Offline unit sample

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Full suite + coverage ≥77%
- [ ] Record --live smoke outcome in STATUS

---

## Completion Criteria

- [ ] TB path explicit
- [ ] README updated
- [ ] #104 closable
- [ ] No invented scores

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | No free stable TB JSON: tbench.ai HTML-only; api.tbench.ai NXDOMAIN; HF submissions-only; ALL-Bench lacks TB; Parse needs key | Ship operator `--live-url` fixture-shaped mirror + recorded fallback; `liveFetchUrl` unset |
| 2026-07-10 | GitNexus impact on new adapter symbols returned not-found (index stale for SP-181+) | Proceeded with UNKNOWN risk; blast radius limited to registry swap |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 started | Investigating free TB live source; plan review before implement |
| 2026-07-10 | Step 1 outcomes | terminal-bench.ts operator-mirror adapter; index registry wired; unit tests added |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

Operator mirror schema: `{ benchmark: "terminal_bench", source_url, scrape_date, entries: [{ model_id, score }] }`. Pass `--live-url terminal_bench=<https-url>`.
