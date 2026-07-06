# SP-088 Status

**Current Step:** Complete
**Status:** Done
**Last Updated:** 2026-07-06
**Review Level:** 1
**Size:** S

---

## Step 1: Active-provider gate helper

**Status:** Complete

- [x] Add `isSmartRouterActive(model)`
- [x] Wrap `setLmuStatus` to no-op when not smart-router/auto

## Step 2: model_select + session_start hooks

**Status:** Complete

- [x] Register `model_select` clear/restore behavior
- [x] Gate `session_start` LMU restore on active provider

## Step 3: Tests

**Status:** Complete

- [x] Unit tests for LMU gating
- [x] Run `npm run typecheck && npm test`

## Completion Criteria

- [x] All acceptance criteria from PROMPT met
- [x] Tests pass
