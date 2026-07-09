**Current Step:** Step 1: Narrow replay-risk detector
**Status:** Ready
**Last Updated:** 2026-07-08
**Review Level:** 2
**Review Counter:** 0
**Iteration:** 0
**Size:** M

---

## Step 1: Narrow replay-risk detector

**Status:** Not Started

- [ ] Add hasGoogleReplayRisk using SP-127 Google-origin helpers
- [ ] Replace hasToolCallHistory usage in resolveEffectiveFleet
- [ ] Remove hard Gemini exclusion when repair path applies

## Step 2: Align SP-080 deprioritize

**Status:** Not Started

- [ ] Update prioritizeFleetForToolHistory to use same detector
- [ ] Keep deprioritize semantics for residual Google replay risk if any

## Step 3: Tests

**Status:** Not Started

- [ ] OpenAI tool history + Gemini in fleet — Gemini not excluded
- [ ] Update extension tests that assumed SP-077 blunt exclusion
- [ ] SP-084 empty-fleet behavior still correct for edge cases

## Step 4: Testing and verification

**Status:** Not Started

- [ ] Run npm run typecheck && npm test

---

## Completion Criteria

- [ ] OpenAI-only tool sessions can route to economical Gemini
- [ ] Google tool sessions rely on SP-128 repair, not blunt ban
- [ ] Telemetry reason code preserved where exclusion still applies
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

GitHub #85. Blocked on SP-127. Supersedes SP-077 exclusion semantics.
