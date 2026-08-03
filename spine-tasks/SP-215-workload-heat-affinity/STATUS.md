# SP-215: Workload Heat Map + Soft Fleet Affinity — Status

**Current Step:** 3
**Status:** 🔄 In Progress
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Heat schema + persistence + soft bias

**Status:** ✅ Complete

- [x] Privacy-safe heat record (no prompt text)
- [x] Persist histogram with provenance
- [x] Soft-bias first-turn via expected-cost
- [x] Unit tests for soft-bias

**Plan-review checkpoint** — No raw prompt text; shortfall gates hard.

## Step 2: Hysteresis + export/clear + dogfood pointer

**Status:** ✅ Complete

- [x] Pin-safe hysteresis (~25% + swap cap)
- [x] Export/import/clear documented
- [x] Dogfood protocol pointer
- [x] No frugality/gate flips

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand`
- [ ] Related expected-cost / pinning tests if touched
- [ ] `npm run verify:ci` if time allows
- [ ] coverage:check ≥77%
- [ ] #115 comment / closable

---

## Completion Criteria

- [ ] Heat + persist without prompt text
- [ ] Soft-bias first-turn; shortfall/gates preserved
- [ ] Hysteresis at pin-safe boundaries
- [ ] Export/clear documented
- [ ] #115 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| 2026-08-03 | 1 | plan | skipped (engine-owned, SP-195) |
| 2026-08-03 | 2 | plan | skipped (engine-owned, SP-195) |

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.15.0 Colibri theme. Disjoint from SP-216 (hardware/commands) and SP-217 (pipeline prewarm).
