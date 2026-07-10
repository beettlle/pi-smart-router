# SP-176: Triage Repo-Cleanup Tier — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Deterministic cleanup / destructive signals

**Status:** ✅ Complete

- [x] Extend triage and/or turn-envelope for repo-hygiene / destructive-intent ≥ economical-cloud
- [x] Keep keyword/pattern style consistent with existing sets
- [x] Do not change `router-pipeline.ts`

## Step 2: Fixture + regression tests

**Status:** 🔄 In Progress

- [x] Cleanup fixture → tier ≥ economical-cloud; never zero-tier turn 1 with local ready
- [x] Trivial format/lint still local-eligible
- [x] Unit coverage without editing pipeline source

## Step 3: Testing and verification

**Status:** ⬜ Not Started

- [ ] Run scoped vitest
- [ ] Run full `npm test`
- [ ] Run coverage gate

---

## Completion Criteria

- [x] Deterministic signals treat repo-hygiene / destructive-intent as ≥ economical-cloud
- [x] Cleanup fixture never zero-tier on turn 1 with local ready
- [x] Trivial prompts remain local-eligible when appropriate
- [x] Unit coverage for fixture path

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-10 | 1 | plan | skipped (engine-owned after .DONE) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-10 | Dogfood #97 used “Help me clean up the repo”; fixture is longer “mistakenly added files” phrasing. Both need signals. | Keywords must cover short + long forms |
| 2026-07-10 | `turn_envelope` needs `messages`; triage uses `prompt_text`. Primary fix is COMPLEX_KEYWORDS; envelope patterns cover message-bearing turns. | Dual-path signals |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-10 | Step 1 started | Plan: add COMPLEX_KEYWORDS + PLANNING_PATTERNS for repo-hygiene/destructive; impact LOW |
| 2026-07-10 | Step 1 complete | COMPLEX_KEYWORDS + PLANNING_PATTERNS landed; plan review skipped by engine |
| 2026-07-10 | Step 2 in progress | Fixture + regression tests added; scoped vitest 157 passed |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| | | |

## Notes

**Step 1 plan (pre-review):**
1. Extend `COMPLEX_KEYWORDS` with repo-hygiene / destructive phrases (`clean up the repo`, `mistakenly added`, `accidentally added`, `rm -rf`, `force push`, etc.) so triage → `complex` → frontier (≥ economical-cloud), blocking `local_zero`.
2. Extend `PLANNING_PATTERNS` in turn-envelope with matching regexes so message envelopes are not stuck on `main_loop`.
3. Keep format/lint trivial keywords unchanged.
