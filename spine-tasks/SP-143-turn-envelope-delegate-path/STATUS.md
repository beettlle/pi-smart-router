**Current Step:** 1
**Status:** Ready
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Delegate decision in turnEnvelope

- [ ] Detect planning turn + warm economical pin + capability need for frontier reasoning
- [ ] Emit `planning_delegate` decision with compressed-context hints per SP-142 contract
- [ ] Preserve SAAR buffer deferral and hard-lock behavior

## Step 2: Fallback and explain

- [ ] When delegate disabled/unavailable, use direct route with documented reason
- [ ] Wire explain/telemetry fields from SP-142

## Step 3: Testing and verification

- [ ] Unit tests: delegate path keeps primary pin tier
- [ ] Integration test: planning turn does not switch primary inference model when delegate active
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] turn_envelope implements planning delegate path per #71
- [ ] Primary stays pinned when delegate active
- [ ] Tests cover delegate and fallback
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries
