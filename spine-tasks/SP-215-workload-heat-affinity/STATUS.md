# SP-215: Workload Heat Map + Soft Fleet Affinity — Status

**Current Step:** 1
**Status:** ⬜ Not Started
**Last Updated:** 2026-08-02
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Heat schema + persistence + soft bias

**Status:** ⬜ Not Started

- [ ] Privacy-safe heat record (no prompt text)
- [ ] Persist histogram with provenance
- [ ] Soft-bias first-turn via expected-cost
- [ ] Unit tests for soft-bias

**Plan-review checkpoint** — No raw prompt text; shortfall gates hard.

## Step 2: Hysteresis + export/clear + dogfood pointer

**Status:** ⬜ Not Started

- [ ] Pin-safe hysteresis (~25% + swap cap)
- [ ] Export/import/clear documented
- [ ] Dogfood protocol pointer
- [ ] No frugality/gate flips

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

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.15.0 Colibri theme. Disjoint from SP-216 (hardware/commands) and SP-217 (pipeline prewarm).
