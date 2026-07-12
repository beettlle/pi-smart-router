# SP-203: Track B Dogfood Export → Harness Adapter — Status

**Current Step:** 2
**Status:** 🔄 In Progress
**Last Updated:** 2026-07-12
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Schema + adapter module

**Status:** ✅ Complete

- [x] dogfood-track-b-adapter.ts
- [x] Document required fields / skip on missing labels
- [x] Example fixture

## Step 2: Wire resolveTrackB + tests + docs

**Status:** 🔄 In Progress

- [x] resolveTrackB wiring
- [x] Unit test updates
- [x] README Track B section
- [x] Optional QA protocol note

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract tests
- [ ] community-bench smoke
- [ ] verify:ci
- [ ] coverage:check
- [ ] Close #111

---

## Completion Criteria

- [x] Schema + adapter
- [x] Run vs skip without inventing labels
- [x] Tests + fixture
- [x] README
- [ ] #111 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-12 | 1 | plan | skipped (engine-owned; spawnFailed=false) |
| 2026-07-12 | 2 | plan | skipped (engine-owned; spawnFailed=false) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-12 | `community-bench-report.ts` types Track B as skip-only (`SkippedTrackSchema`). AC requires ran + gate metrics — must extend report schema. Not in Must NOT; not listed in Must/May. | Touched `scripts/eval/community-bench-report.ts` for Track B ran union + skip reasons. |
| 2026-07-12 | Telemetry-contrib has optional `success_label` but no `min_tier`. Track B export schema must require explicit outcome labels (`success_label`, `min_tier`, `min_model_id`) — never invent from routing tier alone. | Adapter refuses incomplete rows. |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-12 | start | Resume Step 1; plan review skipped by engine |
| 2026-07-12 | step1 | Adapter + synthetic fixture committed; plan review skipped; advancing to Step 2 |
| 2026-07-12 | step2 | Wired resolveTrackB; report schema; tests + README + QA note; unit tests green |

## Blockers

None.
