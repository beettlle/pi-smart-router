**Current Step:** Step 2: Train, ship or Partial
**Status:** In Progress
**Last Updated:** 2026-07-12
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Locate exports + aggregate

**Status:** Complete

- [x] Operator export path(s) recorded
- [x] Privacy spot-check
- [x] Aggregate train file produced
- [x] Sample counts in Discoveries

> Path (B): no #95 exports; aggregation skipped; counts = 0. Privacy N/A (no training input).

## Step 2: Train, ship or Partial

**Status:** In Progress

- [x] Train when floors met OR Partial writeup when not
- [x] Provenance non-synthetic when shipping
- [x] README status updated

> Path (B): Partial writeup at `spine-tasks/_authoring/release-v0.12.0/behavioral-calibration-partial.md`. No ship; configs unchanged (synthetic provenance retained honestly). README deferred status updated.

## Step 3: Testing & Verification

**Status:** Not Started

- [ ] Contract `testCommand`
- [ ] verify-calibration / dry-run as applicable
- [ ] `npm run verify:ci`
- [ ] coverage:check if code/tests changed
- [ ] #110 close or Partial comment

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-07-12 | 1 | plan | skipped (engine post-.DONE; SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| 2026-07-12 | Export paths: none (operator confirmed path B) | Cannot train behavioral artifacts |
| 2026-07-12 | Privacy spot-check: N/A — no training input files present | No prompt/message bodies to reject |
| 2026-07-12 | Aggregated train file: not produced (no source exports) | Floor unmet |
| 2026-07-12 | Sample counts: economical-tier labeled = **0** (floor ≥30) | Path (B) Partial required |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| 2026-07-12 | Step 1 start | Path (B) Partial — skip aggregate/train; document counts=0 |
| 2026-07-12 | Step 1 complete | counts=0; no aggregate; plan review skipped by engine |
| 2026-07-12 | Step 2 start | Write Partial artifact + README deferred status |
| 2026-07-12 | Step 2 outcomes | Partial md written; configs untouched; README updated |

## Blockers

| Date | Blocker | Resolution |
|------|---------|------------|
| 2026-07-12 | External: #95 exports | Operator chose path (B) Partial — no exports yet; do not invent labels |

## Notes

Release: v0.12.0. Closes #110 when floors met.
**Operator 2026-07-12:** No #95 dogfood exports available. Execute Contract path **(B) Partial** only:
- Write `spine-tasks/_authoring/release-v0.12.0/behavioral-calibration-partial.md` (counts = 0; blocker = no #95 exports)
- Do **not** overwrite `config/p-success-weights.json` or invent `config/routing-calibration.json` as behavioral
- Update `README.md` calibration status to deferred / Partial
- Leave #110 open; comment Partial on the issue
- Export paths: none
