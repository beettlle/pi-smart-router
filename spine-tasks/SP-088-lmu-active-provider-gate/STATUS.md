# SP-088 Status

**Current Step:** Step 0: Not started
**Status:** Ready
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** S

---

## Step 1: Active-provider gate helper

**Status:** Not Started

- [ ] Add `isSmartRouterActive(model)`
- [ ] Wrap `setLmuStatus` to no-op when not smart-router/auto

## Step 2: model_select + session_start hooks

**Status:** Not Started

- [ ] Register `model_select` clear/restore behavior
- [ ] Gate `session_start` LMU restore on active provider

## Step 3: Tests

**Status:** Not Started

- [ ] Unit tests for LMU gating
- [ ] Run `npm run typecheck && npm test`

## Completion Criteria

- [ ] All acceptance criteria from PROMPT met
- [ ] Tests pass
