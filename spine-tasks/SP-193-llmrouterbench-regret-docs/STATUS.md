# SP-193: LLMRouterBench Offline Regret + Docs — Status

**Current Step:** 2
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-11
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Offline regret / CS report

**Status:** ✅ Complete

- [x] llmrouterbench-regret-report.ts + npm script
- [x] Reuse replay/harness helpers
- [x] Unit tests on CI fixture

## Step 2: Staleness docs + operator path

**Status:** 🔵 In Progress (outcomes done; commit pending)

- [x] PROVENANCE refresh cadence
- [x] README operator section
- [x] PR CI remains TwinRouterBench-only for smoke

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Report on fixture
- [ ] verify:ci
- [ ] Coverage ≥77%

---

## Completion Criteria

- [ ] Offline regret/CS report
- [ ] Staleness documented
- [ ] No full corpus in PR CI
- [ ] Gates untouched
- [ ] #103 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-11 | 1 | plan | skipped (engine-owned after .DONE) |
| 2026-07-11 | 2 | plan | skipped (engine-owned after .DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-11 | `spine_review_step` returns skipped in real-pi worker; engine reviews after .DONE | Proceed without in-worker APPROVE gate |
| 2026-07-11 | Harness `cumulative_regret_usd` / CS ratio can be outside [0,1] on static-track verified-target routing | Tests assert finite + offline flags, not [0,1] bounds |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-11 | Start Step 1 | Offline regret/CS report; GitNexus impact LOW on harness helpers |
| 2026-07-11 | Step 1 complete | Script + npm `routing:llmrouterbench-regret` + 3 unit tests; committed |
| 2026-07-11 | Step 2 outcomes | PROVENANCE + README + routing-roadmap §5 Phase 4 note |

## Blockers

None.

## Notes

- 2026-07-11: Contract amended — `fileScopeMustChange` redirected off pre-landed `PROVENANCE.md` (SP-192).
