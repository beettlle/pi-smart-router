# SP-216: Local Placement Plan / Doctor + Cold vs Warm TPS — Status

**Current Step:** 1
**Status:** 🔄 In Progress
**Last Updated:** 2026-08-03
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Placement report + cold/warm TPS

**Status:** 🔄 In Progress

- [x] Placement plan module (read-only)
- [x] Cold vs warm TPS classification
- [x] JSON-stable report shape
- [x] Unit tests

**Plan-review checkpoint** — Report never mutates route / pin / gates.

## Step 2: Operator commands + README policy

**Status:** ⬜ Not Started

- [ ] `/smart-router plan` and/or `doctor`
- [ ] Quality-preserving policy documented
- [ ] README operator docs

## Step 3: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Contract `testCommand`
- [ ] Related hardware / command tests if touched
- [ ] `npm run verify:ci` if time allows
- [ ] coverage:check ≥77%
- [ ] #116 comment / closable

---

## Completion Criteria

- [ ] Read-only plan/doctor JSON-stable
- [ ] Cold vs warm TPS tested
- [ ] Quality-preserving policy documented
- [ ] #116 closable

---

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|

## Discoveries

| Date | Finding | Impact |
|------|---------|--------|

## Notes

Release v0.15.0 Colibri theme. Owns README; disjoint from SP-215 (heat/expected-cost) and SP-217 (pipeline prewarm).
