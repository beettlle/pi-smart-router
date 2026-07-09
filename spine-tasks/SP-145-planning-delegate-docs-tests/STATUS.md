**Current Step:** 1
**Status:** Ready
**Last Updated:** 2026-07-09
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Integration test

- [ ] Add `tests/integration/planning-delegate.test.ts` (or extend session-pinning)
- [ ] Assert planning turn does not switch primary inference model when delegate path active
- [ ] Assert explain output documents delegate vs direct route

## Step 2: Operator documentation

- [ ] Document planning_delegate config and fallback in README or docs
- [ ] Note coordination boundary with pi core sub-agent orchestration

## Step 3: Testing and verification

- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Integration test covers #71 verification checklist
- [ ] Operator docs updated
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries
