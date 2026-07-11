# SP-188: TwinRouterBench Corpus Gates + Docs — Status

**Current Step:** 1
**Status:** 🟡 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Wire harness CI + npm scripts

**Status:** 🟡 In Progress (outcomes done; awaiting commit)

- [x] Corpus harness npm script(s)
- [x] eval-harness-smoke.yml corpus step
- [x] Default fixture smoke still green

## Step 2: assert-release-gates + #95 docs

**Status:** 🟡 In Progress

- [x] Corpus path support without threshold edits
- [x] README pin/subset/CI/#95 feed
- [x] RouterBench classic deferred unless trivial

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract testCommand
- [ ] Corpus smoke + release:functional-smoke / documented separation
- [ ] verify:ci + coverage ≥77%

---

## Completion Criteria

- [ ] Corpus CI smoke offline/bounded
- [ ] Operator docs complete
- [ ] #95 path documented
- [ ] Absolute thresholds unchanged
- [ ] verify:ci green
- [ ] #101 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Corpus subset mean_over_routing_rate ≈0.85 vs absolute max 0.15 — keep corpus as smoke/report, not release:functional-smoke | Document gap for #95; do not change release-gates.json |
| 2026-07-10 | docs/routing-roadmap.md §5 still says offline eval harness is a Gap — stale vs landed SP-152+; out of File Scope | Noted only; no edit |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 started | Plan review skipped by engine; wiring corpus smoke |
| 2026-07-10 | Step 1 outcomes | corpus-smoke script + workflow step; default smoke green |
| 2026-07-10 | Step 2 outcomes | --report-only + corpus-report script; README #95 feed |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

2026-07-10: Amendment 1 — dropped package.json from fileScopeMustChange (pre-landed by SP-186).
