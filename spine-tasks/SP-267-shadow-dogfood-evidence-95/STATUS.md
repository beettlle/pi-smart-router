# SP-267 — Produce human dogfood evidence artifact for release gates. — Status

**Current Step:** done
**Status:** Complete
**Last Updated:** 2026-09-06
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 0: Preflight

**Status:** Complete

- [x] Confirm SP-266 protocol commands
- [x] Operator schedules dogfood sessions — confirmed status: **not scheduled / no exports present** (human-owned; documented in Blockers)

## Step 1: Collect + write evidence

**Status:** Complete

- [x] Run protocol / attach exports — offline dry-runs run; no operator exports exist (0 human rows; documented, not invented)
- [x] Write shadow-dogfood-evidence.md with counts + recommendation — `spine-tasks/_authoring/release-v1.0.0/shadow-dogfood-evidence.md`: floor UNMET, recommendation KEEP frugality / conditional quality posture / #95 needs more data

## Step 2: Testing & Verification

**Status:** Complete

- [x] Contract testCommand green — `npm run typecheck` (tsc --noEmit) no errors; `npm test` 122 files / 2169 tests passed
- [x] No synthetic invented labels — synthetic fixture used only for soft-feed CLI validation and explicitly excluded from evidence counts

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-09-06 | 1 | plan | skipped (engine-run post-.DONE, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-09-06 | Step 0 complete | SP-266 STATUS + protocol read; commands confirmed; no operator exports found in `data/contrib/` or `.pi-smart-router/qa-runs/` |
| 2026-09-06 | Step 1 complete | Offline evidence collected: functional-smoke PASS; corpus soft-report FAIL (over-routing 0.868, expected soft signal); soft-feed dry-run on synthetic fixture PASS (scaffold only); contrib count labeled_econ=1/30 (synthetic example row). Evidence artifact written with floor UNMET + KEEP-frugality recommendation |
| 2026-09-06 | Step 2 complete | typecheck green; npm test 2169/2169 green; no invented labels |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| 2026-09-06 | Live dogfood session collection is human-owned; no operator exports present — #95 sample floor unmet | Documented honestly in `shadow-dogfood-evidence.md`; artifact closes SP-267 via the "documents unmet floor" contract path; #95 itself remains open pending human sessions |
