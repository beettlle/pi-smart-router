**Current Step:** Step 1: Sentinel format spike
**Status:** Ready
**Last Updated:** 2026-07-08
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** S

---

## Step 1: Sentinel format spike

**Status:** Not Started

- [ ] Read pi-ai Google serializer for thoughtSignature wire format
- [ ] Document chosen sentinel value in code comment

## Step 2: Implement repair helpers

**Status:** Not Started

- [ ] Add isGoogleDelegationTarget and Google-origin assistant detector
- [ ] Implement repairGeminiReplayContext

## Step 3: Unit tests

**Status:** Not Started

- [ ] Signature preserved when present
- [ ] Sentinel injected when absent
- [ ] Cross-model identity aligned to target model
- [ ] OpenAI/Anthropic messages unchanged

## Step 4: Testing and verification

**Status:** Not Started

- [ ] Run npm run typecheck && npm test

---

## Completion Criteria

- [ ] repairGeminiReplayContext exported and unit-tested
- [ ] Google-origin detector exported for SP-129
- [ ] No extension or routing guard changes
- [ ] Tests pass

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

GitHub #85. Depends on SP-075/SP-077 landed behavior as baseline only.
