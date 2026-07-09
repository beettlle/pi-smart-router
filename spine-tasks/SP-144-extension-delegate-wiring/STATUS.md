**Current Step:** 1
**Status:** Ready
**Last Updated:** 2026-07-09
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0

---

## Step 1: Delegate handler in extension

- [ ] Read planning_delegate from routing decision / middleware contract
- [ ] Build compressed context payload per SP-142 limits
- [ ] Spawn ephemeral sub-agent (or pi-supported delegate API) on frontier model

## Step 2: Primary path preservation and fallback

- [ ] Keep primary inference on pinned tier when delegate succeeds
- [ ] Inject sub-agent result as observation
- [ ] Fallback to direct route or clear operator message when spawn unavailable

## Step 3: Testing and verification

- [ ] Extension unit tests with mocked sub-agent spawn
- [ ] Run `npm run verify:ci`

## Completion Criteria

- [ ] Extension wires planning delegate spawn per #71
- [ ] Compressed context and fallback documented in code paths
- [ ] Unit tests cover delegate and fallback
- [ ] `npm run verify:ci` passes

## Reviews

| Date | Step | Type | Outcome |
|------|------|------|---------|
| | | | |

## Discoveries
