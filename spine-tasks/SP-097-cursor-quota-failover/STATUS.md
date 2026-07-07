# SP-097 Status

**Current Step:** Step 1
**Status:** Not Started
**Last Updated:** 2026-07-06
**Review Level:** 2
**Size:** M

---

## Step 1: Quota error detection

**Status:** Not Started

- [ ] Identify Cursor usage-limit error patterns
- [ ] Add quota-exhausted classifier helper

## Step 2: Failover dispatch

**Status:** Not Started

- [ ] Retry with cursor/auto or economical model on quota error
- [ ] Emit cursor_quota_exhausted reason code

## Step 3: Tests and verification

**Status:** Not Started

- [ ] Failover path test
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] `npm run verify:ci` passes
