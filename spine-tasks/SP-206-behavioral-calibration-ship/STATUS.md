**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-07-12
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Locate exports + aggregate

**Status:** Not Started

- [ ] Operator export path(s) recorded
- [ ] Privacy spot-check
- [ ] Aggregate train file produced
- [ ] Sample counts in Discoveries

> ⚠️ Hydrate: Expand with exact export paths and row counts from operator #95 window.

## Step 2: Train, ship or Partial

**Status:** Not Started

- [ ] Train when floors met OR Partial writeup when not
- [ ] Provenance non-synthetic when shipping
- [ ] README status updated

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
| | | | |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|
| | | |

## Execution Log

| Date | Event | Detail |
|------|-------|--------|
| | | |

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
