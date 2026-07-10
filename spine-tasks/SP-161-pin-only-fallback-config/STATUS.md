**Current Step:** Step 1
**Status:** Pending
**Last Updated:** 2026-07-10
**Review Level:** 1
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Config schema

**Status:** Pending

- [ ] Add `pin_only_fallback: boolean` to operator config (default `false`)
- [ ] Document emergency-only posture in config example

## Step 2: Session pin and pipeline wiring

**Status:** Pending

- [ ] When `pin_only_fallback` enabled, pin on first turn and short-circuit later stages
- [ ] Integrate with session pinner `use_pin` path
- [ ] Preserve normal multi-stage routing when flag off

## Step 3: Testing and verification

**Status:** Pending

- [ ] Integration test: config on → pin-only behavior; config off → normal routing
- [ ] Run `npm run verify:ci`

---

## Completion Criteria

- [ ] `pin_only_fallback` config toggles behavior
- [ ] Integration test for pin-only mode
- [ ] Documented as emergency mode, not default
- [ ] `npm run verify:ci` passes

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
| | | |

## Notes
