# SP-252: fail_closed_on_missing_weights + sandwich integration — Status

**Current Step:** 0
**Status:** Not Started
**Last Updated:** 2026-09-02
**Review Level:** 1
**Size:** S

---

## Step 0: Preflight

**Status:** ⬜ Not Started

- [ ] Confirm SP-251 reason codes are importable
- [ ] Choose schema home (operator vs degraded_route nested)

## Step 1: Config + fail-closed behavior

**Status:** ⬜ Not Started

- [ ] Add Zod field + default false
- [ ] Honor flag in matcher / pipeline fail-closed path
- [ ] Align sandwich reason codes with SP-251 codes where applicable

## Step 2: Testing & Verification

**Status:** ⬜ Not Started

- [ ] Unit tests: default fail-open; fail-closed when enabled
- [ ] Contract `testCommand` green
- [ ] #148 closable with SP-251

## Completion Criteria

- [ ] Fail-closed option + sandwich integration complete; #148 closable

## Discoveries

- (none yet)
